import { translateLabel, useLocale, translate } from '../../i18n';
import { useDialogFocus } from '../../hooks/useDialogFocus';

/**
 * Social Graph View
 *
 * D3.js force-directed graph visualization of agent relationships.
 * Shows:
 * - Agents as nodes (colored by LLM type)
 * - Edges for speech, gifts, swaps and force
 * - Edge thickness based on interaction frequency
 * - Interactive: click nodes to select agent
 */

import { useEffect, useRef, useMemo, useCallback, type ReactNode, type KeyboardEvent } from 'react';
import { CanvasPanControls } from '../Canvas/CanvasPanControls';
import * as d3 from 'd3';
import { useAgents, useNotableEvents, useWorldStore, type WorldEvent } from '../../stores/world';
import {
  useSocialGraphSettings,
  useVisualizationStore,
  type SocialEdgeType,
} from '../../stores/visualization';

const EDGE_COLORS: Record<SocialEdgeType, string> = {
  speech: '#ffc93c',
  gift: '#5fe08a',
  swap: '#5ec8ff',
  force: '#ff6b6b',
};

// Node interface for D3
interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  llmType: string;
  name?: string;
  color: string;
  health: number;
  state: string;
}

// Link interface for D3
interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: SocialEdgeType;
  weight: number;
}

