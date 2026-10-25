import { validateSnapshotDomain } from './snapshot-domain';
import { snapshotRNG, restoreRNG, initializeLegacyRNG, validRandomSnapshot, type RandomSnapshot } from '../utils/random';
import { emptyMetrics, accumulateMetrics, validMetrics, type WorldMetrics } from './metrics';
/**
 * Versioned persistence for the browser-only engine.
 *
 * Snapshots are plain JSON and are designed for localStorage handoff: the
 * worker owns serialization/hydration, while the main thread owns storage.
 *
 * Random generator streams are saved independently from network timing. Restoring
 * their state does not replay pending requests or guarantee identical LLM output.
 */

import { validateRoster, validateConnectionProfile, type ConnectionProfile, type AgentRosterEntry } from '@simagents/shared';
import { getRuntimeOverrides, resetRuntimeConfig, setRuntimeConfig, type RuntimeConfigOverrides } from '../config';
import { getCustomSystemPrompt, setCustomSystemPrompt } from '../llm/prompt-manager';
import type {
  Agent,
  AgentClaim,
  AgentCredential,
  AgentKnowledge,
  AgentLineage,
  AgentMemory,
  AgentRelationship,
  AgentRole,
  Employment,
  Event,
  GossipEvent,
  InformationBelief,
  InventoryItem,
  JobOffer,
  LedgerEntry,
  LocationName,
  PuzzleAttempt,
  PuzzleFragment,
  PuzzleGame,
  PuzzleParticipant,
  PuzzleTeam,
  ReproductionState,
  ResourceSpawn,
  RetaliationChain,
  Shelter,
  WorldState,
} from '../db/schema';
import type { PublicWorkSession } from '../actions/state/public-work-sessions';
import {
  restore as restoreForageCooldowns,
  serialize as serializeForageCooldowns,
} from '../actions/state/forage-cooldowns';
import {
  restore as restorePublicWorkSessions,
  serialize as serializePublicWorkSessions,
} from '../actions/state/public-work-sessions';
import type { WorldEvent } from '../engine-memory/bus';
import {
  inventoryKey,
  relationshipKey,
  resetStore,
  STORE_EVENT_CAP,
  store,
} from '../engine-memory/store';
import {
  getLastCurrencyDecayBoundaryTick,
  setLastCurrencyDecayBoundaryTick,
} from './heartbeat';
import {
  restoreAgentMeta,
  serializeAgentMeta,
  type AgentEngineMeta,
} from './agent-meta';
import {
  restoreVitalsMeta,
  serializeVitalsMeta,
  type VitalsMeta,
} from './vitals-meta';

export const WORLD_SNAPSHOT_SCHEMA_VERSION = 1;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

type JsonEntry = [string, JsonValue];

export interface WorldStoreSnapshotV1 {
  worldState: JsonObject;
  agents: JsonObject[];
  resourceSpawns: JsonObject[];
  shelters: JsonObject[];
  inventory: JsonEntry[];
  events: JsonObject[];
  memories: JsonObject[];
  relationships: JsonObject[];
  scents: JsonEntry[];
  forageCooldowns: Array<[string, number]>;
  publicWorkSessions: Array<[string, PublicWorkSession]>;
  ledgerEntries: JsonObject[];
  jobOffers: JsonObject[];
  employments: JsonObject[];
  reproductionStates: JsonObject[];
  agentLineages: JsonObject[];
  gossipEvents: JsonObject[];
  nextGossipId: number;
  agentCredentials: JsonObject[];
  informationBeliefs: JsonObject[];
  agentRoles: JsonObject[];
  retaliationChains: JsonObject[];
  agentClaims: JsonObject[];
  agentKnowledge: JsonObject[];
  locationNames: JsonObject[];
  puzzleGames: JsonObject[];
  puzzleTeams: JsonObject[];
  puzzleFragments: JsonObject[];
  puzzleParticipants: JsonObject[];
  puzzleAttempts: JsonObject[];
  nextEventId: number;
  nextEventVersion: number;
}

