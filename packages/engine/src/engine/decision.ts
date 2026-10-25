import type { Agent } from '../db/schema';
import type { ActionIntent, ActionParams, ActionType } from '../actions/types';
import type { AgentDecision, AgentObservation } from '../llm/types';
import { getFallbackDecision } from '../llm/response-parser';
import {
  createBaselineAgentFromLLMType,
  recordBaselineDecision,
  type BaselineAgentConfig,
  type BaselineLLMType,
} from '../agents/baselines';
import { withRng, type RandomSource } from '../utils/random';

export interface DecisionContext {
  agent: Agent;
  observation: unknown;
  rng: RandomSource;
}

export interface ActionDecision {
  type: ActionType;
  params: ActionParams;
  reasoning?: string;
  /** Replacement for the agent's private notes; absent keeps them */
  notes?: string;
  telemetry?: DecisionTelemetry;
}

export interface PricingContext { providerId: string; modelId: string; endpoint: string }
export interface DecisionTelemetry {
  modelId?: string;
  pricingContext?: PricingContext;
  costEligible?: boolean;
  /** Reasoning effort the request was sent with, if any */
  effort?: string;
  tokens?: {
    input?: number;
    output?: number;
  };
}

export interface DecisionProvider {
  readonly kind: string;
  decide(ctx: DecisionContext, signal: AbortSignal): Promise<ActionDecision>;
}

export type DecisionInput =
  | ActionDecision
  | AgentDecision
  | Pick<ActionIntent, 'type' | 'params'>;

function isAgentDecision(input: DecisionInput): input is AgentDecision {
  return 'action' in input;
}

export function toActionDecision(input: DecisionInput): ActionDecision {
  if (isAgentDecision(input)) {
    return {
      type: input.action,
      params: input.params as ActionParams,
      reasoning: input.reasoning,
      ...(input.notes ? { notes: input.notes } : {}),
    };
  }

  return {
    type: input.type,
    params: input.params,
    reasoning: 'reasoning' in input ? input.reasoning : undefined,
  };
}

function observationAsAgentObservation(observation: unknown): Partial<AgentObservation> {
  return observation && typeof observation === 'object'
    ? (observation as Partial<AgentObservation>)
    : {};
}

export function fallbackDecisionFor(agent: Agent, observation: unknown): ActionDecision {
  const obs = observationAsAgentObservation(observation);
  const fallback = getFallbackDecision(
    agent.hunger,
    agent.energy,
    agent.balance,
    agent.x,
    agent.y,
    obs.inventory,
    obs.nearbyResourceSpawns,
    obs.nearbyShelters,
    obs.nearbyJobOffers,
    obs.activeEmployments,
    obs.nearbyAgents
  );

  return toActionDecision(fallback);
}

export class BaselineDecisionProvider implements DecisionProvider {
  readonly kind: BaselineLLMType;

  constructor(
    kind: BaselineLLMType,
    private readonly config?: BaselineAgentConfig
  ) {
    this.kind = kind;
  }

  async decide(ctx: DecisionContext, signal: AbortSignal): Promise<ActionDecision> {
    if (signal.aborted) throw new DOMException('Decision aborted', 'AbortError');

    const baseline = createBaselineAgentFromLLMType(this.kind, this.config);
    if (!baseline) {
      return fallbackDecisionFor(ctx.agent, ctx.observation);
    }

    const observation = ctx.observation as AgentObservation;
    const decision = withRng(ctx.rng, () => baseline.decide(observation));
    recordBaselineDecision(this.kind);
    return toActionDecision(decision);
  }
}

export interface ScriptedDecisionProviderOptions {
  latencyMs?: number | number[] | ((decisionIndex: number) => number);
  sleep?: (wallMs: number, signal: AbortSignal) => Promise<void>;
  fallbackWhenEmpty?: DecisionInput;
}

export class ScriptedDecisionProvider implements DecisionProvider {
  readonly kind = 'scripted';
  private readonly queue: DecisionInput[];
  private index = 0;

  constructor(
    decisions: DecisionInput[],
    private readonly options: ScriptedDecisionProviderOptions = {}
  ) {
    this.queue = [...decisions];
  }

  get remaining(): number {
    return this.queue.length;
  }

  push(decision: DecisionInput): void {
    this.queue.push(decision);
  }

  async decide(ctx: DecisionContext, signal: AbortSignal): Promise<ActionDecision> {
    const decisionIndex = this.index++;
    const latencyMs = this.latencyFor(decisionIndex);
    if (latencyMs > 0) {
      await this.sleep(latencyMs, signal);
    }

    if (signal.aborted) throw new DOMException('Decision aborted', 'AbortError');

    const next = this.queue.shift() ?? this.options.fallbackWhenEmpty;
    if (next) return toActionDecision(next);
    return fallbackDecisionFor(ctx.agent, ctx.observation);
  }

  private latencyFor(index: number): number {
    const latency = this.options.latencyMs ?? 0;
    if (typeof latency === 'function') return Math.max(0, latency(index));
    if (Array.isArray(latency)) return Math.max(0, latency[index] ?? latency[latency.length - 1] ?? 0);
    return Math.max(0, latency);
  }

  private sleep(wallMs: number, signal: AbortSignal): Promise<void> {
    if (this.options.sleep) return this.options.sleep(wallMs, signal);
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
}

export function createDecisionProviderForLLMType(
  llmType: string,
  config?: BaselineAgentConfig
): DecisionProvider {
  switch (llmType) {
    case 'baseline_random':
    case 'baseline_rule':
    case 'baseline_sugarscape':
    case 'baseline_qlearning':
      return new BaselineDecisionProvider(llmType, config);
    default:
      return new BaselineDecisionProvider('baseline_rule', config);
  }
}
