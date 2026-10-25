import type { Agent } from '../db/schema';
import { getRuntimeConfig } from '../config';
import { createIntent } from '../actions';
import type { ActionIntent } from '../actions/types';
import { buildObservation, formatEvent } from '../agents/observer';
import { getAgentById, getAliveAgents, updateAgent } from '../engine-memory/queries/agents';
import { getEventsByAgent } from '../engine-memory/queries/events';
import { getAllResourceSpawns, getAllShelters } from '../engine-memory/queries/world';
import { agentRng, type RandomSource } from '../utils/random';
import { materializeVitals } from './vitals';
import { getAgentBusyUntil, setAgentBusyUntil } from './agent-meta';
import { tickFromSimTime } from './time';
import { ProviderRequestError, type ProviderErrorCode } from './llm/provider-error';
import { appendEvent } from '../engine-memory/queries/events';
import { publishEvent } from '../engine-memory/bus';
import { v4 as uuid } from 'uuid';
import type { ActionExecutor } from './executor';
import {
  isUndecided,
  type ActionDecision,
  type DecisionContext,
  type DecisionProvider,
  type UndecidedDecision,
} from './decision';

export interface AgentRunnerHost {
  nowMs(): number;
  isPaused(): boolean;
  sleepUntilSim(targetSimTimeMs: number, signal: AbortSignal): Promise<void>;
  sleepWall(wallMs: number, signal: AbortSignal): Promise<void>;
  waitWhilePaused(signal: AbortSignal): Promise<void>;
}

export interface AgentRunnerOptions {
  agentId: string;
  worldSeed: string;
  provider: DecisionProvider;
  executor: ActionExecutor;
  host: AgentRunnerHost;
  /** Called once when this agent stops deciding; the world keeps running. */
  onUnresponsive?: (agentId: string, reason: DecisionFailureCode) => void;
}

export class DecisionTimeoutError extends Error {
  constructor(timeoutMs: number) { super(`Decision timed out after ${timeoutMs}ms`); this.name = 'DecisionTimeoutError'; }
}

export type DecisionFailureCode = ProviderErrorCode | 'timeout';

/** Provider failures stay with the agent; anything else (session limits, relay, bugs) still stops the world. */
function decisionFailureCode(error: unknown): DecisionFailureCode | undefined {
  if (error instanceof DecisionTimeoutError) return 'timeout';
  if (error instanceof ProviderRequestError) return error.code;
  return undefined;
}

/** Credentials and quota will not fix themselves; other failures cost the agent a turn. */
const TERMINAL_FAILURES: ReadonlySet<DecisionFailureCode> = new Set(['credentials', 'quota']);
/** Failures worth waiting out before the next attempt. */
const BACKOFF_FAILURES: ReadonlySet<DecisionFailureCode> = new Set(['rate-limit', 'unavailable', 'network']);
/**
 * Per-heartbeat bookkeeping (vitals, spoilage, regeneration): the body and inventory
 * descriptions already carry it, and one event per heartbeat would crowd out real events.
 */
const UNPERCEIVED_EVENTS: ReadonlySet<string> = new Set(['needs_updated', 'items_spoiled', 'health_regenerated']);

export class AgentRunner {
  readonly agentId: string;
  readonly rng: RandomSource;

  private readonly controller = new AbortController();
  private runPromise: Promise<void> | undefined;
  private thinking = false;
  private stopped = false;
  private lastDecisionStartedAt: number | undefined;
  private consecutiveFailures = 0;

  constructor(private readonly options: AgentRunnerOptions) {
    this.agentId = options.agentId;
    const source = agentRng(options.agentId, `${options.worldSeed}:${options.agentId}`);
    this.rng = () => {
      if (this.controller.signal.aborted) throw new DOMException('Decision aborted', 'AbortError');
      return source();
    };
  }