export interface EngineMetadataSnapshotV1 {
  vitalsMeta: Array<[string, VitalsMeta]>;
  agentMeta: Array<[string, AgentEngineMeta]>;
  heartbeat: {
    lastCurrencyDecayBoundaryTick: number;
  };
}

export interface WorldSnapshotV1 {
  random?: RandomSnapshot;
  metrics?: WorldMetrics;
  configuration?: { overrides: RuntimeConfigOverrides; customPrompt: string | null; connections?: ConnectionProfile[]; roster?: AgentRosterEntry[]; /** Worlds run on scripted replies, not models */ dryRun?: boolean };
  schemaVersion: 1;
  savedAtSimTimeMs: number;
  worldSeed: string;
  speed: number;
  store: WorldStoreSnapshotV1;
  engine: EngineMetadataSnapshotV1;
}

export type WorldSnapshotErrorCode = 'INVALID_SNAPSHOT' | 'VERSION_MISMATCH';

export class WorldSnapshotError extends Error {
  constructor(
    readonly code: WorldSnapshotErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'WorldSnapshotError';
  }
}

export interface SerializeWorldOptions {
  savedAtSimTimeMs: number;
  worldSeed: string;
  speed: number;
}

const DATE_KEYS = new Set([
  'startedAt',
  'lastTickAt',
  'createdAt',
  'updatedAt',
  'diedAt',
  'completedAt',
  'lastSeenAt',
  'lastActiveAt',
  'usageDate',
  'startedAtDate',
]);

/** Max events embedded in a persisted snapshot (see comment at the use site). */
const SNAPSHOT_EVENT_CAP = 500;

export function serializeWorld(options: SerializeWorldOptions): WorldSnapshotV1 {
  const snapshot: WorldSnapshotV1 = {
    schemaVersion: WORLD_SNAPSHOT_SCHEMA_VERSION,
    metrics: store.metrics,
    random: snapshotRNG(),
    configuration: { overrides: JSON.parse(JSON.stringify(getRuntimeOverrides())), customPrompt: getCustomSystemPrompt() },
    savedAtSimTimeMs: finiteNumber(options.savedAtSimTimeMs, 'savedAtSimTimeMs'),
    worldSeed: options.worldSeed,
    speed: finiteNumber(options.speed, 'speed'),
    store: {
      worldState: toJsonObject(store.worldState),
      agents: mapValues(store.agents),
      resourceSpawns: mapValues(store.resourceSpawns),
      shelters: mapValues(store.shelters),
      inventory: mapEntries(store.inventory),
      // Deliberately much smaller than the in-memory cap: hydration only needs
      // the agent-runner's last-10-per-agent observation lookback. LLM decision
      // events carry full reasoning strings, so persisting the 10k in-memory
      // cap would blow the ~5MB localStorage quota on long-running worlds.
      // The UI feed re-populates from the event ring; full history is
      // export-only.
      events: arrayValues(store.events.slice(-SNAPSHOT_EVENT_CAP)),
      memories: mapValues(store.memories),
      relationships: mapValues(store.relationships),
      scents: mapEntries(store.scents),
      forageCooldowns: serializeForageCooldowns(),
      publicWorkSessions: serializePublicWorkSessions(),
      ledgerEntries: arrayValues(store.ledgerEntries),
      jobOffers: mapValues(store.jobOffers),
      employments: mapValues(store.employments),
      reproductionStates: mapValues(store.reproductionStates),
      agentLineages: mapValues(store.agentLineages),
      gossipEvents: arrayValues(store.gossipEvents),
      nextGossipId: store.nextGossipId,
      agentCredentials: mapValues(store.agentCredentials),
      informationBeliefs: mapValues(store.informationBeliefs),
      agentRoles: mapValues(store.agentRoles),
      retaliationChains: arrayValues(store.retaliationChains),
      agentClaims: mapValues(store.agentClaims),
      agentKnowledge: mapValues(store.agentKnowledge),
      locationNames: mapValues(store.locationNames),
      puzzleGames: mapValues(store.puzzleGames),
      puzzleTeams: mapValues(store.puzzleTeams),
      puzzleFragments: mapValues(store.puzzleFragments),
      puzzleParticipants: mapValues(store.puzzleParticipants),
      puzzleAttempts: mapValues(store.puzzleAttempts),
      nextEventId: store.nextEventId,
      nextEventVersion: store.nextEventVersion,
    },
    engine: {
      vitalsMeta: serializeVitalsMeta(),
      agentMeta: serializeAgentMeta(),
      heartbeat: {
        lastCurrencyDecayBoundaryTick: getLastCurrencyDecayBoundaryTick(),
      },
    },
  };
  return JSON.parse(JSON.stringify(snapshot)) as WorldSnapshotV1;
}

