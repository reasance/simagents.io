import { v4 as uuid } from 'uuid';
import type { Agent } from '../db/schema';
import type { ActionIntent, ActionResult, ActionType } from '../actions/types';
import { executeAction } from '../actions';
import { getRuntimeConfig } from '../config';
import { publishEvent, type WorldEvent } from '../engine-memory/bus';
import { appendEvent } from '../engine-memory/queries/events';
import { getAgentById, updateAgent } from '../engine-memory/queries/agents';
import { materializeVitals } from './vitals';
import { deleteAgentMeta, setAgentBusyUntil } from './agent-meta';
import { tickFromSimTime } from './time';
import { MutationQueue } from './mutation-queue';

export interface ExecutorClock {
  nowMs(): number;
}

export interface ActionExecution {
  intent: ActionIntent;
  tick: number;
  simTimeMs: number;
  result: ActionResult;
  events: WorldEvent[];
  dropped?: boolean;
}

/**
 * Decision telemetry carried alongside the intent so the executor can emit the
 * legacy decision event (`agent_<action>` with reasoning/usedFallback/
 * processingTimeMs) exactly like the tick engine did.
 */
export interface DecisionMeta {
  pricingContext?: import('./decision').PricingContext;
  costEligible?: boolean;
  reasoning?: string;
  usedFallback?: boolean;
  processingTimeMs?: number;
  modelId?: string;
  effort?: string;
  tokens?: {
    input?: number;
    output?: number;
  };
}

export class ActionExecutor {
  private readonly mutations = new MutationQueue();
  private readonly drainListeners = new Set<() => void>();
  private pending = 0;

  constructor(private readonly clock: ExecutorClock) {}

  mutate<T>(operation: () => T | Promise<T>): Promise<T> {
    this.pending++;
    return this.mutations.run(operation).finally(() => {
      this.pending--;
      if (this.pending === 0) this.notifyDrain();
    });
  }

  submit(intent: ActionIntent, decisionMeta?: DecisionMeta, signal?: AbortSignal): Promise<ActionExecution> {
    return this.mutate(() => {
      if (signal?.aborted) throw new Error('Action cancelled');
      return this.execute(intent, decisionMeta);
    });
  }

  onDrain(listener: () => void): () => void;
  onDrain(): Promise<void>;
  onDrain(listener?: () => void): Promise<void> | (() => void) {
    if (listener) {
      this.drainListeners.add(listener);
      return () => this.drainListeners.delete(listener);
    }
    return this.mutations.idle();
  }

  get pendingCount(): number {
    return this.pending;
  }

  private async execute(
    intent: ActionIntent,
    decisionMeta?: DecisionMeta
  ): Promise<ActionExecution> {
    const simTimeMs = this.clock.nowMs();
    const tick = tickFromSimTime(simTimeMs);
    const materialized = await materializeVitals(intent.agentId, simTimeMs);
    const agent = materialized?.agent ?? (await getAgentById(intent.agentId));

    if (!agent || agent.state === 'dead' || materialized?.vitals.dead) {
      deleteAgentMeta(intent.agentId);
      const result: ActionResult = {
        success: false,
        error: 'agent_dead',
      };
      const event = await this.emitActionFailed(intent, tick, simTimeMs, 'agent_dead', decisionMeta);
      return {
        intent,
        tick,
        simTimeMs,
        result,
        events: [event],
        dropped: true,
      };
    }

    const result = await executeAction({ ...intent, tick }, agent);
    const events: WorldEvent[] = [];

    if (result.changes) await updateAgent(intent.agentId, result.changes);

    if (result.success) {

      const durationMs = actionDurationMs(intent.type, agent, result);
      setAgentBusyUntil(intent.agentId, simTimeMs + durationMs);

      // Legacy parity (tick-engine.ts:236-264): every successful action emits
      // the DECISION event (present tense, carries reasoning/telemetry) before
      // the handler's result events (past tense). The UI's heatmap and event
      // filters consume the present-tense shapes.
      events.push(
        await this.emitActionEvent(
          {
            id: uuid(),
            type: `agent_${intent.type}`,
            tick,
            timestamp: Date.now(),
            agentId: intent.agentId,
            payload: {
              action: intent.type,
              params: intent.params,
              reasoning: decisionMeta?.reasoning,
              usedFallback: decisionMeta?.usedFallback ?? false,
              processingTimeMs: decisionMeta?.processingTimeMs,
              // New telemetry fields are additive: omit them entirely when
              // absent (baselines) so payload key-presence checks stay clean.
              ...(decisionMeta?.modelId !== undefined ? { modelId: decisionMeta.modelId } : {}),
              ...(decisionMeta?.effort !== undefined ? { effort: decisionMeta.effort } : {}),
              ...(decisionMeta?.tokens !== undefined ? { tokens: decisionMeta.tokens } : {}),
              ...(decisionMeta?.pricingContext !== undefined ? { pricingContext: decisionMeta.pricingContext, costEligible: decisionMeta.costEligible === true } : {}),
            },
          },
          tick,
          simTimeMs
        )
      );

      for (const event of result.events ?? []) {
        events.push(await this.emitActionEvent(event, tick, simTimeMs));
      }
    } else {
      setAgentBusyUntil(
        intent.agentId,
        simTimeMs + getRuntimeConfig().durations.failedActionPenaltyMs
      );
      for (const event of result.events ?? []) {
        events.push(await this.emitActionEvent(event, tick, simTimeMs));
      }
      events.push(await this.emitActionFailed(intent, tick, simTimeMs, result.error, decisionMeta));
    }

    return {
      intent,
      tick,
      simTimeMs,
      result,
      events,
    };
  }

