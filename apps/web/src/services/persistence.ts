import { hasPendingSecondaryWrites } from './secondary-data';
import { appData, APP_DATA_BUDGET } from './app-data';
import type { EngineSnapshotPayload, getEngineClient } from '../engine-host/engine-client';
import type { WorldEvent } from '../stores/world';
import type { WorldSnapshotV1 } from '@simagents/engine/engine/persistence';

export const WORLD_SNAPSHOT_KEY = 'simagents_world_snapshot';
export const EVENT_RING_KEY = 'simagents_event_ring';
export const WORLD_RECORD_KEY = 'world:current';
const EVENT_RING_LIMIT = 1000;
type EngineClient = ReturnType<typeof getEngineClient>;
export interface SavedWorld { snapshot: WorldSnapshotV1; events: WorldEvent[] }
export type WorldExportFile = SavedWorld;
export interface PersistenceInfo {
  snapshotBytes: number; ringBytes: number; quotaFraction: number;
  lastSavedSimTimeMs?: number; lastSavedTick?: number; lastSavedAt?: number;
  warning?: string; disabled: boolean; pending?: boolean;
}
let info: PersistenceInfo = { snapshotBytes: 0, ringBytes: 0, quotaFraction: 0, disabled: false };
const listeners = new Set<(info: PersistenceInfo) => void>();
let queue: Promise<unknown> = Promise.resolve();
let pendingWrites = 0;
let latestPayload: EngineSnapshotPayload | undefined;
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}
function emitInfo() { for (const listener of listeners) listener(info); }
function failed(error: unknown) {
  info = { ...info, pending: false, disabled: true, warning: `World not saved: ${error instanceof Error ? error.message : 'Local storage unavailable.'}` };
  emitInfo();
}
export function startPersistenceSync(client: EngineClient): () => void {
  const unsubscribe = client.onSnapshot(payload => persistSnapshotPayload(payload).catch(failed));
  const beforeUnload = (event: BeforeUnloadEvent) => {
    // IndexedDB cannot be flushed reliably during page teardown.
    if (info.pending || hasPendingSecondaryWrites() || (info.disabled && latestPayload)) { event.preventDefault(); event.returnValue = ''; }
  };
  window.addEventListener('beforeunload', beforeUnload);
  return () => { unsubscribe(); window.removeEventListener('beforeunload', beforeUnload); };
}
export async function loadSavedWorld(): Promise<SavedWorld | undefined> {
  return serial(async () => {
    try {
      const existing = await appData.read<WorldExportFile>(WORLD_RECORD_KEY);
      if (existing) {
        const saved = parseWorldExportFile(existing);
        info = { ...info, snapshotBytes: byteLength(JSON.stringify(saved.snapshot)), ringBytes: byteLength(JSON.stringify(saved.events)),
          lastSavedTick: saved.snapshot.store.worldState.currentTick as number, lastSavedSimTimeMs: saved.snapshot.savedAtSimTimeMs,
          quotaFraction: byteLength(JSON.stringify(saved)) / APP_DATA_BUDGET };
        emitInfo();
        return saved;
      }
      const snapshotJson = localStorage.getItem(WORLD_SNAPSHOT_KEY);
      if (!snapshotJson) return undefined;
      const eventsJson = localStorage.getItem(EVENT_RING_KEY);
      const saved = parseWorldExportFile({ snapshot: JSON.parse(snapshotJson), events: eventsJson ? JSON.parse(eventsJson) : [] });
      // Validate in the Worker without starting inference before migrating legacy data.
      const { getEngineClient } = await import('../engine-host/engine-client');
      await getEngineClient().validateSnapshot(saved.snapshot);
      await appData.write(WORLD_RECORD_KEY, saved, { onlyIfAbsent: true });
      if (localStorage.getItem(WORLD_SNAPSHOT_KEY) === snapshotJson && localStorage.getItem(EVENT_RING_KEY) === eventsJson) {
        localStorage.removeItem(WORLD_SNAPSHOT_KEY);
        localStorage.removeItem(EVENT_RING_KEY);
      }
      return await appData.read<SavedWorld>(WORLD_RECORD_KEY);
    } catch (error) { failed(error); throw error; }
  });
}
export async function saveImportedWorld(file: WorldExportFile): Promise<SavedWorld> {
  const saved = parseWorldExportFile(file);
  await persistSnapshotPayload({ snapshot: saved.snapshot, recentEvents: saved.events }, true);
  return saved;
}
export function clearSavedWorld(): Promise<void> {
  return serial(async () => {
    await appData.remove(WORLD_RECORD_KEY);
    localStorage.removeItem(WORLD_SNAPSHOT_KEY); localStorage.removeItem(EVENT_RING_KEY);
    latestPayload = undefined;
    info = { snapshotBytes: 0, ringBytes: 0, quotaFraction: 0, disabled: false }; emitInfo();
  });
}
export function persistSnapshotPayload(payload: EngineSnapshotPayload, imported = false): Promise<void> {
  // Capture immutable JSON before queueing, so later mutations cannot change a queued save.
  const saved = JSON.parse(JSON.stringify({ snapshot: payload.snapshot, events: normalizeEventRing(payload.recentEvents) })) as SavedWorld;
  const previousInfo = info;
  if (!imported) latestPayload = { snapshot: saved.snapshot, recentEvents: saved.events };
  pendingWrites++;
  info = { ...info, pending: true }; emitInfo();
  return serial(async () => {
    try {
      const total = await appData.write(WORLD_RECORD_KEY, saved);
      if (imported) latestPayload = { snapshot: saved.snapshot, recentEvents: saved.events };
      info = { snapshotBytes: byteLength(JSON.stringify(saved.snapshot)), ringBytes: byteLength(JSON.stringify(saved.events)),
        quotaFraction: total / APP_DATA_BUDGET, lastSavedSimTimeMs: saved.snapshot.savedAtSimTimeMs,
        lastSavedTick: saved.snapshot.store.worldState.currentTick as number, lastSavedAt: Date.now(),
        pending: pendingWrites > 1, disabled: false };
      emitInfo();
    } catch (error) {
      if (imported) { info = { ...previousInfo, warning: 'Import was not saved. The previous world is preserved.' }; emitInfo(); }
      else failed(error);
      throw error;
    }
    finally { pendingWrites--; info = { ...info, pending: pendingWrites > 0 }; emitInfo(); }
  });
}
export function getPersistenceInfo(): PersistenceInfo { return info; }
export function subscribePersistenceInfo(listener: (info: PersistenceInfo) => void): () => void {
  listeners.add(listener); listener(info); return () => { listeners.delete(listener); };
}
export function exportUnsavedWorld(): void {
  if (latestPayload) downloadWorldExport({ snapshot: latestPayload.snapshot, events: latestPayload.recentEvents });
}
export function parseWorldExportFile(input: unknown): WorldExportFile {
  if (!input || typeof input !== 'object') {
    throw new Error('Imported file must be a JSON object.');
  }
  const candidate = input as Partial<WorldExportFile>;
  if (!isWorldSnapshotV1(candidate.snapshot)) {
    throw new Error('Imported file has an unsupported snapshot schema.');
  }
  if (!Array.isArray(candidate.events) || !candidate.events.every(isWorldEvent)) {
    throw new Error('Imported file events are invalid.');
  }
  const agents = new Set((Array.isArray(candidate.snapshot.store.agents) ? candidate.snapshot.store.agents : []).map(agent => agent.id));
  const ids = new Set<string>();
  for (const event of candidate.events) {
    if (ids.has(event.id)) throw new Error('Imported event identities are duplicated.');
    ids.add(event.id);
    if (event.agentId && !agents.has(event.agentId)) throw new Error('Imported event references an unknown agent.');
    validateEventJson(event.payload);
  }
  return { snapshot: candidate.snapshot, events: candidate.events };
}