export function hydrateWorld(input: unknown): void {
  const snapshot = validateWorldSnapshotV1(input);
  resetStore();
  if (snapshot.random) restoreRNG(snapshot.random);
  else initializeLegacyRNG(snapshot.worldSeed);
  if (snapshot.configuration) {
    resetRuntimeConfig();
    setRuntimeConfig(snapshot.configuration.overrides);
    setCustomSystemPrompt(snapshot.configuration.customPrompt);
  }

  store.worldState = reviveRow<WorldState>(snapshot.store.worldState);
  restoreRowsById(store.agents, snapshot.store.agents, 'agents');
  restoreRowsById(store.resourceSpawns, snapshot.store.resourceSpawns, 'resourceSpawns');
  restoreRowsById(store.shelters, snapshot.store.shelters, 'shelters');
  restoreInventory(snapshot.store.inventory);
  store.events = arrayRows<Event>(snapshot.store.events).slice(-STORE_EVENT_CAP);
  store.metrics = snapshot.metrics ? JSON.parse(JSON.stringify(snapshot.metrics)) : emptyMetrics(false);
  if (!snapshot.metrics) for (const event of store.events) accumulateMetrics(store.metrics, event, event.agentId ? store.agents.get(event.agentId)?.llmType : undefined, store.agents.size);
  restoreRowsById(store.memories, snapshot.store.memories, 'memories');
  restoreRelationships(snapshot.store.relationships);
  restoreEntries(store.scents, snapshot.store.scents, 'scents');
  restoreForageCooldowns(snapshot.store.forageCooldowns);
  restorePublicWorkSessions(snapshot.store.publicWorkSessions);
  store.ledgerEntries = arrayRows<LedgerEntry>(snapshot.store.ledgerEntries);
  restoreRowsById(store.jobOffers, snapshot.store.jobOffers, 'jobOffers');
  restoreRowsById(store.employments, snapshot.store.employments, 'employments');
  restoreRowsById(store.reproductionStates, snapshot.store.reproductionStates, 'reproductionStates');
  restoreRowsById(store.agentLineages, snapshot.store.agentLineages, 'agentLineages');
  store.gossipEvents = arrayRows<GossipEvent>(snapshot.store.gossipEvents);
  store.nextGossipId = snapshot.store.nextGossipId;
  restoreRowsById(store.agentCredentials, snapshot.store.agentCredentials, 'agentCredentials');
  restoreRowsById(store.informationBeliefs, snapshot.store.informationBeliefs, 'informationBeliefs');
  restoreAgentRoles(snapshot.store.agentRoles);
  store.retaliationChains = arrayRows<RetaliationChain>(snapshot.store.retaliationChains);
  restoreRowsById(store.agentClaims, snapshot.store.agentClaims, 'agentClaims');
  restoreRowsById(store.agentKnowledge, snapshot.store.agentKnowledge, 'agentKnowledge');
  restoreRowsById(store.locationNames, snapshot.store.locationNames, 'locationNames');
  restoreRowsById(store.puzzleGames, snapshot.store.puzzleGames, 'puzzleGames');
  restoreRowsById(store.puzzleTeams, snapshot.store.puzzleTeams, 'puzzleTeams');
  restoreRowsById(store.puzzleFragments, snapshot.store.puzzleFragments, 'puzzleFragments');
  restoreRowsById(store.puzzleParticipants, snapshot.store.puzzleParticipants, 'puzzleParticipants');
  restoreRowsById(store.puzzleAttempts, snapshot.store.puzzleAttempts, 'puzzleAttempts');
  store.nextEventId = snapshot.store.nextEventId;
  store.nextEventVersion = snapshot.store.nextEventVersion;

  restoreVitalsMeta(snapshot.engine.vitalsMeta);
  restoreAgentMeta(snapshot.engine.agentMeta);
  setLastCurrencyDecayBoundaryTick(
    snapshot.engine.heartbeat.lastCurrencyDecayBoundaryTick
  );
}