  get isRunning(): boolean {
    return !!this.runPromise && !this.stopped;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  get isThinking(): boolean {
    return this.thinking;
  }

  start(): Promise<void> {
    if (!this.runPromise) {
      this.runPromise = this.loop().finally(() => {
        this.stopped = true;
        this.thinking = false;
      });
    }
    return this.runPromise;
  }

  stop(): void {
    this.controller.abort();
  }

  done(): Promise<void> | undefined {
    return this.runPromise;
  }

  private async loop(): Promise<void> {
    const signal = this.controller.signal;

    try {
      while (!signal.aborted) {
        await this.options.host.waitWhilePaused(signal);

        const agent = await this.currentAgent();
        if (!agent || agent.state === 'dead') break;

        const busyUntil = getAgentBusyUntil(agent.id);
        if (busyUntil > this.options.host.nowMs()) {
          await this.options.host.sleepUntilSim(busyUntil, signal);
          continue;
        }

        const minInterval = getRuntimeConfig().engine.minDecisionIntervalMs;
        if (
          this.lastDecisionStartedAt !== undefined &&
          this.options.host.nowMs() < this.lastDecisionStartedAt + minInterval
        ) {
          await this.options.host.sleepUntilSim(this.lastDecisionStartedAt + minInterval, signal);
          continue;
        }

        await this.options.host.waitWhilePaused(signal);
        if (signal.aborted) break;

        const freshAgent = await this.currentAgent();
        if (!freshAgent || freshAgent.state === 'dead') break;

        const decisionStartedAt = this.options.host.nowMs();
        this.lastDecisionStartedAt = decisionStartedAt;
        const observation = await this.buildObservation(freshAgent);
        let outcome: Awaited<ReturnType<AgentRunner['decide']>>;
        try {
          outcome = await this.decide(freshAgent, observation, signal);
        } catch (error) {
          const code = decisionFailureCode(error);
          if (signal.aborted || !code) throw error;
          if (!(await this.recordFailure(freshAgent.id, code, signal))) break;
          continue;
        }
        this.consecutiveFailures = 0;
        const { decision, usedFallback, processingTimeMs } = outcome;
        if (signal.aborted) break;

        await this.options.host.waitWhilePaused(signal);
        if (signal.aborted) break;

        if (isUndecided(decision)) {
          // A legitimate answer, not a failure: the agent simply does nothing this turn.
          await this.emit(freshAgent.id, 'agent_undecided', {
            reasoning: decision.reasoning,
            probabilities: decision.probabilities,
            processingTimeMs,
            modelId: decision.telemetry?.modelId,
            tokens: decision.telemetry?.tokens,
          });
          // Doing nothing still takes simulated time, the same for every model.
          const undecidedMs = getRuntimeConfig().durations.undecidedMs;
          await this.options.executor.mutate(async () => { setAgentBusyUntil(freshAgent.id, this.options.host.nowMs() + undecidedMs); });
          if (undecidedMs <= 0 && getRuntimeConfig().engine.minDecisionIntervalMs <= 0) await this.options.host.sleepWall(1, signal);
          continue;
        }

        if (decision.notes !== undefined) {
          const notes = decision.notes;
          await this.options.executor.mutate(async () => { await updateAgent(freshAgent.id, { privateNotes: notes }); });
        }

        const intent = this.intentFor(freshAgent.id, decision);
        await this.options.executor.submit(intent, {
          reasoning: decision.reasoning,
          usedFallback,
          processingTimeMs,
          modelId: decision.telemetry?.modelId,
          effort: decision.telemetry?.effort,
          pricingContext: decision.telemetry?.pricingContext,
          costEligible: decision.telemetry?.costEligible,
          tokens: decision.telemetry?.tokens,
        }, signal);

        // Defensive anti-spin guard: with zero min interval AND a zero-duration
        // outcome the loop would never park on a waiter and would starve the
        // macrotask queue. Production defaults (1s min interval, non-zero
        // durations) never hit this branch.
        if (
          getRuntimeConfig().engine.minDecisionIntervalMs <= 0 &&
          getAgentBusyUntil(freshAgent.id) <= this.options.host.nowMs()
        ) {
          await this.options.host.sleepWall(1, signal);
        }
      }
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }

  private async currentAgent(): Promise<Agent | undefined> {
    return this.options.executor.mutate(async () => {
      if (this.controller.signal.aborted) return undefined;
      const materialized = await materializeVitals(this.agentId, this.options.host.nowMs());
      if (materialized?.vitals.dead) return undefined;
      return materialized?.agent ?? getAgentById(this.agentId);
    });
  }

  private async buildObservation(agent: Agent): Promise<unknown> {
    const tick = tickFromSimTime(this.options.host.nowMs());
    const [agents, resourceSpawns, shelters, recentEvents] = await Promise.all([
      getAliveAgents(),
      getAllResourceSpawns(),
      getAllShelters(),
      getEventsByAgent(agent.id, 10, UNPERCEIVED_EVENTS),
    ]);

    return buildObservation(
      agent,
      tick,
      agents,
      resourceSpawns,
      shelters,
      recentEvents
        .slice()
        .reverse()
        .map((event) =>
          formatEvent({
            type: event.eventType,
            tick: event.tick,
            payload: event.payload as Record<string, unknown>,
          })
        )
    );
  }

  private async decide(
    agent: Agent,
    observation: unknown,
    runnerSignal: AbortSignal
  ): Promise<{ decision: ActionDecision | UndecidedDecision; usedFallback: boolean; processingTimeMs: number }> {
    const timeoutMs = getRuntimeConfig().engine.decisionTimeoutMs;
    const controller = new AbortController();
    const abortDecision = () => controller.abort();
    runnerSignal.addEventListener('abort', abortDecision, { once: true });

    const ctx: DecisionContext = {
      agent,
      observation,
      rng: this.rng,
    };

    this.thinking = true;
    const startedAtWallMs = Date.now();
    const providerPromise = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error('Decision cancelled');
      return this.options.provider.decide(ctx, controller.signal);
    });
    const timeoutPromise = this.options.host.sleepWall(timeoutMs, controller.signal).then(() => {
      controller.abort();
      throw new DecisionTimeoutError(timeoutMs);
    });

    try {
      const decision = await Promise.race([providerPromise, timeoutPromise]);
      return {
        decision,
        usedFallback: false,
        processingTimeMs: Date.now() - startedAtWallMs,
      };
    } finally {
      this.thinking = false;
      runnerSignal.removeEventListener('abort', abortDecision);
      controller.abort();
      providerPromise.catch(() => undefined);
      timeoutPromise.catch(() => undefined);
    }
  }

