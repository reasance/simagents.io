/**
 * Emergence metrics - computed by the observer from the event log.
 *
 * Nothing here is ever shown to agents. Every figure is a count or ratio of
 * logged events; interpretation (and null-model comparison) belongs to the
 * analyst, see docs/metric-specification.md.
 */

/**
 * What the metrics read: a world snapshot, or the live store of a running engine.
 * Snapshots keep only the latest events, so live metrics use the store directly.
 */
export interface EmergenceMetricsSource {
  savedAtSimTimeMs: number;
  store: { agents: readonly unknown[]; events: readonly unknown[] };
}

export interface AgentEmergenceRow {
  agentId: string;
  name: string;
  llmType: string;
  modelId: string;
  effort: string;
  alive: boolean;
  survivalMinutes: number;
  decisions: number;
  decisionsPerSimHour: number;
  meanDecisionMs: number | null;
  inputTokens: number;
  outputTokens: number;
  failedTurns: number;
  /** Turns a decision model answered without preferring any option */
  undecidedTurns: number;
  unresponsive: boolean;
  utterances: number;
  questions: number;
  distinctListeners: number;
  distinctAddressees: number;
  giftsGiven: number;
  giftsReceived: number;
  strikes: number;
  takes: number;
  trades: number;
}

export interface InteractionEdge {
  from: string;
  to: string;
  heard: number;
  addressed: number;
  gifts: number;
  strikes: number;
  takes: number;
  trades: number;
}

export interface EmergenceMetrics {
  schemaVersion: 1;
  simMinutes: number;
  agents: AgentEmergenceRow[];
  edges: InteractionEdge[];
  /** Share of directed addressed-speech pairs answered by addressed speech the other way (heuristic). */
  addressedReciprocity: number | null;
  /** Share of directed gift pairs with a gift the other way (heuristic). */
  giftReciprocity: number | null;
  /** Place names proposed, and names independently proposed by at least two agents. */
  placeNames: { proposals: number; distinctNames: number; sharedNames: number };
}

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => (value && typeof value === 'object' ? value as JsonRecord : {});
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
/** Counted on both the actor's row and the actor → target edge. */
const ACT_COUNTERS: Record<string, 'strikes' | 'takes' | 'trades'> = { harm: 'strikes', steal: 'takes', trade: 'trades' };

