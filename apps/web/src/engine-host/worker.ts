import { AppError, errorIssue } from '@simagents/shared';
import { MAX_SESSION_TRACES } from '@simagents/engine/engine/llm/request-trace';
import { RequestBudget, DEFAULT_SESSION_LIMITS, RequestBudgetError, validateSessionLimits, type SessionLimits } from '@simagents/engine/engine/llm/request-budget';
import { byokPreflightIssue, internalFixturesEnabled } from '../services/byok-preflight-issue';
import { validateRoster, validateConnectionProfile, type AgentRosterEntry, type LLMType, type ConnectionProfile } from '@simagents/shared';
import {
  createBrowserAgentDecisionProvider,
  registerBrowserAgentAdapter as registerEngineBrowserAgentAdapter,
} from '@simagents/engine/engine/browser-agent-adapter';
import { fallbackDecisionFor, toActionDecision, type DecisionInput } from '@simagents/engine/engine/decision';
import { getRuntimeOverrides, resetRuntimeConfig, setRuntimeConfig } from '@simagents/engine/config';
import {
  SimEngine,
  createRosterProviderFactory,
  type ProviderFactory,
  type SimEngineState,
} from '@simagents/engine/engine/engine';
import { store as engineStore } from '@simagents/engine/engine-memory/store';
import {
  getStoredWorldEvents,
  validateWorldSnapshotV1,
  type WorldSnapshotV1,
} from '@simagents/engine/engine/persistence';
import { setCustomSystemPrompt } from '@simagents/engine/llm/prompt-manager';
import type { WorkerCommand as ClientCommand, BrowserAgentAdapterRegistration } from './engine-client';
import type {
  BrowserExperimentDefinition,
  BrowserExperimentRun,
  BrowserExperimentSnapshot,
  BrowserExperimentSummary,
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
import { worldEventToReplayEvent } from './replay-events';

interface InitPayload {
  captureRequests?: boolean;
  limits?: SessionLimits;
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

type WorkerCommand = ClientCommand & { requestId: string; sessionId: string };

interface StoredReplayFrame {
  worldSeed?: string;
  schemaVersion: 1;
  tick: number;
  simTimeMs: number;
  capturedAt: number;
  snapshot: WorldSnapshot;
}

let engine: SimEngine | undefined;
let requestBudget: RequestBudget | undefined;
let activeProfiles: ConnectionProfile[] = [];
let activeRoster: AgentRosterEntry[] = [];
const relayTokens = new Map<string, string>();
const blockedRelays = new Set<string>();
let unsubscribe: (() => void) | undefined;
let stateTimer: ReturnType<typeof setInterval> | undefined;
let snapshotTimer: ReturnType<typeof setInterval> | undefined;
let replayFrames: StoredReplayFrame[] = [];
let activeExperimentRun: BrowserExperimentRun | undefined;
let cancelExperimentRequested = false;
let browserAdapterRegistrations: BrowserAgentAdapterRegistration[] = [];

// Durable replay lives in IndexedDB; retain only a short resident window.
const MAX_REPLAY_FRAMES = 32;
const MAX_EXPERIMENT_TICKS = 500;

const keySource = (keys: Partial<Record<string, string>>) => ({
  getKey(provider: string): string | undefined {
    return keys[provider];
  },
});

function createBrowserAwareProviderFactory(rosterProviderFactory: ProviderFactory): ProviderFactory {
  return (agent, tools) => {
    const registration = findBrowserAdapterRegistration(agent.id, (agent as { name?: string }).name);
    if (registration) {
      const provider = createBrowserAgentDecisionProvider(registration.id);
      if (provider) return provider;
    }
    return rosterProviderFactory(agent, tools);
  };
}

let sessionId = '';
let replayWorldSeed = '';
let experimentBusy = false;
let commandTail: Promise<unknown> = Promise.resolve();
function send(message: object): void {
  self.postMessage({ ...message, sessionId });
}

self.onmessage = (message: MessageEvent<WorkerCommand>) => {
  const command = message.data;
  if (command.cmd === 'init' && !sessionId) sessionId = command.sessionId;
  if (command.sessionId !== sessionId) return;
  const execute = async () => {
    let ownsExperiment = false;
    try {
      if (experimentBusy && !['cancelExperiment', 'getExperimentStatus', 'getState', 'updateRelayToken', 'suspendRelayAccess'].includes(command.cmd)) {
        throw new Error('An experiment is running. Cancel it before changing the world.');
      }
      if (command.cmd === 'runExperiment') { experimentBusy = true; ownsExperiment = true; cancelExperimentRequested = false; }
      const payload = await handleCommand(command);
      postResponse(command.requestId, payload);
    } catch (error) { postError(error, command.requestId); }
    finally { if (ownsExperiment) experimentBusy = false; }
  };
  // Experiments yield to the event loop and must not block their cancel command.
  if (command.cmd === 'cancelExperiment' || command.cmd === 'getExperimentStatus') void execute();
  else if (command.cmd === 'runExperiment') {
    commandTail = commandTail.then(() => { void execute(); });
  } else commandTail = commandTail.then(execute);
};

async function handleCommand(command: WorkerCommand): Promise<unknown> {
  switch (command.cmd) {
    case 'validateSnapshot':
      validateWorldSnapshotV1(command.snapshot);
      return;
    case 'init':
      await init(command.payload);
      return liveState();
    case 'suspendRelayAccess': {
      const matching = activeProfiles.filter(profile => profile.transport === 'official-relay' && profile.relayUrl === command.relayUrl);
      if (!matching.length) throw new Error('Relay destination does not match this session');
      blockedRelays.add(command.relayUrl); relayTokens.delete(command.relayUrl);
      requireEngine().pause();
      await requireEngine().getExecutor().onDrain();
      stopStateTimer(); stopSnapshotTimer(); postState(); postSnapshot();
      return;
    }
    case 'updateRelayToken': {
      requireEngine();
      // The sessionId envelope authenticates the current Worker session. Destination is immutable.
      if (typeof command.token !== 'string' || !command.token.trim() || command.token.length > 4096 || /[\r\n]/.test(command.token)) throw new Error('Invalid relay access token');
      const matching = activeProfiles.filter(profile => profile.transport === 'official-relay' && profile.relayUrl === command.relayUrl);
      if (!matching.length) throw new Error('Relay destination does not match this session');
      relayTokens.set(command.relayUrl, command.token); blockedRelays.delete(command.relayUrl);
      return { updated: matching.length };
    }
    case 'start':
      if (blockedRelays.size) throw new AppError({ code: 'RELAY_ACCESS' });
      requestBudget?.start();
      requireEngine().resume();
      await requireEngine().start();
      startStateTimer();
      startSnapshotTimer();
      postState();
      break;
    case 'pause':
      requireEngine().pause();
      await requireEngine().getExecutor().onDrain();
      stopStateTimer();
      stopSnapshotTimer();
      postState();
      postSnapshot();
      break;
    case 'resume':
      if (blockedRelays.size) throw new AppError({ code: 'RELAY_ACCESS' });
      requestBudget?.start();
      await requireEngine().start();
      startStateTimer();
      startSnapshotTimer();
      postState();
      break;
    case 'reset':
      requestBudget?.dispose();
      stopStateTimer();
      stopSnapshotTimer();
      await requireEngine().reset();
      postState();
      return liveState();
    case 'setSpeed':
      requireEngine().setSpeed(command.speed);
      break;
    case 'getState':
      return liveState();
    case 'snapshot':
      return requireEngine().getExecutor().mutate(() => ({ snapshot: captureSnapshot(), recentEvents: getStoredWorldEvents(1000) }));
    case 'export':
      return requireEngine().getExecutor().mutate(() => ({ snapshot: captureSnapshot(), events: getStoredWorldEvents() }));
    case 'setRuntimeConfig':
      await requireEngine().getExecutor().mutate(() => setRuntimeConfig(command.updates as Parameters<typeof setRuntimeConfig>[0]));
      break;
    case 'setCustomPrompt':
      await requireEngine().getExecutor().mutate(() => setCustomSystemPrompt(command.prompt));
      break;
    case 'getReplayRange':
      return getReplayRange();
    case 'getReplayFrame':
      return getReplayFrame(command.tick);
    case 'getAgentTimeline':
      return getAgentTimeline(command.agentId, command.limit);
    case 'getPuzzles':
      return getPuzzles(command.filter ?? 'all');
    case 'getPuzzleDetails':
      return getPuzzleDetails(command.puzzleId);
    case 'getPuzzleResults':
      return getPuzzleResults(command.puzzleId);
    case 'getPuzzleStats':
      return getPuzzleStats();
    case 'runExperiment':
      return await runExperiment(command.definition);
    case 'cancelExperiment':
      return cancelExperiment(command.runId);
    case 'getExperimentStatus':
      return getExperimentStatus(command.runId);
    case 'exportExperiment':
      return exportExperiment(command.runId);
    case 'registerBrowserAgentAdapter':
      if (!internalFixturesEnabled()) throw new Error('Browser test adapters are unavailable in public builds');
      return registerBrowserAgentAdapter(command.registration);
  }
}

async function init(payload: InitPayload): Promise<void> {
  payload.roster = validateRoster(payload.roster);
  const limits = validateSessionLimits(payload.limits ?? DEFAULT_SESSION_LIMITS);
  const profiles = (payload.connections ?? []).map(validateConnectionProfile);
  if (profiles.length > 100 || new Set(profiles.map((p) => p.id)).size !== profiles.length) throw new Error('Invalid or duplicate connection profiles');
  if (payload.roster.length) {
    const issue = byokPreflightIssue(payload.roster, payload.keys, payload.proxyUrl ?? '', internalFixturesEnabled(), payload.connections);
    if (issue) throw new AppError(issue);
  }
  if (payload.resume) validateWorldSnapshotV1(payload.resume);
  stopStateTimer();
  stopSnapshotTimer();
  unsubscribe?.();
  if (engine) {
    await engine.reset();
  }

  activeProfiles = profiles;
  relayTokens.clear(); blockedRelays.clear();
  for (const profile of profiles) if (profile.transport === 'official-relay') {
    const token = profile.relayCredentialRef ? payload.keys[profile.relayCredentialRef] : undefined;
    if (token) relayTokens.set(profile.relayUrl!, token);
  }
  activeRoster = structuredClone(payload.roster);
  resetRuntimeConfig();
  if (payload.configOverrides) {
    setRuntimeConfig(payload.configOverrides as Parameters<typeof setRuntimeConfig>[0]);
  }
  setCustomSystemPrompt(payload.customPrompt ?? null);
  replayFrames = [];

  requestBudget?.dispose();
  requestBudget = new RequestBudget(limits, () => {
    engine?.pause();
    stopStateTimer();
    stopSnapshotTimer();
    postError(new RequestBudgetError('duration-limit'));
    void engine?.getExecutor().mutate(() => { postState(); postSnapshot(); }).catch((error) => postError(error));
  });
  let tracesCaptured = 0;
  const rosterProviderFactory = createRosterProviderFactory(
    payload.roster,
    keySource(payload.keys),
    { proxyUrl: payload.proxyUrl || undefined, maxTokens: limits.maxOutputTokens, budget: requestBudget, connections: payload.connections,
      getRelayAccessToken: profile => relayTokens.get(profile.relayUrl!),
      traceSecrets: Object.values(payload.keys).filter((key): key is string => typeof key === 'string'),
      onTrace: payload.captureRequests === true ? trace => {
        if (!experimentBusy && tracesCaptured < MAX_SESSION_TRACES) { tracesCaptured++; send({ type: 'requestTrace', trace: { ...trace, sessionId, worldSeed: replayWorldSeed } }); }
      } : undefined,
    }
  );
  const providerFactory = createBrowserAwareProviderFactory(rosterProviderFactory);

  const createEngine = (speed: number, worldSeed: string) =>
    new SimEngine({
      speed,
      worldSeed,
      providerFactory,
      // The worker console is invisible to users: surface background engine
      // failures (interval tick, agent runner crashes) to the UI.
      onError: (error, context) => {
        stopStateTimer();
        stopSnapshotTimer();
        postError(error);
        postState();
      },
      onAgentUnresponsive: (agentId, reason) => {
        const agent = engine?.getState().agents.find((candidate) => candidate.id === agentId);
        const issue = { code: 'AGENT_UNRESPONSIVE' as const, parameters: { agent: agent?.name ?? agentId, reason } };
        send({ type: 'warning', message: `${issue.parameters.agent} stopped deciding (${reason})`, issue });
      },
    });

  let resumeSnapshot: WorldSnapshotV1 | undefined;
  if (payload.resume) {
    try {
      resumeSnapshot = validateWorldSnapshotV1(payload.resume);
    } catch (error) {
      postWarning(`Saved world could not be loaded; starting a new world. ${formatError(error)}`);
    }
  }

  replayWorldSeed = resumeSnapshot?.worldSeed ?? payload.worldSeed ?? 'browser-local';
  engine = createEngine(
    resumeSnapshot?.speed ?? payload.speed,
    resumeSnapshot?.worldSeed ?? payload.worldSeed ?? 'browser-local'
  );

  unsubscribe = engine.subscribe((event) => {
    if (!experimentBusy) send({ type: 'event', event } satisfies { type: 'event'; event: WorldEvent });
  });

  if (resumeSnapshot) await engine.hydrate(resumeSnapshot);
  else await engine.seed({ roster: payload.roster, worldSeed: payload.worldSeed });

  send({ type: 'ready', state: engine.getState() } satisfies {
    type: 'ready';
    state: SimEngineState;
  });
  recordReplayFrame();
}

function requireEngine(): SimEngine {
  if (!engine) throw new Error('Engine worker has not been initialized');
  return engine;
}

function captureSnapshot(): WorldSnapshotV1 {
  const snapshot = requireEngine().snapshot();
  snapshot.configuration = { ...snapshot.configuration!, connections: activeProfiles, roster: activeRoster };
  return JSON.parse(JSON.stringify(snapshot)) as WorldSnapshotV1;
}

function liveState(): SimEngineState { return { ...requireEngine().getState(), usage: requestBudget?.snapshot() }; }

function postState(): void {
  const current = liveState();
  send({ type: 'state', state: current } satisfies { type: 'state'; state: SimEngineState });
  recordReplayFrame(current);
}

function postError(error: unknown, requestId?: string): void {
  send({ type: 'error', issue: errorIssue(error), message: 'Engine operation failed. No automatic retry was made.', requestId });
}

function postWarning(message: string): void {
  send({ type: 'warning', message } satisfies { type: 'warning'; message: string });
}

function postSnapshot(): void {
  const snapshot = captureSnapshot();
  recordReplayFrame();
  send({
    type: 'snapshot',
    snapshot,
    recentEvents: getStoredWorldEvents(1000),
  } satisfies { type: 'snapshot'; snapshot: WorldSnapshotV1; recentEvents: WorldEvent[] });
}

function postResponse(requestId: string, payload: unknown): void {
  send({ type: 'response', requestId, payload } satisfies {
    type: 'response';
    requestId: string;
    payload: unknown;
  });
}

function recordReplayFrame(state = requireEngine().getState()): void {
  if (experimentBusy) return;
  const frame = buildReplayFrame(state);
  const existingIndex = replayFrames.findIndex((item) => item.tick === frame.tick);
  if (existingIndex >= 0) {
    replayFrames[existingIndex] = frame;
  } else {
    replayFrames.push(frame);
  }
  replayFrames.sort((a, b) => a.tick - b.tick);
  if (replayFrames.length > MAX_REPLAY_FRAMES) {
    replayFrames = replayFrames.slice(-MAX_REPLAY_FRAMES);
  }
  send({ type: 'replayFrame', frame } satisfies {
    type: 'replayFrame';
    frame: StoredReplayFrame;
  });
}

function buildReplayFrame(state: SimEngineState): StoredReplayFrame {
  const events = getStoredWorldEvents(500)
    .map(worldEventToReplayEvent)
    .filter((event) => event.tick === state.tick)
    .sort((a, b) => a.id - b.id);

  return {
    schemaVersion: 1,
    tick: state.tick,
    simTimeMs: state.simTimeMs,
    capturedAt: Date.now(),
    worldSeed: replayWorldSeed,
    snapshot: {
      tick: state.tick,
      agents: state.agents.map((agent) => ({
        id: agent.id,
        name: agent.name ?? undefined,
        modelId: state.metrics?.agents.find(metrics => metrics.agentId === agent.id)?.lastModelId,
        llmType: agent.llmType,
        x: agent.x,
        y: agent.y,
        hunger: agent.hunger,
        energy: agent.energy,
        health: agent.health,
        balance: agent.balance,
        state: agent.state,
        tick: state.tick,
      })),
      resourceSpawns: state.resources.map((spawn) => ({
        id: spawn.id,
        x: spawn.x,
        y: spawn.y,
        resourceType: spawn.resourceType,
        currentAmount: spawn.currentAmount,
        maxAmount: spawn.maxAmount,
      })),
      shelters: state.shelters.map((shelter) => ({
        id: shelter.id,
        x: shelter.x,
        y: shelter.y,
        canSleep: shelter.canSleep,
      })),
      events,
    },
  };
}

function getReplayRange(): TickRange {
  if (replayFrames.length === 0) recordReplayFrame();
  const ticks = replayFrames.map((frame) => frame.tick);
  const currentTick = requireEngine().getState().tick;
  return {
    minTick: Math.min(...ticks, currentTick),
    maxTick: Math.max(...ticks, currentTick),
    currentTick,
    totalEvents: getStoredWorldEvents().length,
  };
}

function getReplayFrame(tick: number): WorldSnapshot {
  if (replayFrames.length === 0) recordReplayFrame();
  const exact = replayFrames.find((frame) => frame.tick === tick);
  if (exact) return exact.snapshot;
  throw new Error(`Replay frame missing at tick ${tick}. No substitute frame was used.`);
}

function getAgentTimeline(agentId: string, limit = 100): AgentTimelineEntry[] {
  return getStoredWorldEvents()
    .filter((event) => event.agentId === agentId)
    .slice(0, limit)
    .map((event) => {
      const action = typeof event.payload.action === 'string' ? event.payload.action : undefined;
      const success = event.type !== 'action_failed';
      return {
        tick: event.tick,
        eventType: event.type,
        action,
        success,
        description: describeTimelineEvent(event),
      };
    });
}

function describeTimelineEvent(event: WorldEvent): string {
  if (typeof event.payload.reasoning === 'string') return event.payload.reasoning;
  if (typeof event.payload.error === 'string') return event.payload.error;
  return event.type.replace(/_/g, ' ');
}

function getPuzzles(filter: PuzzleFilter): PuzzleGame[] {
  const puzzles = [...engineStore.puzzleGames.values()].map((puzzle) => ({
    id: puzzle.id,
    gameType: puzzle.gameType,
    status: puzzle.status as PuzzleGame['status'],
    prizePool: puzzle.prizePool,
    entryStake: puzzle.entryStake,
    startsAtTick: puzzle.startsAtTick ?? puzzle.createdAtTick,
    endsAtTick: puzzle.endsAtTick ?? puzzle.createdAtTick,
    participantCount: [...engineStore.puzzleParticipants.values()].filter((p) => p.gameId === puzzle.id).length,
    fragmentCount: puzzle.fragmentCount,
    winnerId: puzzle.winnerId,
  }));
  if (filter === 'all') return puzzles;
  if (filter === 'active') return puzzles.filter((puzzle) => puzzle.status === 'open' || puzzle.status === 'active');
  return puzzles.filter((puzzle) => puzzle.status === filter);
}

function getPuzzleDetails(puzzleId: string): PuzzleDetails {
  const puzzle = engineStore.puzzleGames.get(puzzleId);
  if (!puzzle) throw new Error('Puzzle not found');
  const isCompleted = puzzle.status === 'completed';
  return {
    puzzle: { ...getPuzzles('all').find((item) => item.id === puzzleId)!, solution: isCompleted ? puzzle.solution ?? null : null },
    participants: [...engineStore.puzzleParticipants.values()]
      .filter((participant) => participant.gameId === puzzleId)
      .map((participant) => {
        const agent = engineStore.agents.get(participant.agentId);
        return {
          id: participant.id,
          agentId: participant.agentId,
          agentName: agent?.name ?? agent?.llmType ?? participant.agentId,
          agentColor: agent?.color ?? '#888888',
          teamId: participant.teamId,
          stakeAmount: participant.stakedAmount,
          contributionScore: participant.contributionScore,
          fragmentsShared: participant.fragmentsShared,
          attemptsMade: participant.attemptsMade,
        };
      }),
    teams: [...engineStore.puzzleTeams.values()]
      .filter((team) => team.gameId === puzzleId)
      .map((team) => {
        const leader = engineStore.agents.get(team.leaderId);
        const members = [...engineStore.puzzleParticipants.values()]
          .filter((participant) => participant.teamId === team.id)
          .map((participant) => {
            const agent = engineStore.agents.get(participant.agentId);
            return {
              agentId: participant.agentId,
              agentName: agent?.name ?? agent?.llmType ?? participant.agentId,
              agentColor: agent?.color ?? '#888888',
              contributionScore: participant.contributionScore,
              fragmentsShared: participant.fragmentsShared,
            };
          });
        return {
          id: team.id,
          name: team.name ?? 'Team',
          status: team.status,
          totalStake: team.totalStake,
          leader: leader ? { id: leader.id, name: leader.name ?? leader.llmType } : null,
          members,
          memberCount: members.length,
        };
      }),
    fragments: [...engineStore.puzzleFragments.values()]
      .filter((fragment) => fragment.gameId === puzzleId)
      .map((fragment) => {
        const owner = fragment.ownerId ? engineStore.agents.get(fragment.ownerId) : undefined;
        const originalOwner = fragment.originalOwnerId ? engineStore.agents.get(fragment.originalOwnerId) : undefined;
        return {
          id: fragment.id,
          fragmentIndex: fragment.fragmentIndex,
          content: isCompleted ? fragment.content : '',
          owner: owner ? { id: owner.id, name: owner.name ?? owner.llmType, color: owner.color } : null,
          originalOwner: originalOwner ? { id: originalOwner.id, name: originalOwner.name ?? originalOwner.llmType } : null,
          sharedWith: fragment.sharedWith.map((agentId) => {
            const agent = engineStore.agents.get(agentId);
            return { agentId, agentName: agent?.name ?? agent?.llmType ?? agentId };
          }),
          sharedCount: fragment.sharedWith.length,
        };
      }),
  };
}

function getPuzzleResults(puzzleId: string): PuzzleResults {
  const details = getPuzzleDetails(puzzleId);
  const attempts = [...engineStore.puzzleAttempts.values()]
    .filter((attempt) => attempt.gameId === puzzleId)
    .map((attempt) => {
      const agent = engineStore.agents.get(attempt.submitterId);
      return {
        id: attempt.id,
        submitterId: attempt.submitterId,
        submitterName: agent?.name ?? agent?.llmType ?? attempt.submitterId,
        attemptedSolution: attempt.attemptedSolution,
        isCorrect: attempt.isCorrect,
        submittedAtTick: attempt.submittedAtTick,
      };
    });
  const winningAttempt = attempts.find((attempt) => attempt.isCorrect) ?? null;
  return {
    puzzle: {
      id: details.puzzle.id,
      gameType: details.puzzle.gameType,
      status: details.puzzle.status,
      prizePool: details.puzzle.prizePool,
      solution: details.puzzle.solution,
    },
    winner: winningAttempt
      ? {
          agentId: winningAttempt.submitterId,
          agentName: winningAttempt.submitterName,
          solution: winningAttempt.attemptedSolution,
          submittedAtTick: winningAttempt.submittedAtTick,
        }
      : null,
    attempts,
    prizeDistribution: details.participants.map((participant) => ({
      agentId: participant.agentId,
      agentName: participant.agentName,
      contributionScore: participant.contributionScore,
      fragmentsShared: participant.fragmentsShared,
      attemptsMade: participant.attemptsMade,
      prizeAmount: (engineStore.puzzleGames.get(puzzleId)?.prizeDistribution ?? []).filter((p) => p.agentId === participant.agentId).reduce((sum, p) => sum + p.amount, 0),
      isWinner: winningAttempt?.submitterId === participant.agentId,
    })),
  };
}

function getPuzzleStats(): PuzzleStats {
  const puzzles = getPuzzles('all');
  const totalParticipants = [...engineStore.puzzleParticipants.values()].length;
  return {
    totalGames: puzzles.length,
    activeGames: puzzles.filter((puzzle) => puzzle.status === 'open' || puzzle.status === 'active').length,
    completedGames: puzzles.filter((puzzle) => puzzle.status === 'completed').length,
    expiredGames: puzzles.filter((puzzle) => puzzle.status === 'expired').length,
    totalPrizeDistributed: puzzles
      .filter((puzzle) => puzzle.status === 'completed')
      .reduce((sum, puzzle) => sum + (engineStore.puzzleGames.get(puzzle.id)?.prizeDistribution ?? []).reduce((total, p) => total + p.amount, 0), 0),
    averageParticipants: puzzles.length === 0 ? 0 : totalParticipants / puzzles.length,
  };
}

async function runExperiment(definition: BrowserExperimentDefinition): Promise<BrowserExperimentRun> {
  if (activeExperimentRun?.status === 'running') {
    throw new Error(`Experiment already running: ${activeExperimentRun.id}`);
  }

  const currentEngine = requireEngine();
  const savedConfig = structuredClone(getRuntimeOverrides());
  const savedWorld = await currentEngine.getExecutor().mutate(() => currentEngine.snapshot());
  const startedState = currentEngine.getState();
  const targetTicks = clampInt(definition.ticks ?? 10, 1, MAX_EXPERIMENT_TICKS);
  const wallStepMs = clampInt(definition.wallStepMs ?? 6000, 1, 60_000);
  const captureEveryTicks = clampInt(definition.captureEveryTicks ?? 1, 1, targetTicks);
  const startedEventCount = engineStore.metrics.totalEvents;
  const shouldRestartRuntime = stateTimer !== undefined;

  if (definition.configOverrides) {
    setRuntimeConfig(definition.configOverrides as Parameters<typeof setRuntimeConfig>[0]);
  }

  const run: BrowserExperimentRun = {
    schemaVersion: 1,
    id: definition.id ? `${definition.id}-${Date.now()}` : `browser-run-${Date.now()}`,
    definition: {
      ...definition,
      ticks: targetTicks,
      wallStepMs,
      captureEveryTicks,
    },
    status: 'running',
    startedAt: Date.now(),
    targetTicks,
    ticksCompleted: 0,
    snapshots: [buildExperimentSnapshot(startedState)],
  };

  activeExperimentRun = run;
  stopStateTimer();
  stopSnapshotTimer();
  currentEngine.stop();
  currentEngine.resume();

  try {
    let iterations = 0;
    let lastCapturedTick = startedState.tick;
    const maxIterations = targetTicks * 20;

    while (run.ticksCompleted < targetTicks && iterations < maxIterations) {
      if (cancelExperimentRequested) {
        run.status = 'cancelled';
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelExperimentRequested) { run.status = 'cancelled'; break; }
      iterations += 1;
      await currentEngine.tickWall(wallStepMs);
      const state = currentEngine.getState();
      run.ticksCompleted = Math.max(0, state.tick - startedState.tick);

      const shouldCapture =
        state.tick !== lastCapturedTick &&
        (run.ticksCompleted >= targetTicks || run.ticksCompleted % captureEveryTicks === 0);
      if (shouldCapture) {
        lastCapturedTick = state.tick;
        run.snapshots.push(buildExperimentSnapshot(state));
        recordReplayFrame(state);
      }

      if (iterations % 5 === 0) postState();
    }

    if (run.status === 'running') {
      if (run.ticksCompleted >= targetTicks) run.status = 'completed';
      else throw new Error('Experiment did not reach its target within the iteration limit');
    }
  } catch (error) {
    run.status = 'failed';
    run.error = formatError(error);
  } finally {
    const endedState = currentEngine.getState();
    if (run.snapshots.at(-1)?.tick !== endedState.tick) {
      run.snapshots.push(buildExperimentSnapshot(endedState));
    }
    run.completedAt = Date.now();
    run.summary = buildExperimentSummary(run, startedState.tick, startedEventCount);
    activeExperimentRun = run;
    cancelExperimentRequested = false;

    currentEngine.stop();
    resetRuntimeConfig();
    setRuntimeConfig(savedConfig);
    await currentEngine.hydrate(savedWorld);
    if (startedState.lifecycle === 'paused' || startedState.lifecycle === 'error') currentEngine.pause();
    if (shouldRestartRuntime) {
      await currentEngine.start();
      startStateTimer();
      startSnapshotTimer();
    }
    postState();
    postSnapshot();
  }

  return run;
}

function cancelExperiment(runId?: string): BrowserExperimentRun | undefined {
  if (experimentBusy && !runId) cancelExperimentRequested = true;
  if (!activeExperimentRun) return undefined;
  if (runId && activeExperimentRun.id !== runId) return activeExperimentRun;
  if (activeExperimentRun.status === 'running') {
    cancelExperimentRequested = true;
  }
  return activeExperimentRun;
}

function getExperimentStatus(runId?: string): BrowserExperimentRun | undefined {
  if (!runId) return activeExperimentRun;
  return activeExperimentRun?.id === runId ? activeExperimentRun : undefined;
}

function exportExperiment(runId: string): BrowserExperimentRun | undefined {
  return activeExperimentRun?.id === runId ? activeExperimentRun : undefined;
}

function buildExperimentSnapshot(state: SimEngineState): BrowserExperimentSnapshot {
  const aliveAgents = state.agents.filter((agent) => agent.state !== 'dead');
  const count = Math.max(1, aliveAgents.length);
  return {
    tick: state.tick,
    simTimeMs: state.simTimeMs,
    capturedAt: Date.now(),
    agentCount: state.agents.length,
    aliveAgents: aliveAgents.length,
    avgHunger: round2(aliveAgents.reduce((sum, agent) => sum + agent.hunger, 0) / count),
    avgEnergy: round2(aliveAgents.reduce((sum, agent) => sum + agent.energy, 0) / count),
    avgHealth: round2(aliveAgents.reduce((sum, agent) => sum + agent.health, 0) / count),
    totalBalance: round2(state.agents.reduce((sum, agent) => sum + agent.balance, 0)),
    resourceAmount: round2(state.resources.reduce((sum, resource) => sum + resource.currentAmount, 0)),
    eventCount: engineStore.metrics.totalEvents,
  };
}

function buildExperimentSummary(
  run: BrowserExperimentRun,
  startedTick: number,
  startedEventCount: number
): BrowserExperimentSummary {
  const last = run.snapshots.at(-1);
  return {
    startedTick,
    endedTick: last?.tick ?? startedTick,
    ticksAdvanced: Math.max(0, (last?.tick ?? startedTick) - startedTick),
    eventsGenerated: Math.max(0, (last?.eventCount ?? startedEventCount) - startedEventCount),
    finalAliveAgents: last?.aliveAgents ?? 0,
    finalAvgHealth: last?.avgHealth ?? 0,
    finalResourceAmount: last?.resourceAmount ?? 0,
  };
}

function registerBrowserAgentAdapter(
  registration: BrowserAgentAdapterRegistration
): { id: string; appliedTo: number } {
  const id = registration.id.trim();
  if (!id) throw new Error('Browser agent adapter id is required');

  const normalized: BrowserAgentAdapterRegistration = {
    ...registration,
    id,
    agentIds: registration.agentIds?.filter(Boolean),
    agentNames: registration.agentNames?.filter(Boolean),
  };

  registerEngineBrowserAgentAdapter({
    id,
    label: normalized.label,
    async decide(ctx, signal) {
      const latency = Math.max(0, normalized.latencyMs ?? 0);
      if (latency > 0) await sleepWall(latency, signal);
      if (signal.aborted) throw new DOMException('Decision aborted', 'AbortError');
      return normalized.fallbackAction
        ? toActionDecision(normalized.fallbackAction as DecisionInput)
        : fallbackDecisionFor(ctx.agent, ctx.observation);
    },
  });

  browserAdapterRegistrations = [
    normalized,
    ...browserAdapterRegistrations.filter((item) => item.id !== id),
  ];

  return { id, appliedTo: countMatchedAgents(normalized) };
}

function findBrowserAdapterRegistration(
  agentId: string,
  agentName?: string
): BrowserAgentAdapterRegistration | undefined {
  return browserAdapterRegistrations.find((registration) => {
    if (registration.allAgents) return true;
    if (registration.agentIds?.includes(agentId)) return true;
    return !!agentName && !!registration.agentNames?.includes(agentName);
  });
}

function countMatchedAgents(registration: BrowserAgentAdapterRegistration): number {
  return [...engineStore.agents.values()].filter((agent) => (
    registration.allAgents ||
    registration.agentIds?.includes(agent.id) ||
    ((agent as { name?: string }).name ? registration.agentNames?.includes((agent as { name: string }).name) : false)
  )).length;
}

function sleepWall(wallMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Decision aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, wallMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Decision aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function startStateTimer(): void {
  if (stateTimer) return;
  stateTimer = setInterval(() => {
    void requireEngine().getExecutor().mutate(() => postState()).catch((error) => postError(error));
  }, 2000);
}

function startSnapshotTimer(): void {
  if (snapshotTimer) return;
  snapshotTimer = setInterval(() => {
    void requireEngine().getExecutor().mutate(() => postSnapshot()).catch((error) => postError(error));
  }, 10_000);
}

function stopStateTimer(): void {
  if (!stateTimer) return;
  clearInterval(stateTimer);
  stateTimer = undefined;
}

function stopSnapshotTimer(): void {
  if (!snapshotTimer) return;
  clearInterval(snapshotTimer);
  snapshotTimer = undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
