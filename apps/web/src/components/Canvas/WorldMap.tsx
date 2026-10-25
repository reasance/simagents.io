import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { translate, translateLabel, useLocale } from '../../i18n';
import { useAgents, useNotableEvents, useResourceSpawns, useShelters, useWorldStore, type Agent, type WorldEvent } from '../../stores/world';
import { useHeatmapSettings, useVisualizationStore, type HeatmapMetric } from '../../stores/visualization';
import { CanvasPanControls } from './CanvasPanControls';
import { BIOMES, FIELD, GRID, HEAT_RAMP, INK, RESOURCE_COLORS, TILE, drawSprite, pixelLine, terrainCanvas, type SpriteName } from './pixel-art';

const RULER = 22;
const MIN_ZOOM = 0.5, MAX_ZOOM = 3;
/** How long a spoken line stays drawn between speaker and listeners. */
const ARC_MS = 8000;
const LABEL_FONT = `'Press Start 2P', monospace`;
const EXCHANGE = new Set(['agent_gave', 'agent_traded']), FORCE = new Set(['agent_harmed', 'agent_stole']);

/** Gold corner brackets around a cell: the selection cursor. */
function brackets(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, px: number) {
  const arm = size / 3, pad = px * 1.5;
  ctx.fillStyle = INK.gold;
  for (const [cx, cy, sx, sy] of [[x - pad, y - pad, 1, 1], [x + size + pad, y - pad, -1, 1], [x - pad, y + size + pad, 1, -1], [x + size + pad, y + size + pad, -1, -1]]) {
    ctx.fillRect(sx > 0 ? cx : cx - arm, sy > 0 ? cy : cy - px, arm, px);
    ctx.fillRect(sx > 0 ? cx : cx - px, sy > 0 ? cy : cy - arm, px, arm);
  }
}