export function validateWorldSnapshotV1(input: unknown): WorldSnapshotV1 {
  if (!isObject(input)) {
    throw new WorldSnapshotError('INVALID_SNAPSHOT', 'Snapshot must be an object');
  }

  if (input.schemaVersion !== WORLD_SNAPSHOT_SCHEMA_VERSION) {
    throw new WorldSnapshotError(
      'VERSION_MISMATCH',
      `Unsupported world snapshot schema version: ${String(input.schemaVersion)}`
    );
  }

  validateJson(input, 'snapshot');
  const snapshot = input as Partial<WorldSnapshotV1>;
  if (snapshot.configuration !== undefined) {
    if (!isObject(snapshot.configuration) || !isObject(snapshot.configuration.overrides) ||
      (snapshot.configuration.customPrompt !== null && typeof snapshot.configuration.customPrompt !== 'string')) {
      throw invalid('Invalid snapshot configuration');
    }
    if (snapshot.configuration.dryRun !== undefined && typeof snapshot.configuration.dryRun !== 'boolean') throw invalid('Invalid dry run flag');
    if (snapshot.configuration.roster !== undefined) validateRoster(snapshot.configuration.roster);
    if (snapshot.configuration.connections !== undefined) {
      if (!Array.isArray(snapshot.configuration.connections) || snapshot.configuration.connections.length > 100) throw invalid('Invalid connection metadata');
      for (const connection of snapshot.configuration.connections) validateConnectionProfile(connection);
    }
  }
  if (snapshot.random !== undefined && !validRandomSnapshot(snapshot.random)) throw invalid('Invalid random generator state');
  if (snapshot.metrics !== undefined && !validMetrics(snapshot.metrics)) throw invalid('Invalid cumulative metrics');
  requireFinite(snapshot.savedAtSimTimeMs, 'savedAtSimTimeMs');
  requireFinite(snapshot.speed, 'speed');
  if (snapshot.speed! < 0 || snapshot.savedAtSimTimeMs! < 0) throw invalid('Negative snapshot time or speed');
  if (typeof snapshot.worldSeed !== 'string') {
    throw invalid('worldSeed must be a string');
  }
  if (!isObject(snapshot.store)) throw invalid('store must be an object');
  if (!isObject(snapshot.engine)) throw invalid('engine must be an object');
  validateStoreSnapshot(snapshot.store as Partial<WorldStoreSnapshotV1>);
  validateEngineSnapshot(snapshot.engine as Partial<EngineMetadataSnapshotV1>);

  try { validateSnapshotDomain(snapshot as WorldSnapshotV1); }
  catch (error) { throw invalid(error instanceof Error ? error.message : 'Invalid snapshot domain'); }
  return snapshot as WorldSnapshotV1;
}

export function getStoredWorldEvents(limit?: number): WorldEvent[] {
  const rows = [...store.events].reverse();
  const selected = limit === undefined ? rows : rows.slice(0, Math.max(0, limit));
  return selected.map(storedEventToWorldEvent);
}

function storedEventToWorldEvent(event: Event): WorldEvent {
  return {
    id: `store-${event.id}`,
    type: event.eventType,
    tick: event.tick,
    timestamp: event.createdAt.getTime(),
    ...(event.agentId ? { agentId: event.agentId } : {}),
    payload: event.payload as Record<string, unknown>,
  };
}