export function SocialGraphView({ controls }: { controls?: (close: () => void) => ReactNode }) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);

  const agents = useAgents();
  const events = useNotableEvents();
  const { visible, edgeTypes } = useSocialGraphSettings();
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const toggleSocialGraph = useVisualizationStore((s) => s.toggleSocialGraph);

  const dismiss = useCallback(() => {
    const root = containerRef.current;
    const popover = root?.querySelector<HTMLElement>('[popover]:popover-open');
    if (popover) {
      popover.hidePopover();
      [...(root?.querySelectorAll<HTMLButtonElement>('button[popovertarget]') ?? [])].find(button => button.getAttribute('popovertarget') === popover.id)?.focus();
      return;
    }
    const menu = root?.querySelector<HTMLDetailsElement>('.simulation-tools[open]');
    if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); return; }
    toggleSocialGraph();
  }, [toggleSocialGraph]);
  useDialogFocus(containerRef, visible, dismiss);

  // Build graph data from events
  const graphData = useMemo(() => {
    // Create nodes from alive agents
    const nodes: GraphNode[] = agents
      .filter((a) => a.state !== 'dead')
      .map((a) => ({
        id: a.id,
        llmType: a.llmType,
        name: a.name,
        color: a.color,
        health: a.health,
        state: a.state,
      }));

    // Create edges from events
    const edgeMap = new Map<string, GraphLink>();

    // Who did what to whom, read from the notable-event log (directed, except swaps).
    const pairs = (event: WorldEvent): Array<[string, string, SocialEdgeType]> => {
      const p = event.payload ?? {}, source = event.agentId;
      if (!source) return [];
      switch (event.type) {
        case 'agent_spoke': return typeof p.to === 'string' ? [[source, p.to, 'speech']] : (Array.isArray(p.listenerIds) ? p.listenerIds as string[] : []).map(id => [source, id, 'speech']);
        case 'agent_gave': return typeof p.recipientId === 'string' ? [[source, p.recipientId, 'gift']] : [];
        case 'agent_traded': return typeof p.targetId === 'string' ? [[source, p.targetId, 'swap']] : [];
        case 'agent_harmed': case 'agent_stole': return typeof p.victimId === 'string' ? [[source, p.victimId, 'force']] : [];
        default: return [];
      }
    };
    for (const event of events) {
      for (const [sourceId, targetId, edgeType] of pairs(event)) {
        if (!edgeTypes.has(edgeType) || sourceId === targetId) continue;
        const key = edgeType === 'swap' ? [sourceId, targetId].sort().join('-') + '-swap' : `${sourceId}-${targetId}-${edgeType}`;
        const existing = edgeMap.get(key);
        if (existing) existing.weight += 1;
        else edgeMap.set(key, { source: sourceId, target: targetId, type: edgeType, weight: 1 });
      }
    }

    // Filter edges to only include nodes that exist
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = Array.from(edgeMap.values()).filter(
      (l) =>
        nodeIds.has(l.source as string) && nodeIds.has(l.target as string)
    );

    return { nodes, links };
  }, [agents, events, edgeTypes]);

  // Each visible SVG owns its simulation/zoom listeners. Closing unmounts it.
  useEffect(() => {
    if (!svgRef.current || !plotRef.current || !visible) return;
    const svg = d3.select(svgRef.current), plot = plotRef.current;
    svg.selectAll('*').remove();
    gRef.current = svg.append('g');
    gRef.current.append('g').attr('class', 'links');
    gRef.current.append('g').attr('class', 'nodes');
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on('zoom', event => {
      gRef.current?.attr('transform', event.transform);
      svg.attr('data-zoom', event.transform.k).attr('data-pan-x', event.transform.x).attr('data-pan-y', event.transform.y);
    });
    zoomRef.current = zoom;
    svg.call(zoom).call(zoom.transform, d3.zoomIdentity);
    const resize = () => {
      const { width, height } = plot.getBoundingClientRect();
      svg.attr('width', width).attr('height', height);
      simulationRef.current?.force('center', d3.forceCenter(width / 2, height / 2)).alpha(0.1).restart();
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(plot);
    return () => {
      observer.disconnect();
      simulationRef.current?.stop(); simulationRef.current = null;
      zoomRef.current = null; gRef.current = null;
      svg.on('.zoom', null).selectAll('*').remove();
    };
  }, [visible]);

  const zoomBy = useCallback((factor: number) => {
    if (svgRef.current && zoomRef.current) d3.select(svgRef.current).call(zoomRef.current.scaleBy, factor);
  }, []);
  const moveView = useCallback((x: number, y: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    const scale = d3.zoomTransform(svgRef.current).k;
    d3.select(svgRef.current).call(zoomRef.current.translateBy, x / scale, y / scale);
  }, []);
  const resetView = useCallback(() => {
    if (svgRef.current && zoomRef.current) d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity);
  }, []);
  const moveSelected = useCallback((x: number, y: number) => {
    const simulation = simulationRef.current, node = simulation?.nodes().find(item => item.id === selectedAgentId);
    if (!node || !svgRef.current) return;
    const scale = d3.zoomTransform(svgRef.current).k;
    node.fx = (node.fx ?? node.x ?? 0) + x / scale;
    node.fy = (node.fy ?? node.y ?? 0) + y / scale;
    simulation!.alpha(0.3).restart();
  }, [selectedAgentId]);
  const releaseSelected = useCallback(() => {
    const node = simulationRef.current?.nodes().find(item => item.id === selectedAgentId);
    if (!node) return;
    node.fx = null; node.fy = null; simulationRef.current?.alpha(0.3).restart();
  }, [selectedAgentId]);
  const handleViewKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40] };
    if (moves[event.key]) { event.preventDefault(); moveView(...moves[event.key]); }
    else if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); zoomBy(event.key === '-' ? 1 / 1.25 : 1.25); }
    else if (event.key === 'Home' || event.key.toLowerCase() === 'r') { event.preventDefault(); resetView(); }
  };
  const handleNodeKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40] };
    if (moves[event.key]) { event.preventDefault(); moveSelected(...moves[event.key]); }
    else if (event.key === 'Home') { event.preventDefault(); releaseSelected(); }
  };

  // Update graph data (nodes and links) - preserves simulation
  useEffect(() => {
    if (!svgRef.current || !plotRef.current || !visible || !gRef.current) return;

    const g = gRef.current;
    const container = plotRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create or update simulation
    if (!simulationRef.current) {
      simulationRef.current = d3.forceSimulation<GraphNode>(graphData.nodes);
    } else {
      // Preserve existing node positions
      const oldNodes = new Map<string, GraphNode>();
      simulationRef.current.nodes().forEach((n) => {
        oldNodes.set(n.id, n);
      });

      graphData.nodes.forEach((n) => {
        const old = oldNodes.get(n.id);
        if (old) {
          n.x = old.x;
          n.y = old.y;
          n.vx = old.vx;
          n.vy = old.vy;
          n.fx = old.fx; n.fy = old.fy;
        }
      });

      simulationRef.current.nodes(graphData.nodes);
    }

    const simulation = simulationRef.current;

    // Update forces
    simulation
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(graphData.links)
          .id((d) => d.id)
          .distance(80)
          .strength((d) => Math.min(0.5, d.weight * 0.1))
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Update links using D3 data join
    const linkGroup = g.select<SVGGElement>('.links');
    const link = linkGroup
      .selectAll<SVGLineElement, GraphLink>('line')
      .data(graphData.links, (d) => `${(d.source as GraphNode).id || d.source}-${(d.target as GraphNode).id || d.target}-${d.type}`);

    link.exit().remove();

    const linkEnter = link.enter()
      .append('line')
      .attr('stroke', (d) => EDGE_COLORS[d.type])
      .attr('stroke-width', (d) => Math.min(5, 1 + d.weight * 0.5))
      .attr('stroke-opacity', 0.6);

    const linkMerge = linkEnter.merge(link);

    // Update nodes using D3 data join
    const nodeGroup = g.select<SVGGElement>('.nodes');
    const node = nodeGroup
      .selectAll<SVGGElement, GraphNode>('g')
      .data(graphData.nodes, (d) => d.id);

    node.exit().remove();

    const nodeEnter = node.enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (_event, d) => {
        selectAgent(d.id === selectedAgentId ? null : d.id);
      });

    // Add elements to new nodes
    nodeEnter
      // Square nodes: the graph shares the map's pixel vocabulary.
      .append('rect')
      .attr('class', 'node-body')
      .attr('x', -11).attr('y', -11).attr('width', 22).attr('height', 22)
      .attr('fill', (d) => d.color)
      .attr('stroke', '#0e0c1f')
      .attr('stroke-width', 2);

    nodeEnter
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', -18)
      .attr('fill', '#f5f2ff')
      .attr('font-size', '8px')
      .attr('font-family', "'Press Start 2P', monospace")
      .text((d) => d.name ?? d.llmType);

    nodeEnter
      .append('rect')
      .attr('class', 'health-bg')
      .attr('x', -12)
      .attr('y', 18)
      .attr('width', 24)
      .attr('height', 3)
      .attr('fill', '#433a7a')
      .attr('rx', 1);

    nodeEnter
      .append('rect')
      .attr('class', 'health-bar')
      .attr('x', -12)
      .attr('y', 18)
      .attr('height', 3)
      .attr('rx', 1);

    nodeEnter.append('title');
    const nodeMerge = nodeEnter.merge(node);
    nodeMerge.select('text').text(d => d.name ?? d.llmType);
    nodeMerge.select('title').text(d => `${d.name ?? d.llmType} · ${translate('Health')}: ${Math.round(d.health)}`);

    // Update health bars for all nodes
    nodeMerge.select('.health-bar')
      .attr('width', (d) => (d.health / 100) * 24)
      .attr('fill', (d) => (d.health > 25 ? '#5fe08a' : '#ff6b6b'));

    // Update positions on simulation tick
    simulation.on('tick', () => {
      linkMerge
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

      nodeMerge.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Restart simulation with low alpha for smooth updates
    simulation.alpha(0.3).restart();
  }, [graphData, visible, selectAgent, selectedAgentId, locale]);

  // Separate effect for selection highlight (no simulation restart needed)
  useEffect(() => {
    if (!gRef.current || !visible) return;

    gRef.current.select('.nodes')
      .selectAll<SVGGElement, GraphNode>('g')
      .select('.node-body')
      .attr('stroke', (d) => (d.id === selectedAgentId ? '#ffc93c' : '#0e0c1f'))
      .attr('stroke-width', (d) => (d.id === selectedAgentId ? 3 : 2));
  }, [selectedAgentId, visible]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="social-graph-title"
      tabIndex={-1}
      className="social-graph-dialog fixed inset-0 z-[210] flex min-h-0 flex-col overflow-hidden"
    >
      {controls && <div className="shrink-0">{controls(toggleSocialGraph)}</div>}
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1 border-b border-city-border">
        <div className="min-w-0 flex-1">
          <h2 id="social-graph-title" className="break-words text-base font-semibold text-city-text">{translate("Social Graph")}</h2>
          <span className="text-xs text-city-text-muted">
            {graphData.nodes.length}{" "}{translate("agents,")}{" "}{graphData.links.length}{" "}{translate("connections")}</span>
        </div>
        <button
          onClick={toggleSocialGraph}
          aria-label={translate('Close social graph')}
          className="min-h-[44px] min-w-[44px] shrink-0 p-2 rounded-lg bg-city-surface border border-city-border hover:bg-city-border text-city-text transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div role="region" aria-label={translate('Graph controls')} tabIndex={0} className="min-h-0 shrink max-h-[24dvh] overflow-y-auto border-b border-city-border/50 bg-city-surface/50 p-2 space-y-2">
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm">{translate('Select agent')}
          <select aria-label={translate('Select agent')} className="min-h-[44px] min-w-0 max-w-full flex-1 bg-city-surface border border-city-border rounded px-2" value={selectedAgentId ?? ''} onChange={event => selectAgent(event.target.value || null)}>
            <option value="">—</option>
            {agents.filter(agent => agent.state !== 'dead').map(agent => <option key={agent.id} value={agent.id}>{agent.name ?? agent.llmType}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-city-text-muted">{translate('Show')}</span>
          <EdgeTypeToggle type="speech" label={translate('Speech')} />
          <EdgeTypeToggle type="gift" label={translate('Gifts')} />
          <EdgeTypeToggle type="swap" label={translate('Swaps')} />
          <EdgeTypeToggle type="force" label={translate('Force')} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CanvasPanControls move={moveView} reset={resetView} onKeyDown={handleViewKey} />
          <button type="button" aria-label={translate('Zoom in')} onClick={() => zoomBy(1.25)} className="h-[44px] w-[44px] shrink-0 rounded border border-city-border bg-city-surface text-city-text">+</button>
          <button type="button" aria-label={translate('Zoom out')} onClick={() => zoomBy(1 / 1.25)} className="h-[44px] w-[44px] shrink-0 rounded border border-city-border bg-city-surface text-city-text">−</button>
          <button type="button" aria-label={translate('Reset camera')} onClick={resetView} className="h-[44px] w-[44px] shrink-0 rounded border border-city-border bg-city-surface text-city-text">↺</button>
          <CanvasPanControls label="Move selected graph agent" resetLabel="Release agent position" disabled={!graphData.nodes.some(node => node.id === selectedAgentId)} move={moveSelected} reset={releaseSelected} onKeyDown={handleNodeKey} />
        </div>
        <p id="social-graph-help" className="text-xs text-city-text-muted">{translate('Use the controls to move and zoom the graph. Select an agent to reposition it.')}</p>
      </div>
      <div ref={plotRef} className="min-h-[44px] flex-1 relative overflow-hidden">
        <svg ref={svgRef} role="img" aria-label={translate('Social Graph')} aria-describedby="social-graph-help" tabIndex={0} onKeyDown={handleViewKey} className="h-full w-full" />
      </div>
    </div>
  );
}

/**
 * Edge type toggle button
 */
function EdgeTypeToggle({ type, label }: { type: SocialEdgeType; label: string }) {
  useLocale();
  const socialGraphEdgeTypes = useVisualizationStore((s) => s.socialGraphEdgeTypes);
  const toggleSocialEdgeType = useVisualizationStore((s) => s.toggleSocialEdgeType);
  const isActive = socialGraphEdgeTypes.has(type);
  const color = EDGE_COLORS[type];

  return (
    <button
      onClick={() => toggleSocialEdgeType(type)}
      aria-pressed={isActive}
      className={`flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-2 py-1 rounded border text-xs font-medium text-city-text transition-all ${isActive ? 'bg-city-border' : 'bg-city-bg/50 hover:bg-city-border'}`}
      style={{ borderColor: isActive ? color : undefined }}
    >
      <div
        className="w-3 h-0.5 rounded"
        aria-hidden="true" style={{ backgroundColor: color }}
      />
      <span aria-hidden="true">{isActive ? '✓' : '○'}</span>{translateLabel(label)}
    </button>
  );
}

/**
 * Social Graph Button - Opens the graph view
 */
export function SocialGraphButton() {
  useLocale();
  const toggleSocialGraph = useVisualizationStore((s) => s.toggleSocialGraph);

  return (
    <button
      onClick={toggleSocialGraph}
      className="min-h-[44px] min-w-[44px] p-2 rounded-lg bg-city-surface border border-city-border hover:bg-city-border text-city-text transition-colors"
      title={translate("Social Graph")}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="5" r="3" />
        <circle cx="5" cy="19" r="3" />
        <circle cx="19" cy="19" r="3" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m-5.5 0l4-6m7 6l-4-6" />
      </svg>
    </button>
  );
}