  /**
   * Record a failed decision. Returns true when the agent should try again,
   * false when it is left unresponsive (it stays in the world and its body
   * keeps changing with time).
   */
  private async recordFailure(agentId: string, code: DecisionFailureCode, signal: AbortSignal): Promise<boolean> {
    this.consecutiveFailures++;
    const engine = getRuntimeConfig().engine;
    const giveUp = TERMINAL_FAILURES.has(code) || this.consecutiveFailures >= engine.maxConsecutiveDecisionFailures;
    await this.emit(agentId, 'agent_decision_failed', { code, consecutiveFailures: this.consecutiveFailures, willRetry: !giveUp });
    if (giveUp) {
      await this.emit(agentId, 'agent_unresponsive', { code });
      this.options.onUnresponsive?.(agentId, code);
      return false;
    }
    if (BACKOFF_FAILURES.has(code)) {
      await this.options.host.sleepWall(engine.decisionRetryBaseMs * 2 ** (this.consecutiveFailures - 1), signal);
    }
    return true;
  }

  private async emit(agentId: string, type: string, payload: Record<string, unknown>): Promise<void> {
    await this.options.executor.mutate(async () => {
      const simTimeMs = this.options.host.nowMs();
      const tick = tickFromSimTime(simTimeMs);
      const data = { ...payload, simTimeMs };
      await appendEvent({ tick, agentId, eventType: type, payload: data });
      await publishEvent({ id: uuid(), agentId, type, tick, timestamp: Date.now(), payload: data });
    });
  }

  private intentFor(agentId: string, decision: ActionDecision): ActionIntent {
    return createIntent(
      agentId,
      decision.type,
      decision.params,
      tickFromSimTime(this.options.host.nowMs())
    );
  }
}
