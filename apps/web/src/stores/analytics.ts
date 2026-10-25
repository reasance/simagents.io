import type { WorldMetrics } from '@simagents/engine/engine/metrics';
import { useAgentStatsStore } from './agentStats';
/**
 * Analytics store for experimental metrics dashboard
 */

import { create } from 'zustand';
import { useWorldStore, type Agent, type WorldEvent } from './world';

// =============================================================================
// Types (matching backend)
// =============================================================================

export interface SurvivalMetrics {
  byLlmType: {
    llmType: string;
    aliveCount: number;
    deadCount: number;
    avgHealth: number;
    avgHunger: number;
    avgEnergy: number;
    avgBalance: number;
  }[];
  overall: {
    totalAlive: number;
    totalDead: number;
    totalAgents: number;
  };
  deathCauses: {
    starvation: number;
    exhaustion: number;
    other?: number;
  };
}

export interface BehaviorMetrics {
  actionFrequency: {
    actionType: string;
    count: number;
    percentage: number;
  }[];
  byLlmType: {
    llmType: string;
    actions: Record<string, number>;
    fallbackRate: number;
    avgProcessingTime: number;
    processingSamples?: number;
  }[];
}

export interface TemporalMetrics {
  totalEvents?: number;
  tickDurations: {
    tick: number;
    duration: number;
    agentCount: number;
    actionsExecuted: number;
  }[];
  eventsByTick: {
    tick: number;
    eventCount: number;
  }[];
  currentTick: number;
}

export interface AnalyticsSnapshot {
  survival: SurvivalMetrics;
  behavior: BehaviorMetrics;
  temporal: TemporalMetrics;
  timestamp: number;
}

// =============================================================================
// Store
// =============================================================================

interface AnalyticsState {
  // Data
  survival: SurvivalMetrics | null;
  behavior: BehaviorMetrics | null;
  temporal: TemporalMetrics | null;
  lastUpdated: number | null;
  fetchSnapshot: () => Promise<void>;
}

type AnalyticsDataState = Pick<
  AnalyticsState,
  'survival' | 'behavior' | 'temporal' | 'lastUpdated'
>;

interface LocalActionEvent {
  event: WorldEvent;
  actionType: string;
}