export function computeEmergenceMetrics(snapshot: EmergenceMetricsSource): EmergenceMetrics {
  const now = snapshot.savedAtSimTimeMs;
  const rows = new Map<string, AgentEmergenceRow & { latencyTotal: number; latencySamples: number; listeners: Set<string>; addressees: Set<string>; diedAtMs?: number }>();
  for (const raw of snapshot.store.agents) {
    const agent = record(raw);
    const agentId = text(agent.id);
    rows.set(agentId, {
      agentId, name: text(agent.name, agentId), llmType: text(agent.llmType), modelId: '', effort: '',
      alive: agent.state !== 'dead', survivalMinutes: 0, decisions: 0, decisionsPerSimHour: 0, meanDecisionMs: null,
      inputTokens: 0, outputTokens: 0, failedTurns: 0, undecidedTurns: 0, unresponsive: false, utterances: 0, questions: 0,
      distinctListeners: 0, distinctAddressees: 0, giftsGiven: 0, giftsReceived: 0, strikes: 0, takes: 0, trades: 0,
      latencyTotal: 0, latencySamples: 0, listeners: new Set(), addressees: new Set(),
    });
  }
  const edges = new Map<string, InteractionEdge>();
  const edge = (from: string, to: string) => {
    const key = `${from}\u0000${to}`;
    let value = edges.get(key);
    if (!value) { value = { from, to, heard: 0, addressed: 0, gifts: 0, strikes: 0, takes: 0, trades: 0 }; edges.set(key, value); }
    return value;
  };
  const names = new Map<string, Set<string>>();
  let proposals = 0;

  for (const raw of snapshot.store.events) {
    const event = record(raw);
    const type = text(event.eventType);
    const row = rows.get(text(event.agentId));
    const payload = record(event.payload);
    if (!row) continue;
    const action = text(payload.action);
    const decided = !!action && (type === `agent_${action}` || type === 'action_failed');
    if (decided || type === 'agent_undecided') {
      if (decided) row.decisions++; else row.undecidedTurns++;
      // Deciding again (after an explicit restart) means the agent is responsive.
      row.unresponsive = false;
      const latency = number(payload.processingTimeMs);
      if (latency !== undefined) { row.latencyTotal += latency; row.latencySamples++; }
      const tokens = record(payload.tokens);
      row.inputTokens += number(tokens.input) ?? 0;
      row.outputTokens += number(tokens.output) ?? 0;
      if (typeof payload.modelId === 'string') row.modelId = payload.modelId;
      if (typeof payload.effort === 'string') row.effort = payload.effort;
      if (type === `agent_${action}`) {
        const counter = ACT_COUNTERS[action];
        const target = text(record(payload.params).targetAgentId);
        if (counter) {
          row[counter]++;
          if (target) edge(row.agentId, target)[counter]++;
        }
        if (action === 'name_location') {
          const name = text(record(payload.params).name).trim().toLowerCase();
          if (name) { proposals++; names.set(name, (names.get(name) ?? new Set()).add(row.agentId)); }
        }
      }
    } else if (type === 'agent_spoke') {
      row.utterances++;
      if (text(payload.message).includes('?')) row.questions++;
      const to = text(payload.to);
      if (to) { row.addressees.add(to); edge(row.agentId, to).addressed++; }
      for (const listener of Array.isArray(payload.listenerIds) ? payload.listenerIds : []) {
        if (typeof listener !== 'string') continue;
        row.listeners.add(listener);
        edge(row.agentId, listener).heard++;
      }
    } else if (type === 'agent_gave') {
      row.giftsGiven++;
      const recipient = text(payload.recipientId);
      if (recipient) { edge(row.agentId, recipient).gifts++; const other = rows.get(recipient); if (other) other.giftsReceived++; }
    } else if (type === 'agent_decision_failed') {
      row.failedTurns++;
    } else if (type === 'agent_unresponsive') {
      row.unresponsive = true;
    } else if (type === 'agent_died') {
      row.diedAtMs = number(payload.simTimeMs);
    }
  }

  const agents = [...rows.values()].map(({ latencyTotal, latencySamples, listeners, addressees, diedAtMs, ...row }) => {
    const survivalMinutes = Math.max(0, (row.alive ? now : diedAtMs ?? now) / 60_000);
    return {
      ...row,
      survivalMinutes: round(survivalMinutes),
      decisionsPerSimHour: survivalMinutes > 0 ? round(row.decisions / (survivalMinutes / 60)) : 0,
      meanDecisionMs: latencySamples > 0 ? Math.round(latencyTotal / latencySamples) : null,
      distinctListeners: listeners.size,
      distinctAddressees: addressees.size,
    };
  });

  const edgeList = [...edges.values()];
  const reciprocity = (field: keyof Pick<InteractionEdge, 'addressed' | 'gifts'>) => {
    const pairs = edgeList.filter((value) => value[field] > 0);
    if (pairs.length === 0) return null;
    return round(pairs.filter((value) => (edges.get(`${value.to}\u0000${value.from}`)?.[field] ?? 0) > 0).length / pairs.length);
  };
  const shared = [...names.values()].filter((proposers) => proposers.size >= 2).length;

  return {
    schemaVersion: 1,
    simMinutes: round(now / 60_000),
    agents,
    edges: edgeList,
    addressedReciprocity: reciprocity('addressed'),
    giftReciprocity: reciprocity('gifts'),
    placeNames: { proposals, distinctNames: names.size, sharedNames: shared },
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

function csv(rows: object[]): string {
  if (rows.length === 0) return '';
  const header = Object.keys(rows[0]);
  const cell = (value: unknown) => {
    const raw = value === null || value === undefined ? '' : String(value);
    // Quote, and neutralise spreadsheet formulas in model-chosen names.
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [header.join(','), ...rows.map((row) => header.map((key) => cell((row as JsonRecord)[key])).join(','))].join('\n');
}

export function emergenceAgentsCsv(metrics: EmergenceMetrics): string { return csv(metrics.agents); }
export function emergenceEdgesCsv(metrics: EmergenceMetrics): string { return csv(metrics.edges); }
