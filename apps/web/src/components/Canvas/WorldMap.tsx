import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { translate, translateLabel, useLocale } from '../../i18n';
import { useAgents, useNotableEvents, useResourceSpawns, useShelters, useWorldStore, type Agent, type WorldEvent } from '../../stores/world';
import { useHeatmapSettings, useVisualizationStore, type HeatmapMetric } from '../../stores/visualization';
import { CanvasPanControls } from './CanvasPanControls';

const TILE = 12;
const GRID = 100;
const FIELD = TILE * GRID;
const AGENT_RADIUS = 5;
const RULER = 22;
const MIN_ZOOM = 0.5, MAX_ZOOM = 3;
/** How long a spoken line stays drawn between speaker and listeners. */
const ARC_MS = 8000;

const INK = { night: '#0b0f14', field: '#0f141b', rule: '#27313e', mist: '#8a96a6', star: '#e4e8ee', brass: '#cfa65e', alert: '#e07a6a' };
const RESOURCE_COLORS: Record<string, string> = { food: '#6f9e7c', energy: '#9a9460', material: '#8a7563' };
const BIOMES: Array<{ key: 'Forest' | 'Tundra' | 'Desert' | 'Plains'; tint: string; x: number; y: number }> = [
  { key: 'Forest', tint: '#9fd3a8', x: 0, y: 0 }, { key: 'Tundra', tint: '#8fb8de', x: 50, y: 0 },
  { key: 'Desert', tint: '#e39a7a', x: 0, y: 50 }, { key: 'Plains', tint: '#d4d08a', x: 50, y: 50 },
];
const HEAT_RAMP = ['#2a2416', '#5c4a26', '#8f7440', '#cfa65e', '#ecd5a3'];
const EXCHANGE = new Set(['agent_gave', 'agent_traded']), FORCE = new Set(['agent_harmed', 'agent_stole']);

function eventPosition(event: WorldEvent, byId: Map<string, Agent>): { x: number; y: number } | undefined {
  const p = event.payload ?? {};
  if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y };
  const position = p.position as { x?: number; y?: number } | undefined;
  if (typeof position?.x === 'number' && typeof position?.y === 'number') return { x: position.x, y: position.y };
  const agent = event.agentId ? byId.get(event.agentId) : undefined;
  return agent ? { x: agent.x, y: agent.y } : undefined;
}

function heatGrid(metric: HeatmapMetric, agents: Agent[], resources: ReturnType<typeof useResourceSpawns>, notable: WorldEvent[], byId: Map<string, Agent>): Float32Array | null {
  if (metric === 'none') return null;
  const grid = new Float32Array(GRID * GRID);
  const add = (x: number, y: number, weight: number, radius: number) => {
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
      const nx = Math.floor(x) + dx, ny = Math.floor(y) + dy, d = Math.hypot(dx, dy);
      if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID && d <= radius) grid[ny * GRID + nx] += weight / (1 + d);
    }
  };
  if (metric === 'agent_density') for (const agent of agents) { if (agent.health > 0) add(agent.x, agent.y, 1, 3); }
  else if (metric === 'resource_density') for (const r of resources) add(r.x, r.y, r.currentAmount / Math.max(1, r.maxAmount), 3);
  else {
    const types = metric === 'speech' ? new Set(['agent_spoke']) : metric === 'exchange' ? EXCHANGE : FORCE;
    for (const event of notable) { if (!types.has(event.type)) continue; const at = eventPosition(event, byId); if (at) add(at.x, at.y, 1, 3); }
  }
  let max = 0; for (const value of grid) max = Math.max(max, value);
  if (max === 0) return grid;
  for (let i = 0; i < grid.length; i++) grid[i] /= max;
  return grid;
}