/** A legend swatch drawn from the same sprite the map uses. */
function SpriteIcon({ name }: { name: SpriteName }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const ctx = ref.current?.getContext('2d'); if (ctx) { ctx.clearRect(0, 0, 16, 16); drawSprite(ctx, name, 0, 0, 16); } }, [name]);
  return <canvas ref={ref} width={16} height={16} className="sprite-icon" aria-hidden="true" />;
}

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
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = INK.night;
    ctx.fillRect(0, 0, width, height);

    const ox = width / 2 + camera.x, oy = height / 2 + camera.y;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(zoom, zoom);

    // A chunky two-tone frame, then the pre-rendered ground.
    const frame = 6 / zoom;
    ctx.fillStyle = INK.ruleStrong; ctx.fillRect(-frame, -frame, FIELD + frame * 2, FIELD + frame * 2);
    ctx.fillStyle = INK.night; ctx.fillRect(-frame / 2, -frame / 2, FIELD + frame, FIELD + frame);
    ctx.drawImage(terrainCanvas(), 0, 0);
    const text = (value: string, x: number, y: number, px: number, color: string) => {
      ctx.font = `${px / zoom}px ${LABEL_FONT}`;
      ctx.fillStyle = INK.night; ctx.fillText(value, x + 1 / zoom, y + 1 / zoom);
      ctx.fillStyle = color; ctx.fillText(value, x, y);
    };
    ctx.textAlign = 'left';
    for (const biome of BIOMES) text(translateLabel(biome.key).toUpperCase(), biome.x * TILE + 8 / zoom, biome.y * TILE + 16 / zoom, 8, biome.label);

    if (heat) {
      for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
        const value = heat[y * GRID + x];
        if (value < 0.05) continue;
        ctx.globalAlpha = opacity * Math.min(1, value + 0.2);
        ctx.fillStyle = HEAT_RAMP[Math.min(HEAT_RAMP.length - 1, Math.floor(value * HEAT_RAMP.length))];
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
      ctx.globalAlpha = 1;
    }

    for (const shelter of shelters) drawSprite(ctx, 'shelter', shelter.x * TILE, shelter.y * TILE, TILE);
    for (const spawn of resources) {
      const fill = Math.max(0, Math.min(1, spawn.currentAmount / Math.max(1, spawn.maxAmount)));
      ctx.globalAlpha = 0.3 + 0.7 * fill;
      drawSprite(ctx, (spawn.resourceType in RESOURCE_COLORS ? spawn.resourceType : 'material') as SpriteName, spawn.x * TILE, spawn.y * TILE, TILE);
      ctx.globalAlpha = 1;
      if (spawn.id === selectedResourceId) brackets(ctx, spawn.x * TILE, spawn.y * TILE, TILE, 2 / zoom);
    }

    // Spoken lines: dotted gold paths from the speaker to everyone who heard, with a speech bubble, fading out.
    const center = (x: number, y: number) => [x * TILE + TILE / 2, y * TILE + TILE / 2] as const;
    for (const event of arcs) {
      const age = Math.min(1, Math.max(0, (now - event.timestamp) / ARC_MS));
      const from = eventPosition(event, byId); if (!from) continue;
      const [sx, sy] = center(from.x, from.y);
      const listeners = Array.isArray(event.payload.listenerIds) ? event.payload.listenerIds as string[] : [];
      const addressed = typeof event.payload.to === 'string' ? event.payload.to : undefined;
      ctx.fillStyle = INK.gold;
      for (const id of listeners) {
        const listener = byId.get(id); if (!listener) continue;
        const [tx, ty] = center(listener.x, listener.y);
        ctx.globalAlpha = (1 - age) * (id === addressed ? 1 : 0.6);
        pixelLine(ctx, sx, sy, tx, ty, Math.max(2, (id === addressed ? 3 : 2) / zoom));
      }
      ctx.globalAlpha = 1 - age;
      drawSprite(ctx, 'bubble', sx + 2, sy - TILE * 1.6, TILE);
    }
    ctx.globalAlpha = 1;

    // Sprites first, names after, so no sprite covers a neighbour's name.
    const labels: Array<() => void> = [];
    const stacked = new Map<string, Agent[]>();
    for (const agent of agents) { const key = `${agent.x},${agent.y}`; stacked.set(key, [...(stacked.get(key) ?? []), agent]); }
    for (const [, group] of stacked) group.forEach((agent, index) => {
      // Agents sharing a cell fan out a little so each stays visible and clickable.
      const offset = group.length > 1 ? (index - (group.length - 1) / 2) * 6 : 0;
      const x = agent.x * TILE + offset, y = agent.y * TILE - Math.abs(offset) / 3;
      const dead = agent.state === 'dead' || agent.health <= 0;
      drawSprite(ctx, dead ? 'grave' : 'agent', x, y, TILE, agent.color);
      if (!dead && agent.health < 30) drawSprite(ctx, 'heart', x + TILE * 0.55, y - TILE * 0.55, TILE * 0.75);
      const selected = agent.id === selectedAgentId;
      if (selected) brackets(ctx, x, y, TILE, 2 / zoom);
      if (selected || zoom >= 0.9 || agents.length <= 12) labels.push(() => text(agent.name ?? agent.llmType, x + TILE + 3 / zoom, y + TILE / 2 + 4 / zoom, 8, selected ? INK.gold : INK.star));
    });
    for (const label of labels) label();
    ctx.restore();

    // Rulers: graduated edges fixed to the view, reading world coordinates like an instrument scale.
    ctx.fillStyle = INK.night;
    ctx.fillRect(0, 0, width, RULER); ctx.fillRect(0, 0, RULER, height);
    ctx.strokeStyle = INK.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(RULER, RULER - 0.5); ctx.lineTo(width, RULER - 0.5); ctx.moveTo(RULER - 0.5, RULER); ctx.lineTo(RULER - 0.5, height); ctx.stroke();
    const cell = TILE * zoom;
    ctx.font = `8px ${LABEL_FONT}`; ctx.fillStyle = INK.mist;
    // Square ticks, two pixels wide, like a scale drawn on a tile sheet.
    for (let i = 0; i <= GRID; i++) {
      const major = i % 10 === 0, mid = i % 5 === 0;
      if (!major && !mid && cell < 6) continue;
      const length = major ? 8 : mid ? 6 : 2;
      const x = Math.round(ox + i * cell), y = Math.round(oy + i * cell);
      if (x > RULER && x < width) ctx.fillRect(x - 1, RULER - length, 2, length);
      if (y > RULER && y < height) ctx.fillRect(RULER - length, y - 1, length, 2);
    }
    ctx.textAlign = 'left';
    for (let i = 0; i <= GRID; i += 10) {
      const x = ox + i * cell, y = oy + i * cell;
      if (x > RULER + 2 && x < width - 24) ctx.fillText(String(i), x + 3, 11);
      if (y > RULER + 10 && y < height) { ctx.save(); ctx.translate(11, y - 3); ctx.rotate(-Math.PI / 2); ctx.fillText(String(i), 0, 0); ctx.restore(); }
    }
    if (selectedAgentId) {
      const agent = byId.get(selectedAgentId);
      if (agent) {
        const x = ox + (agent.x + 0.5) * cell, y = oy + (agent.y + 0.5) * cell;
        ctx.fillStyle = INK.gold;
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
    const agent = agents.find(a => Math.hypot(wx - (a.x * TILE + TILE / 2), wy - (a.y * TILE + TILE / 2)) < TILE / 2 + slack / zoom);
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
      <span><SpriteIcon name="food" />{translate('Food')}</span>
      <span><SpriteIcon name="energy" />{translate('Energy')}</span>
      <span><SpriteIcon name="material" />{translate('Material')}</span>
      <span><SpriteIcon name="shelter" />{translate('Shelter')}</span>
      <span><SpriteIcon name="bubble" />{translate('Speech')}</span>
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