/** Save text as a file through a temporary object URL. */
export function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadWorldExport(file: WorldExportFile): void {
  const tick = file.snapshot.store.worldState.currentTick;
  const suffix = typeof tick === 'number' ? tick : file.snapshot.savedAtSimTimeMs;
  downloadText(`simagents-world-${suffix}.json`, JSON.stringify(file, null, 2), 'application/json');
}

function normalizeEventRing(events: WorldEvent[]): WorldEvent[] {
  return [...events]
    .sort((a, b) => b.timestamp - a.timestamp || b.tick - a.tick)
    .slice(0, EVENT_RING_LIMIT);
}

function isWorldSnapshotV1(value: unknown): value is WorldSnapshotV1 {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<WorldSnapshotV1>;
  return (
    snapshot.schemaVersion === 1 &&
    typeof snapshot.savedAtSimTimeMs === 'number' &&
    Number.isFinite(snapshot.savedAtSimTimeMs) &&
    typeof snapshot.worldSeed === 'string' &&
    typeof snapshot.speed === 'number' &&
    Number.isFinite(snapshot.speed) &&
    !!snapshot.store &&
    typeof snapshot.store === 'object' &&
    !!snapshot.engine &&
    typeof snapshot.engine === 'object'
  );
}

function isWorldEvent(value: unknown): value is WorldEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<WorldEvent>;
  return (
    typeof event.id === 'string' &&
    typeof event.type === 'string' &&
    typeof event.tick === 'number' &&
    Number.isSafeInteger(event.tick) && event.tick >= 0 &&
    typeof event.timestamp === 'number' &&
    Number.isFinite(event.timestamp) && event.timestamp >= 0 &&
    (!('agentId' in event) || event.agentId === undefined || typeof event.agentId === 'string') &&
    !!event.payload &&
    typeof event.payload === 'object' &&
    !Array.isArray(event.payload)
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateEventJson(value: unknown, depth = 0): void {
  if (depth > 50) throw new Error('Imported event nesting exceeds the limit.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach(item => validateEventJson(item, depth + 1)); return; }
  if (typeof value !== 'object' || value === null) throw new Error('Imported event contains invalid JSON.');
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Imported event contains an unsafe key.');
    validateEventJson(child, depth + 1);
  }
}