export function WorldMap({ showTools = true }: { showTools?: boolean }) {
  const locale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 });
  const [zoom, setZoom] = useState(0.5);
  const [camera, setCamera] = useState({ x: -FIELD / 2 * 0.5, y: -FIELD / 2 * 0.5 });
  const drag = useRef<{ x: number; y: number; camera: { x: number; y: number }; moved: boolean } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number; center: { x: number; y: number } } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fitted = useRef(false);

  const agents = useAgents();
  const resources = useResourceSpawns();
  const shelters = useShelters();
  const notable = useNotableEvents();
  const selectedAgentId = useWorldStore(s => s.selectedAgentId);
  const selectedResourceId = useWorldStore(s => s.selectedResourceId);
  const selectAgent = useWorldStore(s => s.selectAgent);
  const selectResource = useWorldStore(s => s.selectResource);
  const { metric, opacity, enabled } = useHeatmapSettings();
  const byId = useMemo(() => new Map(agents.map(agent => [agent.id, agent])), [agents]);
  const heat = useMemo(() => (enabled ? heatGrid(metric, agents, resources, notable, byId) : null), [enabled, metric, agents, resources, notable, byId]);
  // The clock state can lag a just-arrived line; such a line counts as age zero, never negative.
  const arcs = useMemo(() => notable.filter(event => event.type === 'agent_spoke' && now - event.timestamp < ARC_MS), [notable, now]);

  // Keep the clock moving only while a spoken line is fading.
  useEffect(() => {
    const latest = notable.find(event => event.type === 'agent_spoke');
    if (!latest || Date.now() - latest.timestamp >= ARC_MS) return;
    setNow(Date.now());
    const timer = setInterval(() => { const t = Date.now(); setNow(t); if (t - latest.timestamp >= ARC_MS) clearInterval(timer); }, 120);
    return () => clearInterval(timer);
  }, [notable]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height), dpr: window.devicePixelRatio || 1 });
      // Fit the whole world in view the first time the map has a size.
      if (!fitted.current && rect.width > 0 && rect.height > 0) {
        fitted.current = true;
        const fit = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(rect.width - RULER - 48, rect.height - RULER - 96) / FIELD)) * 100) / 100;
        setZoom(fit);
        setCamera({ x: -FIELD / 2 * fit + RULER / 2, y: -FIELD / 2 * fit + RULER / 2 - 16 });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || size.width === 0 || size.height === 0) return;
    const { width, height, dpr } = size;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = INK.night;
    ctx.fillRect(0, 0, width, height);

    const ox = width / 2 + camera.x, oy = height / 2 + camera.y;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(zoom, zoom);

    ctx.fillStyle = INK.field;
    ctx.fillRect(0, 0, FIELD, FIELD);
    for (const biome of BIOMES) {
      ctx.globalAlpha = 0.06; ctx.fillStyle = biome.tint;
      ctx.fillRect(biome.x * TILE, biome.y * TILE, 50 * TILE, 50 * TILE);
      ctx.globalAlpha = 0.28; ctx.fillStyle = biome.tint;
      ctx.font = `600 ${13 / zoom}px 'Barlow Condensed', sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(translateLabel(biome.key).toUpperCase().split('').join(String.fromCharCode(8202)), biome.x * TILE + 10 / zoom, biome.y * TILE + 22 / zoom);
    }
    ctx.globalAlpha = 1;

    if (heat) {
      for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
        const value = heat[y * GRID + x];
        if (value < 0.05) continue;
        ctx.globalAlpha = opacity * Math.min(1, value + 0.15);
        ctx.fillStyle = HEAT_RAMP[Math.min(HEAT_RAMP.length - 1, Math.floor(value * HEAT_RAMP.length))];
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
      ctx.globalAlpha = 1;
    }

    ctx.lineWidth = 1 / zoom;
    if (zoom >= 0.8) {
      ctx.strokeStyle = 'rgba(255,255,255,0.025)';
      ctx.beginPath();
      for (let i = 0; i <= GRID; i++) { if (i % 10) { ctx.moveTo(i * TILE, 0); ctx.lineTo(i * TILE, FIELD); ctx.moveTo(0, i * TILE); ctx.lineTo(FIELD, i * TILE); } }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    for (let i = 0; i <= GRID; i += 10) { ctx.moveTo(i * TILE, 0); ctx.lineTo(i * TILE, FIELD); ctx.moveTo(0, i * TILE); ctx.lineTo(FIELD, i * TILE); }
    ctx.stroke();
    ctx.strokeStyle = INK.rule;
    ctx.strokeRect(0, 0, FIELD, FIELD);

    for (const shelter of shelters) {
      ctx.strokeStyle = INK.mist; ctx.lineWidth = 1.2 / zoom;
      ctx.strokeRect(shelter.x * TILE + 2, shelter.y * TILE + 2, TILE - 4, TILE - 4);
    }
    for (const spawn of resources) {
      const fill = Math.max(0, Math.min(1, spawn.currentAmount / Math.max(1, spawn.maxAmount)));
      const side = (TILE - 4) * Math.max(0.35, fill);
      ctx.globalAlpha = 0.35 + 0.65 * fill;
      ctx.fillStyle = RESOURCE_COLORS[spawn.resourceType] ?? INK.mist;
      ctx.fillRect(spawn.x * TILE + (TILE - side) / 2, spawn.y * TILE + (TILE - side) / 2, side, side);
      ctx.globalAlpha = 1;
      if (spawn.id === selectedResourceId) { ctx.strokeStyle = INK.brass; ctx.lineWidth = 2 / zoom; ctx.strokeRect(spawn.x * TILE - 1, spawn.y * TILE - 1, TILE + 2, TILE + 2); }
    }

    // Spoken lines: brass arcs from the speaker to everyone who heard, fading out.
    const center = (x: number, y: number) => [x * TILE + TILE / 2, y * TILE + TILE / 2] as const;
    for (const event of arcs) {
      const age = Math.min(1, Math.max(0, (now - event.timestamp) / ARC_MS));
      const from = eventPosition(event, byId); if (!from) continue;
      const [sx, sy] = center(from.x, from.y);
      const listeners = Array.isArray(event.payload.listenerIds) ? event.payload.listenerIds as string[] : [];
      const addressed = typeof event.payload.to === 'string' ? event.payload.to : undefined;
      ctx.strokeStyle = INK.brass;
      for (const id of listeners) {
        const listener = byId.get(id); if (!listener) continue;
        const [tx, ty] = center(listener.x, listener.y);
        const mx = (sx + tx) / 2, my = (sy + ty) / 2, dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy) || 1;
        const bend = Math.min(40, len * 0.25);
        ctx.globalAlpha = (1 - age) * (id === addressed ? 0.95 : 0.55);
        ctx.lineWidth = (id === addressed ? 2 : 1.2) / zoom;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx - (dy / len) * bend, my + (dx / len) * bend, tx, ty); ctx.stroke();
      }
      ctx.globalAlpha = (1 - age) * 0.8; ctx.lineWidth = 1 / zoom;
      ctx.beginPath(); ctx.arc(sx, sy, AGENT_RADIUS + 4 + age * 10, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const radius = Math.max(AGENT_RADIUS, 4.5 / zoom);
    const stacked = new Map<string, Agent[]>();
    for (const agent of agents) { const key = `${agent.x},${agent.y}`; stacked.set(key, [...(stacked.get(key) ?? []), agent]); }
    for (const [, group] of stacked) group.forEach((agent, index) => {
      const angle = (index / group.length) * Math.PI * 2;
      const offset = group.length > 1 ? radius * 0.9 : 0;
      const [cx, cy] = center(agent.x, agent.y);
      const x = cx + Math.cos(angle) * offset, y = cy + Math.sin(angle) * offset;
      const dead = agent.state === 'dead' || agent.health <= 0;
      if (dead) { ctx.strokeStyle = INK.mist; ctx.lineWidth = 1.2 / zoom; ctx.beginPath(); ctx.arc(x, y, radius - 1 / zoom, 0, Math.PI * 2); ctx.stroke(); }
      else {
        ctx.fillStyle = INK.night; ctx.beginPath(); ctx.arc(x, y, radius + 1.5 / zoom, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = agent.color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        if (agent.health < 30) { ctx.strokeStyle = INK.alert; ctx.lineWidth = 1.5 / zoom; ctx.beginPath(); ctx.arc(x, y, radius + 2 / zoom, 0, Math.PI * 2); ctx.stroke(); }
      }
      const selected = agent.id === selectedAgentId;
      if (selected) { ctx.strokeStyle = INK.brass; ctx.lineWidth = 2 / zoom; ctx.beginPath(); ctx.arc(x, y, radius + 4 / zoom, 0, Math.PI * 2); ctx.stroke(); }
      if (selected || zoom >= 0.9 || agents.length <= 12) {
        ctx.font = `500 ${11 / zoom}px 'IBM Plex Sans', sans-serif`; ctx.textAlign = 'left';
        ctx.fillStyle = selected ? INK.star : INK.mist;
        ctx.fillText(agent.name ?? agent.llmType, x + radius + 5 / zoom, y + 4 / zoom);
      }
    });
    ctx.restore();

    // Rulers: graduated edges fixed to the view, reading world coordinates like an instrument scale.
    ctx.fillStyle = 'rgba(11,15,20,0.92)';
    ctx.fillRect(0, 0, width, RULER); ctx.fillRect(0, 0, RULER, height);
    ctx.strokeStyle = INK.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(RULER, RULER - 0.5); ctx.lineTo(width, RULER - 0.5); ctx.moveTo(RULER - 0.5, RULER); ctx.lineTo(RULER - 0.5, height); ctx.stroke();
    const cell = TILE * zoom;
    ctx.font = `400 10px 'IBM Plex Mono', monospace`; ctx.fillStyle = INK.mist;
    ctx.beginPath();
    for (let i = 0; i <= GRID; i++) {
      const major = i % 10 === 0, mid = i % 5 === 0;
      if (!major && !mid && cell < 6) continue;
      const length = major ? 9 : mid ? 6 : 3;
      const x = ox + i * cell, y = oy + i * cell;
      if (x > RULER && x < width) { ctx.moveTo(x + 0.5, RULER); ctx.lineTo(x + 0.5, RULER - length); }
      if (y > RULER && y < height) { ctx.moveTo(RULER, y + 0.5); ctx.lineTo(RULER - length, y + 0.5); }
    }
    ctx.strokeStyle = INK.mist; ctx.stroke();
    ctx.textAlign = 'left';
    for (let i = 0; i <= GRID; i += 10) {
      const x = ox + i * cell, y = oy + i * cell;
      if (x > RULER + 2 && x < width - 16) ctx.fillText(String(i), x + 3, 10);
      if (y > RULER + 10 && y < height) { ctx.save(); ctx.translate(10, y - 3); ctx.rotate(-Math.PI / 2); ctx.fillText(String(i), 0, 0); ctx.restore(); }
    }
    if (selectedAgentId) {
      const agent = byId.get(selectedAgentId);
      if (agent) {
        const x = ox + (agent.x + 0.5) * cell, y = oy + (agent.y + 0.5) * cell;
        ctx.fillStyle = INK.brass;
        if (x > RULER && x < width) { ctx.beginPath(); ctx.moveTo(x, RULER); ctx.lineTo(x - 4, RULER - 6); ctx.lineTo(x + 4, RULER - 6); ctx.fill(); }
        if (y > RULER && y < height) { ctx.beginPath(); ctx.moveTo(RULER, y); ctx.lineTo(RULER - 6, y - 4); ctx.lineTo(RULER - 6, y + 4); ctx.fill(); }
      }
    }
  }, [locale, size, camera, zoom, agents, resources, shelters, heat, opacity, arcs, now, byId, selectedAgentId, selectedResourceId]);

  const clampZoom = (value: number) => Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)) * 100) / 100;
  const zoomAt = useCallback((next: number, sx?: number, sy?: number) => {
    const target = clampZoom(next);
    const px = sx ?? size.width / 2, py = sy ?? size.height / 2;
    const wx = (px - size.width / 2 - camera.x) / zoom, wy = (py - size.height / 2 - camera.y) / zoom;
    setZoom(target);
    setCamera({ x: px - size.width / 2 - wx * target, y: py - size.height / 2 - wy * target });
  }, [camera, zoom, size]);
  const resetCamera = useCallback(() => { setZoom(1); setCamera({ x: -FIELD / 2, y: -FIELD / 2 }); }, []);

  const pick = (clientX: number, clientY: number, slack: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const wx = (clientX - rect.left - size.width / 2 - camera.x) / zoom, wy = (clientY - rect.top - size.height / 2 - camera.y) / zoom;
    const agent = agents.find(a => Math.hypot(wx - (a.x * TILE + TILE / 2), wy - (a.y * TILE + TILE / 2)) < Math.max(AGENT_RADIUS, 4.5 / zoom) + slack / zoom);
    if (agent) { selectAgent(agent.id === selectedAgentId ? null : agent.id); return; }
    const resource = resources.find(r => wx >= r.x * TILE - 2 && wx < r.x * TILE + TILE + 2 && wy >= r.y * TILE - 2 && wy < r.y * TILE + TILE + 2);
    if (resource) { selectResource(resource.id === selectedResourceId ? null : resource.id); return; }
    selectAgent(null); selectResource(null);
  };

  const handleKey = (event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
    if (step[event.key]) { event.preventDefault(); const [x, y] = step[event.key]; setCamera(c => ({ x: c.x + x, y: c.y + y })); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(zoom + 0.2); }
    else if (event.key === '-') { event.preventDefault(); zoomAt(zoom - 0.2); }
    else if (event.key.toLowerCase() === 'r') { event.preventDefault(); resetCamera(); }
  };

  return <div ref={containerRef} className="relative w-full h-full touch-none select-none" style={{ cursor: drag.current ? 'grabbing' : 'grab' }}>
    <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={translate('Interactive world map')} aria-description={translate('Map keyboard help')}
      data-camera-x={camera.x} data-camera-y={camera.y} data-zoom={zoom} className="absolute inset-0" style={{ width: size.width, height: size.height }}
      onKeyDown={handleKey}
      onWheel={event => { if (event.ctrlKey || event.metaKey) return; const rect = event.currentTarget.getBoundingClientRect(); zoomAt(zoom + (event.deltaY > 0 ? -0.1 : 0.1), event.clientX - rect.left, event.clientY - rect.top); }}
      onPointerDown={event => { if (event.pointerType === 'touch' || event.button !== 0) return; drag.current = { x: event.clientX, y: event.clientY, camera, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const d = drag.current; if (!d) return; const dx = event.clientX - d.x, dy = event.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true; setCamera({ x: d.camera.x + dx, y: d.camera.y + dy }); }}
      onPointerUp={event => { const d = drag.current; drag.current = null; if (d && !d.moved) pick(event.clientX, event.clientY, 5); }}
      onPointerCancel={() => { drag.current = null; }}
      onTouchStart={event => {
        if (event.touches.length === 1) { const t = event.touches[0]; drag.current = { x: t.clientX, y: t.clientY, camera, moved: false }; pinch.current = null; }
        else if (event.touches.length === 2) { const [a, b] = [event.touches[0], event.touches[1]]; pinch.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom, center: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 } }; drag.current = null; }
      }}
      onTouchMove={event => {
        if (event.touches.length === 1 && drag.current) { const t = event.touches[0], d = drag.current; const dx = t.clientX - d.x, dy = t.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true; setCamera({ x: d.camera.x + dx, y: d.camera.y + dy }); }
        else if (event.touches.length === 2 && pinch.current) {
          const [a, b] = [event.touches[0], event.touches[1]], p = pinch.current;
          const center = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
          setZoom(clampZoom(p.zoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / p.distance));
          setCamera(c => ({ x: c.x + center.x - p.center.x, y: c.y + center.y - p.center.y })); p.center = center;
        }
      }}
      onTouchEnd={event => { const d = drag.current; if (event.touches.length === 0) { drag.current = null; pinch.current = null; if (d && !d.moved && event.changedTouches.length === 1) pick(event.changedTouches[0].clientX, event.changedTouches[0].clientY, 10); } }}
    />

    {showTools && <MapTools />}
    {showTools && <><div className="map-legend" role="group" aria-label={translate('Map legend')}>
      <span><i style={{ background: RESOURCE_COLORS.food }} />{translate('Food')}</span>
      <span><i style={{ background: RESOURCE_COLORS.energy }} />{translate('Energy')}</span>
      <span><i style={{ background: RESOURCE_COLORS.material }} />{translate('Material')}</span>
      <span><i style={{ border: `1px solid ${INK.mist}` }} />{translate('Shelter')}</span>
      <span><i style={{ background: INK.brass, height: 2, width: 14 }} />{translate('Speech')}</span>
    </div>
    <div className="map-zoom" role="group" aria-label={translate('Map view')}>
      <CanvasPanControls onKeyDown={handleKey} reset={resetCamera} move={(x, y) => setCamera(c => ({ x: c.x - x, y: c.y - y }))} />
      <button type="button" onClick={() => zoomAt(zoom + 0.2)} title={translate('Zoom in')} aria-label={translate('Zoom in')}>+</button>
      <button type="button" onClick={() => zoomAt(zoom - 0.2)} title={translate('Zoom out')} aria-label={translate('Zoom out')}>−</button>
      <button type="button" onClick={resetCamera} title={translate('Reset camera')} aria-label={translate('Reset camera')}>1:1</button>
    </div></>}
  </div>;
}

const HEAT_OPTIONS: Array<{ value: HeatmapMetric; label: 'Off' | 'Presence' | 'Resources' | 'Speech' | 'Exchanges' | 'Force' }> = [
  { value: 'none', label: 'Off' }, { value: 'agent_density', label: 'Presence' }, { value: 'resource_density', label: 'Resources' },
  { value: 'speech', label: 'Speech' }, { value: 'exchange', label: 'Exchanges' }, { value: 'force', label: 'Force' },
];

/** Inspect select (a keyboard path to every entity) and the heatmap layer. */
function MapTools() {
  useLocale();
  const agents = useAgents(), resources = useResourceSpawns();
  const selectedAgent = useWorldStore(s => s.selectedAgentId), selectedResource = useWorldStore(s => s.selectedResourceId);
  const selectAgent = useWorldStore(s => s.selectAgent), selectResource = useWorldStore(s => s.selectResource);
  const { metric, enabled } = useHeatmapSettings();
  const setMetric = useVisualizationStore(s => s.setHeatmapMetric);
  const value = selectedAgent ? `agent:${selectedAgent}` : selectedResource ? `resource:${selectedResource}` : '';
  const ordered = [...agents].sort((a, b) => (a.name ?? a.llmType).localeCompare(b.name ?? b.llmType));
  return <div className="map-tools" style={{ top: RULER + 8, left: RULER + 8 }}>
    <select className="input !min-h-9 !py-0 !text-sm max-w-[13rem] bg-night/80" aria-label={translate('Inspect agent or resource')} value={value} onChange={event => {
      const [kind, ...parts] = event.target.value.split(':'); const id = parts.join(':');
      if (kind === 'agent') selectAgent(id); else if (kind === 'resource') selectResource(id); else selectAgent(null);
    }}>
      <option value="">{translate('Inspect…')}</option>
      <optgroup label={translate('Agents')}>{ordered.map(agent => <option key={agent.id} value={`agent:${agent.id}`}>{agent.name ?? agent.llmType} · ({agent.x}, {agent.y})</option>)}</optgroup>
      <optgroup label={translate('Resources')}>{resources.map(r => <option key={r.id} value={`resource:${r.id}`}>{translateLabel(r.resourceType.charAt(0).toUpperCase() + r.resourceType.slice(1))} · ({r.x}, {r.y}) · {r.currentAmount.toFixed(1)}</option>)}</optgroup>
    </select>
    <select className="input !min-h-9 !py-0 !text-sm bg-night/80" aria-label={translate('Heatmap')} value={enabled ? metric : 'none'} onChange={event => setMetric(event.target.value as HeatmapMetric)}>
      {HEAT_OPTIONS.map(option => <option key={option.value} value={option.value}>{translate('Heatmap')}: {translate(option.label)}</option>)}
    </select>
  </div>;
}
