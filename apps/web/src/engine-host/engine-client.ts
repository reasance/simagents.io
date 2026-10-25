import { AppError, errorIssue, isAppIssue, type AppIssue } from '@simagents/shared';
import { formatIssue } from '../i18n/errors';
import { recordRequestTrace } from '../services/promptLogs';
import type { RequestTrace } from '@simagents/engine/engine/llm/request-trace';
import { flushSecondaryData } from '../services/secondary-data';
import type { AgentRosterEntry, LLMType } from '@simagents/shared';
import type { DecisionInput } from '@simagents/engine/engine/decision';
import type { SimEngineState } from '@simagents/engine/engine/engine';
import type { WorldSnapshotV1 } from '@simagents/engine/engine/persistence';
import type { EmergenceMetrics } from '@simagents/engine/engine/emergence-metrics';
import {
  exportExperimentRun,
  loadExperimentRuns,
  saveExperimentDefinition,
  saveExperimentRun,
  type BrowserExperimentDefinition,
  type BrowserExperimentExport,
  type BrowserExperimentRun,
} from '../services/experiments';
import type { AgentTimelineEntry, TickRange, WorldSnapshot } from '../stores/replay';
import type {
  PuzzleDetails,
  PuzzleFilter,
  PuzzleGame,
  PuzzleResults,
  PuzzleStats,
} from '../stores/puzzles';
import type { WorldEvent } from '../stores/world';

export interface EngineInitPayload {
  captureRequests?: boolean;
  limits?: import('@simagents/engine/engine/llm/request-budget').SessionLimits;
  roster: AgentRosterEntry[];
  connections?: import('@simagents/shared').ConnectionProfile[];
  keys: Partial<Record<string, string>>;
  proxyUrl?: string;
  speed: number;
  worldSeed?: string;
  configOverrides?: Record<string, unknown>;
  customPrompt?: string | null;
  resume?: WorldSnapshotV1;
}

export type WorkerCommand =
  | { cmd: 'init'; payload: EngineInitPayload }
  | { cmd: 'validateSnapshot'; snapshot: WorldSnapshotV1 }
  | { cmd: 'suspendRelayAccess'; relayUrl: string }
  | { cmd: 'updateRelayToken'; relayUrl: string; token: string }
  | { cmd: 'start' }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'reset' }
  | { cmd: 'setSpeed'; speed: number }
  | { cmd: 'getState' }
  | { cmd: 'snapshot' }
  | { cmd: 'export' }
  | { cmd: 'emergenceMetrics' }
  | { cmd: 'setRuntimeConfig'; updates: Record<string, unknown> }
  | { cmd: 'setCustomPrompt'; prompt: string | null }
  | { cmd: 'getReplayRange'; requestId: string }
  | { cmd: 'getReplayFrame'; requestId: string; tick: number }
  | { cmd: 'getAgentTimeline'; requestId: string; agentId: string; limit?: number }
  | { cmd: 'getPuzzles'; requestId: string; filter?: PuzzleFilter }
  | { cmd: 'getPuzzleDetails'; requestId: string; puzzleId: string }
  | { cmd: 'getPuzzleResults'; requestId: string; puzzleId: string }
  | { cmd: 'getPuzzleStats'; requestId: string }
  | { cmd: 'runExperiment'; requestId: string; definition: BrowserExperimentDefinition }
  | { cmd: 'cancelExperiment'; requestId: string; runId?: string }
  | { cmd: 'getExperimentStatus'; requestId: string; runId?: string }
  | { cmd: 'exportExperiment'; requestId: string; runId: string }
  | { cmd: 'registerBrowserAgentAdapter'; requestId: string; registration: BrowserAgentAdapterRegistration };

export interface EngineSnapshotPayload {
  snapshot: WorldSnapshotV1;
  recentEvents: WorldEvent[];
}

export interface EngineExportPayload {
  snapshot: WorldSnapshotV1;
  events: WorldEvent[];
}