function validateStoreSnapshot(snapshot: Partial<WorldStoreSnapshotV1>): void {
  const arrayFields: Array<keyof WorldStoreSnapshotV1> = [
    'agents',
    'resourceSpawns',
    'shelters',
    'inventory',
    'events',
    'memories',
    'relationships',
    'scents',
    'forageCooldowns',
    'publicWorkSessions',
    'ledgerEntries',
    'jobOffers',
    'employments',
    'reproductionStates',
    'agentLineages',
    'gossipEvents',
    'agentCredentials',
    'informationBeliefs',
    'agentRoles',
    'retaliationChains',
    'agentClaims',
    'agentKnowledge',
    'locationNames',
    'puzzleGames',
    'puzzleTeams',
    'puzzleFragments',
    'puzzleParticipants',
    'puzzleAttempts',
  ];
  if (!isObject(snapshot.worldState)) throw invalid('store.worldState must be an object');
  for (const field of arrayFields) {
    const rows = snapshot[field];
    if (!Array.isArray(rows)) throw invalid(`store.${field} must be an array`);
    const entries = ['inventory', 'scents', 'forageCooldowns', 'publicWorkSessions'].includes(field);
    const ids = new Set<string>();
    const keyed = !entries && !['events', 'ledgerEntries', 'gossipEvents', 'retaliationChains', 'agentRoles', 'relationships'].includes(field);
    for (const row of rows) {
      if (entries) {
        if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string') throw invalid(`Invalid ${field} entry`);
        if (field === 'forageCooldowns') requireFinite(row[1], field);
        else if (!isObject(row[1])) throw invalid(`Invalid ${field} value`);
      } else {
        if (!isObject(row)) throw invalid(`Invalid ${field} row`);
        if (keyed) {
          if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw invalid(`Invalid or duplicate ${field} id`);
          ids.add(row.id);
        }
      }
    }
  }
  for (const agent of snapshot.agents ?? []) {
    for (const key of ['x', 'y', 'hunger', 'energy', 'health', 'balance']) {
      requireFinite(agent[key], `agents.${key}`);
      if ((agent[key] as number) < 0) throw invalid(`Negative agents.${key}`);
    }
    if (!Number.isInteger(agent.x) || !Number.isInteger(agent.y)) throw invalid('Fractional agent position');
    for (const key of ['hunger', 'energy', 'health']) if ((agent[key] as number) > 100) throw invalid(`Invalid agents.${key}`);
    for (const key of ['llmType', 'state', 'color']) if (typeof agent[key] !== 'string') throw invalid(`Invalid agents.${key}`);
  }
  requireFinite(snapshot.nextGossipId, 'store.nextGossipId');
  requireFinite(snapshot.nextEventId, 'store.nextEventId');
  requireFinite(snapshot.nextEventVersion, 'store.nextEventVersion');
}

function validateEngineSnapshot(snapshot: Partial<EngineMetadataSnapshotV1>): void {
  if (!Array.isArray(snapshot.vitalsMeta)) throw invalid('engine.vitalsMeta must be an array');
  if (!Array.isArray(snapshot.agentMeta)) throw invalid('engine.agentMeta must be an array');
  for (const [label, entries] of [['vitalsMeta', snapshot.vitalsMeta], ['agentMeta', snapshot.agentMeta]] as const) {
    for (const entry of entries!) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !isObject(entry[1])) throw invalid(`Invalid ${label}`);
      if (label === 'agentMeta') requireFinite((entry[1] as AgentEngineMeta).busyUntil, label);
      else {
        const meta = entry[1] as VitalsMeta;
        requireFinite(meta.vitalsUpdatedAt, label);
        if (!isObject(meta.criticalSince)) throw invalid('Invalid criticalSince');
      }
    }
  }
  if (!isObject(snapshot.heartbeat)) throw invalid('engine.heartbeat must be an object');
  requireFinite(
    snapshot.heartbeat.lastCurrencyDecayBoundaryTick,
    'engine.heartbeat.lastCurrencyDecayBoundaryTick'
  );
}

function restoreRowsById<T extends { id: string }>(
  target: Map<string, T>,
  rows: JsonObject[],
  label: string
): void {
  target.clear();
  for (const rawRow of rows) {
    if (typeof rawRow.id !== 'string') throw invalid(`${label} row is missing id`);
    const row = reviveRow<T>(rawRow);
    target.set(row.id, row);
  }
}

