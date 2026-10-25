/**
 * Dry run: scripted local replies in place of model calls.
 *
 * Each turn builds the real prompt, waits a wall-clock latency that grows
 * with the configured effort, and answers with a plausible decision. Nothing
 * leaves the browser, no key is read and nothing is billed. It exists to
 * exercise the interface; its worlds are marked and say nothing about models.
 */

import type { LLMType, ReasoningLevel } from '@simagents/shared';
import { getRuntimeConfig } from '../../config';
import { buildFinalPromptWithMemories } from '../../llm/prompt-builder';
import { parseResponse } from '../../llm/response-parser';
import type { AgentObservation } from '../../llm/types';
import type { RandomSource } from '../../utils/random';
import { fallbackDecisionFor, toActionDecision, type ActionDecision, type DecisionContext, type DecisionProvider } from '../decision';
import { DECISION_SYSTEM_PROMPT } from './llm-provider';
import type { RequestBudget } from './request-budget';
import { sanitizeRequestTrace, type RequestTrace } from './request-trace';

export const DRY_RUN_MODEL_PREFIX = 'dry-run:';

export interface DryRunProviderConfig {
  provider: LLMType;
  modelId: string;
  reasoningLevel?: ReasoningLevel;
  connectionId: string;
  budget?: RequestBudget;
  onTrace?: (trace: RequestTrace) => void;
  sleepWall(wallMs: number, signal: AbortSignal): Promise<void>;
}

const OPENERS = [
  'Hello. Is anyone else around here?',
  'I found food growing to the north.',
  'Who are you?',
  'The ground here is bare.',
  'I am heading east.',
  'Does anyone know where the shelter is?',
  'It is getting dark.',
  'I have been walking for a while.',
];
const REPLIES = [
  'I heard you. I am close.',
  'Where did you see it?',
  'I do not know yet.',
  'I can spare some of what I carry.',
  'Meet me at the shelter.',
  'Keep your distance.',
];
const PLACE_NAMES = ['North Spring', 'Stone Ford', 'Quiet Field', 'Red Hollow', 'Long Ridge', 'Low Meadow'];

/** Wall-clock seconds a turn takes at each effort, before per-model and per-turn variation. */
const EFFORT_MS: Record<string, number> = { none: 900, minimal: 1200, low: 1600, medium: 3000, high: 5000, xhigh: 7000, max: 9000 };