type WorkerMessage =
  | { type: 'requestTrace'; trace: RequestTrace }
  | { type: 'ready'; state: SimEngineState }
  | { type: 'event'; event: WorldEvent }
  | { type: 'state'; state: SimEngineState }
  | { type: 'snapshot'; snapshot: WorldSnapshotV1; recentEvents: WorldEvent[] }
  | { type: 'export'; snapshot: WorldSnapshotV1; events: WorldEvent[] }
  | { type: 'replayFrame'; frame: StoredReplayFrame }
  | { type: 'response'; requestId: string; payload: unknown }
  | { type: 'warning'; message: string; issue?: unknown }
  | { type: 'error'; message: string; requestId?: string; issue?: AppIssue };

export interface StoredReplayFrame {
  worldSeed?: string;
  schemaVersion: 1;
  tick: number;
  simTimeMs: number;
  capturedAt: number;
  snapshot: WorldSnapshot;
}

export interface BrowserAgentAdapterRegistration {
  id: string;
  label?: string;
  agentIds?: string[];
  agentNames?: string[];
  allAgents?: boolean;
  latencyMs?: number;
  fallbackAction?: DecisionInput;
}

type EventListener = (event: WorldEvent) => void;
type StateListener = (state: SimEngineState) => void;
type StatusListener = (status: EngineClientStatus) => void;
type SnapshotListener = (payload: EngineSnapshotPayload) => void | Promise<void>;
type WarningListener = (message: string, issue?: AppIssue) => void;

export type EngineClientStatus = 'disconnected' | 'connecting' | 'connected';

export class EngineClient {
  constructor(private readonly commandTimeoutMs = 30_000) {}