function snapshotToState(data: AnalyticsSnapshot): AnalyticsDataState {
  return {
    survival: data.survival,
    behavior: data.behavior,
    temporal: data.temporal,
    lastUpdated: data.timestamp,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isAgentAlive(agent: Agent): boolean {
  return agent.state !== 'dead';
}

function groupAgentsByLlm(agents: Agent[]): [string, Agent[]][] {
  const groups = new Map<string, Agent[]>();
  for (const agent of agents) {
    const llmType = agent.llmType || 'unknown';
    const existing = groups.get(llmType) ?? [];
    existing.push(agent);
    groups.set(llmType, existing);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function classifyDeathCause(event: WorldEvent): 'starvation' | 'exhaustion' | null {
  const cause = event.payload.cause ?? event.payload.reason ?? event.payload.deathCause;
  if (typeof cause !== 'string') return null;
  const normalized = cause.toLowerCase();
  if (normalized.includes('starv') || normalized.includes('hunger')) return 'starvation';
  if (normalized.includes('exhaust') || normalized.includes('energy')) return 'exhaustion';
  return null;
}

function buildDeathCauses(agents: Agent[], events: WorldEvent[]): SurvivalMetrics['deathCauses'] {
  let starvation = 0;
  let exhaustion = 0;

  for (const event of events) {
    if (event.type !== 'agent_died') continue;
    const cause = classifyDeathCause(event);
    if (cause === 'starvation') starvation += 1;
    if (cause === 'exhaustion') exhaustion += 1;
  }

  if (starvation > 0 || exhaustion > 0) {
    return { starvation, exhaustion };
  }

  for (const agent of agents) {
    if (isAgentAlive(agent)) continue;
    if (agent.hunger <= 0) starvation += 1;
    else if (agent.energy <= 0) exhaustion += 1;
  }

  return { starvation, exhaustion };
}

function buildSurvivalMetrics(agents: Agent[], events: WorldEvent[]): SurvivalMetrics {
  const byLlmType = groupAgentsByLlm(agents).map(([llmType, llmAgents]) => {
    const aliveAgents = llmAgents.filter(isAgentAlive);
    const aliveCount = aliveAgents.length;
    return {
      llmType,
      aliveCount,
      deadCount: llmAgents.length - aliveCount,
      avgHealth: average(aliveAgents.map((agent) => agent.health)),
      avgHunger: average(aliveAgents.map((agent) => agent.hunger)),
      avgEnergy: average(aliveAgents.map((agent) => agent.energy)),
      avgBalance: average(aliveAgents.map((agent) => agent.balance)),
    };
  });

  const totalAlive = agents.filter(isAgentAlive).length;
  return {
    byLlmType,
    overall: {
      totalAlive,
      totalDead: agents.length - totalAlive,
      totalAgents: agents.length,
    },
    deathCauses: buildDeathCauses(agents, events),
  };
}

function getActionType(event: WorldEvent): string | null {
  const action = event.payload.action;
  return typeof action === 'string' && (event.type === `agent_${action}` || event.type === 'action_failed') ? action : null;
}

function collectActionEvents(events: WorldEvent[]): LocalActionEvent[] {
  const seen = new Set<string>();
  return events.reduce<LocalActionEvent[]>((actions, event) => {
    if (seen.has(event.id)) return actions;
    seen.add(event.id);
    const actionType = getActionType(event);
    if (actionType) actions.push({ event, actionType });
    return actions;
  }, []);
}

function getEventLlmType(event: WorldEvent, agentsById: Map<string, Agent>): string {
  if (event.agentId) {
    const agent = agentsById.get(event.agentId);
    if (agent?.llmType) return agent.llmType;
  }
  const payloadLlmType = event.payload.llmType;
  return typeof payloadLlmType === 'string' && payloadLlmType ? payloadLlmType : 'unknown';
}

function numericPayloadValue(event: WorldEvent, key: string): number | null {
  const value = event.payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildBehaviorMetrics(agents: Agent[], events: WorldEvent[]): BehaviorMetrics {
  const actionEvents = collectActionEvents(events);
  const totalActions = actionEvents.length;
  const actionCounts = new Map<string, number>();
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const llmBuckets = new Map<
    string,
    {
      actions: Record<string, number>;
      totalActions: number;
      fallbackCount: number;
      processingTotal: number;
      processingSamples: number;
    }
  >();

  for (const { event, actionType } of actionEvents) {
    actionCounts.set(actionType, (actionCounts.get(actionType) ?? 0) + 1);

    const llmType = getEventLlmType(event, agentsById);
    const bucket = llmBuckets.get(llmType) ?? {
      actions: {},
      totalActions: 0,
      fallbackCount: 0,
      processingTotal: 0,
      processingSamples: 0,
    };
    bucket.actions[actionType] = (bucket.actions[actionType] ?? 0) + 1;
    bucket.totalActions += 1;
    if (event.payload.usedFallback === true) bucket.fallbackCount += 1;

    const processingTime = numericPayloadValue(event, 'processingTimeMs');
    if (processingTime !== null) {
      bucket.processingTotal += processingTime;
      bucket.processingSamples += 1;
    }
    llmBuckets.set(llmType, bucket);
  }

  return {
    actionFrequency: [...actionCounts.entries()]
      .map(([actionType, count]) => ({
        actionType,
        count,
        percentage: totalActions === 0 ? 0 : (count / totalActions) * 100,
      }))
      .sort((a, b) => b.count - a.count),
    byLlmType: [...llmBuckets.entries()]
      .map(([llmType, bucket]) => ({
        llmType,
        actions: bucket.actions,
        fallbackRate: bucket.totalActions === 0 ? 0 : bucket.fallbackCount / bucket.totalActions,
        processingSamples: bucket.processingSamples,
        avgProcessingTime:
          bucket.processingSamples === 0 ? 0 : bucket.processingTotal / bucket.processingSamples,
      }))
      .sort((a, b) => a.llmType.localeCompare(b.llmType)),
  };
}

function buildTemporalMetrics(agents: Agent[], events: WorldEvent[], currentTick: number): TemporalMetrics {
  const actionEvents = collectActionEvents(events);
  const eventsByTickMap = new Map<number, number>();
  const actionsByTickMap = new Map<number, number>();
  const processingByTickMap = new Map<number, number[]>();

  for (const event of events) {
    eventsByTickMap.set(event.tick, (eventsByTickMap.get(event.tick) ?? 0) + 1);

    const processingTime = numericPayloadValue(event, 'processingTimeMs');
    if (processingTime !== null) {
      const values = processingByTickMap.get(event.tick) ?? [];
      values.push(processingTime);
      processingByTickMap.set(event.tick, values);
    }
  }

  for (const { event } of actionEvents) {
    actionsByTickMap.set(event.tick, (actionsByTickMap.get(event.tick) ?? 0) + 1);
  }

  const recentTicks = [...new Set([...eventsByTickMap.keys(), currentTick])]
    .sort((a, b) => a - b)
    .slice(-30);

  return {
    tickDurations: recentTicks.map((tick) => {
      const processingTimes = processingByTickMap.get(tick) ?? [];
      return {
        tick,
        duration: processingTimes.length === 0 ? 0 : Math.max(...processingTimes),
        agentCount: agents.length,
        actionsExecuted: actionsByTickMap.get(tick) ?? 0,
      };
    }),
    eventsByTick: [...eventsByTickMap.entries()]
      .map(([tick, eventCount]) => ({ tick, eventCount }))
      .sort((a, b) => a.tick - b.tick)
      .slice(-30),
    currentTick,
  };
}

export function cumulativeBehavior(metrics: WorldMetrics): BehaviorMetrics {
  const counts = new Map<string, number>();
  const groups = new Map<string, { actions: Record<string, number>; count: number; fallbacks: number; latency: number; samples: number }>();
  for (const agent of metrics.agents) {
    const group = groups.get(agent.llmType) ?? { actions: Object.create(null), count: 0, fallbacks: 0, latency: 0, samples: 0 };
    for (const action of agent.actions) { counts.set(action.type, (counts.get(action.type) ?? 0) + action.count); group.actions[action.type] = (group.actions[action.type] ?? 0) + action.count; }
    group.count += agent.actionsCount; group.fallbacks += agent.fallbackCount; group.latency += agent.latencyTotalMs; group.samples += agent.latencySamples;
    groups.set(agent.llmType, group);
  }
  return { actionFrequency: [...counts].map(([actionType,count]) => ({ actionType,count,percentage: metrics.totalActions ? count / metrics.totalActions * 100 : 0 })).sort((a,b) => b.count-a.count),
    byLlmType: [...groups].map(([llmType,g]) => ({ llmType, actions: g.actions, fallbackRate: g.count ? g.fallbacks/g.count : 0, processingSamples: g.samples, avgProcessingTime: g.samples ? g.latency/g.samples : 0 })) };
}

function buildLocalAnalyticsSnapshot(): AnalyticsSnapshot {
  const { agents, events, tick } = useWorldStore.getState();
  const metrics = useAgentStatsStore.getState().metrics;
  const survival = buildSurvivalMetrics(agents, events);
  if (metrics) survival.deathCauses = { starvation: metrics.deaths.starvation, exhaustion: metrics.deaths.exhaustion, other: metrics.deaths.other };
  return {
    survival,
    behavior: metrics ? cumulativeBehavior(metrics) : buildBehaviorMetrics(agents, events),
    temporal: metrics ? { currentTick: tick, totalEvents: metrics.totalEvents,
      tickDurations: metrics.recentTicks.slice(-30).map(t => ({ tick: t.tick, duration: t.maxDecisionMs, agentCount: t.agentCount, actionsExecuted: t.actions })),
      eventsByTick: metrics.recentTicks.slice(-30).map(t => ({ tick: t.tick, eventCount: t.events })),
    } : buildTemporalMetrics(agents, events, tick),
    timestamp: Date.now(),
  };
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  survival: null,
  behavior: null,
  temporal: null,
  lastUpdated: null,
  fetchSnapshot: async () => { set(snapshotToState(buildLocalAnalyticsSnapshot())); },
}));

export const useSurvivalMetrics = () => useAnalyticsStore((s) => s.survival);
export const useBehaviorMetrics = () => useAnalyticsStore((s) => s.behavior);
export const useTemporalMetrics = () => useAnalyticsStore((s) => s.temporal);
export const useFetchSnapshot = () => useAnalyticsStore((s) => s.fetchSnapshot);