function dryRunLatencyMs(modelId: string, level: ReasoningLevel | undefined, rng: RandomSource): number {
  let base: number;
  if (level === undefined || level === false || level === 0) base = EFFORT_MS.none;
  else if (level === true) base = EFFORT_MS.medium;
  else if (typeof level === 'number') base = Math.min(12_000, 1000 + level / 4);
  else base = EFFORT_MS[String(level).toLowerCase()] ?? EFFORT_MS.medium;
  // A stable factor per model so two models at the same effort still differ.
  let hash = 0;
  for (const char of modelId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const modelFactor = 0.8 + (hash % 1000) / 2000;
  return Math.round(base * modelFactor * (0.7 + rng() * 0.6));
}

const pick = <T>(items: readonly T[], rng: RandomSource): T => items[Math.floor(rng() * items.length) % items.length];
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** A decision a careless but alive agent might make: survive first, then talk, share or name places. */
function dryRunDecision(ctx: DecisionContext): ActionDecision & { notes?: string } {
  const obs = ctx.observation as AgentObservation;
  const self = obs.self ?? { id: ctx.agent.id, x: ctx.agent.x, y: ctx.agent.y, hunger: ctx.agent.hunger, energy: ctx.agent.energy };
  const config = getRuntimeConfig().actions;
  const others = (obs.nearbyAgents ?? []).filter(other => other.id !== self.id);
  const earshot = others.filter(other => distance(self, other) <= config.speak.hearingRadius);
  const adjacent = others.filter(other => distance(self, other) <= config.give.maxDistance);
  const food = obs.inventory?.find(item => item.type === 'food')?.quantity ?? 0;
  const lastHeard = [...(obs.conversation ?? [])].reverse().find(line => !line.spokenByYou);
  const roll = ctx.rng();
  const urgent = self.hunger < 35 || self.energy < 25;

  let decision: ActionDecision;
  if (!urgent && earshot.length && roll < 0.35) {
    const reply = lastHeard && earshot.some(other => other.id === lastHeard.speakerId) && ctx.rng() < 0.6;
    decision = {
      type: 'speak',
      params: reply ? { message: pick(REPLIES, ctx.rng), to: lastHeard!.speakerId } : { message: pick(OPENERS, ctx.rng) },
      reasoning: reply ? 'Dry run: answering what I heard.' : 'Dry run: saying something to whoever is near.',
    } as ActionDecision;
  } else if (!urgent && adjacent.length && food >= 2 && roll < 0.45) {
    decision = {
      type: 'give',
      params: { targetAgentId: pick(adjacent, ctx.rng).id, itemType: 'food', quantity: 1 },
      reasoning: 'Dry run: handing over some food.',
    } as ActionDecision;
  } else if (!urgent && roll > 0.97) {
    decision = { type: 'name_location', params: { name: pick(PLACE_NAMES, ctx.rng) }, reasoning: 'Dry run: naming this place.' } as ActionDecision;
  } else {
    const fallback = fallbackDecisionFor(ctx.agent, ctx.observation);
    decision = { ...fallback, reasoning: fallback.reasoning?.replace(/^Fallback:/, 'Dry run:') };
  }
  if (ctx.rng() < 0.2) decision.notes = `Was at ${self.x},${self.y}. ${others.length ? `${others.length} others in sight.` : 'Nobody in sight.'}`;
  return decision;
}

export class DryRunDecisionProvider implements DecisionProvider {
  readonly kind = 'dry_run';

  constructor(private readonly config: DryRunProviderConfig) {}

  async decide(ctx: DecisionContext, signal: AbortSignal): Promise<ActionDecision> {
    if (signal.aborted) throw new DOMException('Decision aborted', 'AbortError');
    const observation = ctx.observation as AgentObservation;
    // The real prompt, so prompt logs and token estimates look like a live session.
    const user = await buildFinalPromptWithMemories(ctx.agent.id, observation, observation.self?.personality ?? null);
    const release = await this.config.budget?.acquire(this.config.connectionId, signal);
    const startedAt = Date.now();
    let responseBody: string | undefined;
    let outcome: RequestTrace['outcome'] = 'failed';
    try {
      await this.config.sleepWall(dryRunLatencyMs(this.config.modelId, this.config.reasoningLevel, ctx.rng), signal);
      const scripted = dryRunDecision(ctx);
      responseBody = JSON.stringify({ action: scripted.type, params: scripted.params, reasoning: scripted.reasoning, ...(scripted.notes ? { notes: scripted.notes } : {}) });
      // Same parser as real replies; scripted engine names it does not offer are kept as they are.
      const parsed = parseResponse(responseBody);
      const decision = parsed ? toActionDecision(parsed) : scripted;
      decision.telemetry = {
        costEligible: false,
        modelId: `${DRY_RUN_MODEL_PREFIX}${this.config.modelId}`,
        ...(this.config.reasoningLevel !== undefined ? { effort: String(this.config.reasoningLevel) } : {}),
        tokens: { input: Math.ceil((DECISION_SYSTEM_PROMPT.length + user.length) / 4), output: Math.ceil(responseBody.length / 4) },
      };
      outcome = 'success';
      return decision;
    } catch (error) {
      if (signal.aborted) outcome = 'aborted';
      throw error;
    } finally {
      release?.();
      try {
        this.config.onTrace?.(sanitizeRequestTrace({
          requestId: crypto.randomUUID(), agentId: ctx.agent.id, tick: observation.tick, protocol: 'dry-run',
          requestedModel: this.config.modelId, connectionId: this.config.connectionId, startedAt, durationMs: Math.max(0, Date.now() - startedAt),
          outcome, ...(outcome === 'aborted' ? { errorCode: 'aborted' } : {}),
          requestBody: JSON.stringify({ dryRun: true, model: this.config.modelId, effort: this.config.reasoningLevel ?? null, system: DECISION_SYSTEM_PROMPT, user }),
          responseBody, truncated: false, redacted: false,
        }, []));
      } catch { /* Collector failure is isolated. */ }
    }
  }
}