  private async emitActionEvent(
    event: WorldEvent,
    tick: number,
    simTimeMs: number
  ): Promise<WorldEvent> {
    const stamped: WorldEvent = {
      ...event,
      tick,
      timestamp: Date.now(),
      payload: {
        ...event.payload,
        simTimeMs,
      },
    };
    await emit(stamped);
    return stamped;
  }

  private async emitActionFailed(
    intent: ActionIntent,
    tick: number,
    simTimeMs: number,
    error: string | undefined,
    decisionMeta?: DecisionMeta
  ): Promise<WorldEvent> {
    const failure = error ?? 'Unknown action failure';
    const event: WorldEvent = {
      id: uuid(),
      type: 'action_failed',
      tick,
      timestamp: Date.now(),
      agentId: intent.agentId,
      payload: {
        ...decisionMeta,
        action: intent.type,
        params: intent.params,
        error: failure,
        reason: failure === 'agent_dead' ? 'agent_dead' : undefined,
        simTimeMs,
      },
    };
    await emit(event);
    return event;
  }

  private notifyDrain(): void {
    for (const listener of this.drainListeners) {
      listener();
    }
  }
}

async function emit(event: WorldEvent): Promise<void> {
  await publishEvent(event);
  await appendEvent({
    tick: event.tick,
    agentId: event.agentId ?? null,
    eventType: event.type,
    payload: event.payload,
  });
}

export function actionDurationMs(
  actionType: ActionType,
  agentBefore: Agent,
  result: ActionResult
): number {
  if (result.durationMs !== undefined) return result.durationMs;
  const durations = getRuntimeConfig().durations;

  if (actionType === 'move') {
    const nextX = typeof result.changes?.x === 'number' ? result.changes.x : agentBefore.x;
    const nextY = typeof result.changes?.y === 'number' ? result.changes.y : agentBefore.y;
    const distance = Math.max(Math.abs(nextX - agentBefore.x), Math.abs(nextY - agentBefore.y));
    return Math.max(0, distance) * durations.movePerTileMs;
  }

  switch (actionType) {
    case 'gather':
      return durations.gatherMs;
    case 'forage':
      return durations.forageMs;
    case 'work':
      return durations.workMs;
    case 'sleep':
      return durations.sleepMs;
    case 'trade':
      return durations.tradeMs;
    case 'buy':
      return durations.buyMs;
    case 'consume':
      return durations.consumeMs;
    case 'share_info':
      return durations.shareInfoMs;
    case 'signal':
      return durations.signalMs;
    case 'speak':
      return durations.speakMs;
    case 'harm':
      return durations.harmMs;
    case 'steal':
      return durations.stealMs;
    default:
      return durations.defaultMs;
  }
}