function restoreInventory(entries: JsonEntry[]): void {
  store.inventory.clear();
  for (const [key, rawValue] of entries) {
    if (!isObject(rawValue)) throw invalid('inventory entry value must be an object');
    const row = reviveRow<InventoryItem>(rawValue);
    store.inventory.set(key || inventoryKey(row.agentId, row.itemType), row);
  }
}

function restoreRelationships(rows: JsonObject[]): void {
  store.relationships.clear();
  for (const rawRow of rows) {
    const row = reviveRow<AgentRelationship>(rawRow);
    store.relationships.set(relationshipKey(row.agentId, row.otherAgentId), row);
  }
}

function restoreAgentRoles(rows: JsonObject[]): void {
  store.agentRoles.clear();
  for (const rawRow of rows) {
    const row = reviveRow<AgentRole>(rawRow);
    store.agentRoles.set(row.agentId, row);
  }
}

function restoreEntries<T>(
  target: Map<string, T>,
  entries: JsonEntry[],
  label: string
): void {
  target.clear();
  for (const [key, rawValue] of entries) {
    if (typeof key !== 'string') throw invalid(`${label} entry key must be a string`);
    target.set(key, reviveDates(rawValue) as T);
  }
}

function arrayRows<T>(values: JsonObject[]): T[] {
  return values.map((value) => reviveRow<T>(value));
}

function reviveRow<T>(value: JsonObject): T {
  // Only entity columns are dates; user/model payloads retain their JSON text.
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    typeof child === 'string' && DATE_KEYS.has(key) ? new Date(child) : child,
  ])) as T;
}

function mapValues<T>(map: Map<string, T>): JsonObject[] {
  return [...map.values()].map(toJsonObject);
}

function mapEntries<T>(map: Map<string, T>): JsonEntry[] {
  return [...map.entries()].map(([key, value]) => [key, toJsonValue(value)]);
}

function arrayValues<T>(values: T[]): JsonObject[] {
  return values.map(toJsonObject);
}

function toJsonObject(value: unknown): JsonObject {
  const json = toJsonValue(value);
  if (!isObject(json)) throw invalid('Expected object while serializing snapshot row');
  return json;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (typeof value === 'object') {
    const result: JsonObject = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child !== undefined) result[key] = toJsonValue(child);
    }
    return result;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return null;
}

function reviveDates(value: JsonValue, key?: string): unknown {
  if (value === null) return null;
  if (typeof value === 'string' && key && DATE_KEYS.has(key)) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      // Not parseable as a date: this can legitimately happen for a date-named
      // key inside a free-form event/action payload. Keep the original string
      // rather than failing the whole resume.
      return value;
    }
    return date;
  }
  if (Array.isArray(value)) return value.map((item) => reviveDates(item));
  if (isObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = reviveDates(childValue, childKey);
    }
    return result;
  }
  return value;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: number, label: string): number {
  requireFinite(value, label);
  return value;
}

function requireFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalid(`${label} must be a finite number`);
  }
}

function invalid(message: string): WorldSnapshotError {
  return new WorldSnapshotError('INVALID_SNAPSHOT', message);
}

// Type-only references keep the snapshot field list in sync with the store rows.
type _SnapshotRowTypes =
  | Agent
  | AgentClaim
  | AgentCredential
  | AgentKnowledge
  | AgentLineage
  | AgentMemory
  | Employment
  | Event
  | GossipEvent
  | InformationBelief
  | InventoryItem
  | JobOffer
  | LedgerEntry
  | LocationName
  | PuzzleAttempt
  | PuzzleFragment
  | PuzzleGame
  | PuzzleParticipant
  | PuzzleTeam
  | ReproductionState
  | ResourceSpawn
  | RetaliationChain
  | Shelter
  | WorldState;

/** Reject malformed nested data before any reset or hydration takes place. */
function validateJson(value: unknown, path: string, depth = 0): void {
  if (depth > 50) throw invalid('Snapshot nesting exceeds limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { requireFinite(value, path); return; }
  if (Array.isArray(value)) { for (const item of value) validateJson(item, path, depth + 1); return; }
  if (!isObject(value)) throw invalid(`Invalid JSON value at ${path}`);
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw invalid('Unsafe snapshot key');
    validateJson(item, `${path}.${key}`, depth + 1);
  }
}