  private worker: Worker | undefined;
  private status: EngineClientStatus = 'disconnected';
  private running = false;
  private paused = false;
  private sessionId = '';
  private relayUrls = new Set<string>();
  private requestSeq = 0;
  private readonly pendingRequests = new Map<string, {
    resolve: (payload: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private snapshotWrites: Promise<unknown> = Promise.resolve();
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly warningListeners = new Set<WarningListener>();

  async init(payload: EngineInitPayload): Promise<SimEngineState> {
    if (payload.resume) await this.validateSnapshot(payload.resume);
    this.resetHard();
    this.sessionId = crypto.randomUUID();
    this.relayUrls = new Set((payload.connections ?? []).filter(profile => profile.transport === 'official-relay').map(profile => profile.relayUrl!));
    this.setStatus('connecting');
    return this.request<SimEngineState>(() => ({ cmd: 'init', payload }));
  }

  async validateSnapshot(snapshot: WorldSnapshotV1): Promise<void> {
    await this.request(() => ({ cmd: 'validateSnapshot', snapshot }));
  }

  usesRelay(relayUrl: string): boolean { return this.status === 'connected' && this.relayUrls.has(relayUrl); }

  async suspendRelayAccess(relayUrl: string): Promise<void> {
    await this.request(() => ({ cmd: 'suspendRelayAccess', relayUrl }));
    this.paused = true;
    await this.snapshotWrites;
    await flushSecondaryData();
  }

  async updateRelayToken(relayUrl: string, token: string): Promise<void> {
    if (!this.worker || this.status !== 'connected') throw new Error('Engine not initialized');
    await this.request(() => ({ cmd: 'updateRelayToken', relayUrl, token }));
  }

  async start(): Promise<void> {
    await this.request(() => ({ cmd: 'start' }));
    this.running = true;
    this.paused = false;
  }

  async pause(): Promise<void> {
    await this.request(() => ({ cmd: 'pause' }));
    this.paused = true;
    await this.snapshotWrites;
    await flushSecondaryData();
  }

  async resume(): Promise<void> {
    await this.request(() => ({ cmd: 'resume' }));
    this.running = true;
    this.paused = false;
  }

  async reset(): Promise<SimEngineState> {
    const state = await this.request<SimEngineState>(() => ({ cmd: 'reset' }));
    this.running = false;
    this.paused = false;
    return state;
  }

  resetHard(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.sessionId = '';
    this.relayUrls.clear();
    this.running = false;
    this.paused = false;
    this.rejectPending(new Error('Engine worker reset'));
    this.setStatus('disconnected');
  }

  async setSpeed(speed: number): Promise<void> {
    await this.request(() => ({ cmd: 'setSpeed', speed }));
  }

  async setRuntimeConfig(updates: Record<string, unknown>): Promise<void> {
    await this.request(() => ({ cmd: 'setRuntimeConfig', updates }));
  }

  async setCustomPrompt(prompt: string | null): Promise<void> {
    await this.request(() => ({ cmd: 'setCustomPrompt', prompt }));
  }

  getState(): Promise<SimEngineState> {
    return this.request(() => ({ cmd: 'getState' }));
  }

  requestSnapshot(): Promise<EngineSnapshotPayload> {
    return this.request(() => ({ cmd: 'snapshot' }));
  }

  exportWorld(): Promise<EngineExportPayload> {
    return this.request(() => ({ cmd: 'export' }));
  }

  /** Relational metrics computed in the worker over the live event log, without exporting the world. */
  getEmergenceMetrics(): Promise<EmergenceMetrics> {
    return this.request(() => ({ cmd: 'emergenceMetrics' }));
  }

  async getReplayRange(): Promise<TickRange> {
    return (await import('../stores/replay')).fetchTickRange();
  }

  async getReplayFrame(tick: number): Promise<WorldSnapshot> {
    const replay = await import('../stores/replay');
    await replay.fetchTickRange();
    return replay.fetchWorldSnapshot(tick);
  }

  async getAgentTimeline(agentId: string, limit = 100): Promise<AgentTimelineEntry[]> {
    const replay = await import('../stores/replay');
    await replay.fetchTickRange();
    return replay.fetchAgentTimeline(agentId, limit);
  }

  async getPuzzles(filter: PuzzleFilter = 'all'): Promise<PuzzleGame[]> {
    return this.request<PuzzleGame[]>((requestId) => ({ cmd: 'getPuzzles', requestId, filter }));
  }

  async getPuzzleDetails(puzzleId: string): Promise<PuzzleDetails> {
    return this.request<PuzzleDetails>((requestId) => ({ cmd: 'getPuzzleDetails', requestId, puzzleId }));
  }

  async getPuzzleResults(puzzleId: string): Promise<PuzzleResults> {
    return this.request<PuzzleResults>((requestId) => ({ cmd: 'getPuzzleResults', requestId, puzzleId }));
  }

  async getPuzzleStats(): Promise<PuzzleStats> {
    return this.request<PuzzleStats>((requestId) => ({ cmd: 'getPuzzleStats', requestId }));
  }

  async runExperiment(definition: BrowserExperimentDefinition): Promise<BrowserExperimentRun> {
    if (definition.id || definition.name) await saveExperimentDefinition(definition);
    const run = await this.request<BrowserExperimentRun>((requestId) => ({
      cmd: 'runExperiment',
      requestId,
      definition,
    }));
    await saveExperimentRun(run);
    return run;
  }

  async cancelExperiment(runId?: string): Promise<BrowserExperimentRun | undefined> {
    const run = await this.request<BrowserExperimentRun | undefined>((requestId) => ({
      cmd: 'cancelExperiment',
      requestId,
      runId,
    }));
    if (run) await saveExperimentRun(run);
    return run;
  }

  async getExperimentStatus(runId?: string): Promise<BrowserExperimentRun | undefined> {
    return this.request<BrowserExperimentRun | undefined>((requestId) => ({
      cmd: 'getExperimentStatus',
      requestId,
      runId,
    }));
  }

  async exportExperiment(runId: string): Promise<BrowserExperimentExport> {
    const saved = (await loadExperimentRuns()).find(item => item.id === runId);
    if (saved) return exportExperimentRun(saved);
    const run = await this.request<BrowserExperimentRun | undefined>((requestId) => ({
      cmd: 'exportExperiment',
      requestId,
      runId,
    }));
    const storedRun = run ?? (await loadExperimentRuns()).find((item) => item.id === runId);
    if (!storedRun) throw new Error(`Experiment run not found: ${runId}`);
    return exportExperimentRun(storedRun);
  }

  async registerBrowserAgentAdapter(
    registration: BrowserAgentAdapterRegistration
  ): Promise<{ id: string; appliedTo: number }> {
    return this.request<{ id: string; appliedTo: number }>((requestId) => ({
      cmd: 'registerBrowserAgentAdapter',
      requestId,
      registration,
    }));
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  onSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onWarning(listener: WarningListener): () => void {
    this.warningListeners.add(listener);
    return () => this.warningListeners.delete(listener);
  }

  getStatus(): EngineClientStatus {
    return this.status;
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  private ensureWorker(): void {
    if (this.worker) return;

    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const worker = this.worker;
    this.worker.onmessage = (message: MessageEvent<WorkerMessage & { sessionId: string }>) => {
      if (this.worker === worker && message.data.sessionId === this.sessionId) this.handleMessage(message.data);
    };
    this.worker.onerror = (error) => {
      if (this.worker !== worker) return;
      const message = error.message || 'Engine worker failed';
      this.rejectPending(new Error(message));
      this.resetHard();
      for (const listener of this.warningListeners) listener(message);
    };
  }

  private request<T>(build: (requestId: string) => WorkerCommand): Promise<T> {
    this.ensureWorker();
    const requestId = `req-${++this.requestSeq}`;
    const command = build(requestId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        // Outcome is ambiguous: stop the session, never resend the request.
        this.resetHard();
        const message = `Engine command ${command.cmd} timed out. Restart explicitly; the request was not retried.`;
        for (const listener of this.warningListeners) listener(message);
        reject(new Error(message));
      }, command.cmd === 'runExperiment' ? 3_600_000 : this.commandTimeoutMs);
      this.pendingRequests.set(requestId, {
        resolve: (payload) => resolve(payload as T), reject, timer,
      });
      try {
        this.worker!.postMessage({ ...command, requestId, sessionId: this.sessionId });
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  private handleMessage(message: WorkerMessage): void {
    switch (message.type) {
      case 'ready':
        this.setStatus('connected');
        this.emitState(message.state);
        break;
      case 'state':
        this.emitState(message.state);
        break;
      case 'event':
        for (const listener of this.eventListeners) {
          listener(message.event);
        }
        break;
      case 'snapshot': {
        const payload = {
          snapshot: message.snapshot,
          recentEvents: message.recentEvents,
        };
        for (const listener of this.snapshotListeners) {
          const write = listener(payload);
          this.snapshotWrites = Promise.all([this.snapshotWrites, write]).catch(() => undefined);
        }
        break;
      }
      case 'export':
        break;
      case 'requestTrace':
        void recordRequestTrace(message.trace);
        break;
      case 'replayFrame':
        window.dispatchEvent(new CustomEvent('simagents:replay-frame', { detail: message.frame }));
        break;
      case 'response': {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(message.requestId);
          pending.resolve(message.payload);
        }
        break;
      }
      case 'warning':
        console.warn('[EngineWorker]', message.message);
        for (const listener of this.warningListeners) {
          const issue = isAppIssue(message.issue) ? message.issue : errorIssue(message.message);
          listener(formatIssue(issue), issue);
        }
        break;
      case 'error': {
        const issue = isAppIssue(message.issue) ? message.issue : errorIssue(message.message);
        const error = new AppError(issue, formatIssue(issue));
        if (message.requestId) {
          const pending = this.pendingRequests.get(message.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(message.requestId);
            pending.reject(error);
            break;
          }
        }
        this.running = false;
        this.paused = true;
        this.rejectPending(error);
        for (const listener of this.warningListeners) listener(error.message, issue);
        console.error('[EngineWorker]', { code: issue.code });
        break;
      }
    }
  }

  private emitState(state: SimEngineState): void {
    this.running = state.lifecycle === 'running' || state.lifecycle === 'paused';
    this.paused = state.lifecycle === 'paused' || state.lifecycle === 'error';
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private setStatus(status: EngineClientStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private rejectPending(error: Error): void {
    for (const { reject, timer } of this.pendingRequests.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pendingRequests.clear();
  }
}

const singleton = new EngineClient();
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && singleton.isRunning() && !singleton.isPaused()) {
      void singleton.pause().catch(() => singleton.resetHard());
    }
  });
}

declare global {
  interface Window {
    __simagentsEngineClient?: EngineClient;
  }
}

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.__simagentsEngineClient = singleton;
}

export function getEngineClient(): EngineClient {
  return singleton;
}
