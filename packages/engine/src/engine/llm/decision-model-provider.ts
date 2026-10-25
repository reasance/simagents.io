/**
 * Decision-model provider (Jev by TypeSafe AI, Sage by Levanto Labs).
 *
 * Decision models generate no text: they answer a closed question with one
 * of the options offered. The agent sees the same world description and
 * observation as LLM agents, and chooses among concrete, fully specified
 * actions. It cannot speak, so it never asks or answers questions itself;
 * other agents can still speak to it.
 */

import { getDefaultModelId, isDecisionProtocol, type ConnectionProfile, type DecisionProtocol, type LLMType } from '@simagents/shared';
import { getRuntimeConfig } from '../../config';
import type { ActionParams, ActionType } from '../../actions/types';
import { buildFullPrompt } from '../../llm/prompt-builder';
import type { AgentObservation } from '../../llm/types';
import type { ActionDecision, DecisionContext, DecisionProvider, UndecidedDecision } from '../decision';
import { ProviderRequestError, boundedProviderJson, classifyProviderStatus } from './provider-error';
import type { RequestBudget } from './request-budget';

/** TypeSafe accepts up to 255 options per choice question. */
const MAX_OPTIONS = 255;
const QUESTION_ID = 'next_action';
const INSTRUCTIONS = 'You are the being described above. Which of these do you do next?';

export interface DecisionOption {
  key: string;
  description: string;
  type: ActionType;
  params: ActionParams;
}

export interface DecisionModelProviderConfig {
  provider: LLMType;
  connection: ConnectionProfile;
  connectionId?: string;
  modelId?: string;
  apiKey: string;
  budget?: RequestBudget;
}

/** Concrete actions the agent can take right now, each with its parameters already filled in. */
export function decisionOptions(obs: AgentObservation): DecisionOption[] {
  const config = getRuntimeConfig();
  const size = config.simulation.gridSize;
  const { x, y } = obs.self;
  const options: DecisionOption[] = [];
  const add = (key: string, description: string, type: ActionType, params: object) =>
    options.push({ key, description, type, params: params as ActionParams });

  add('rest', 'Rest for 3 minutes to restore energy', 'sleep', { duration: 3 });
  for (const [key, dx, dy] of [['move_north', 0, -1], ['move_south', 0, 1], ['move_east', 1, 0], ['move_west', -1, 0]] as const) {
    const toX = x + dx, toY = y + dy;
    if (toX >= 0 && toY >= 0 && toX < size && toY < size) add(key, `Step ${key.slice(5)} to (${toX}, ${toY})`, 'move', { toX, toY });
  }
  add('forage', 'Search the ground here for scraps of food', 'forage', {});

  const spawn = obs.nearbyResourceSpawns?.find((s) => s.x === x && s.y === y && s.currentAmount > 0);
  if (spawn) {
    const quantity = Math.max(1, Math.min(config.actions.gather.maxPerAction, Math.floor(spawn.currentAmount)));
    add(`gather_${spawn.resourceType}`, `Collect ${quantity} ${spawn.resourceType} growing here`, 'gather', { resourceType: spawn.resourceType, quantity });
  }
  for (const item of obs.inventory ?? []) {
    if (item.quantity > 0) add(`consume_${item.type}`, `Consume one ${item.type} you carry`, 'consume', { itemType: item.type });
  }

  if (obs.nearbyShelters?.some((s) => s.x === x && s.y === y)) {
    const price = config.actions.buy.prices.food;
    if (obs.self.balance >= price) add('buy_food', `Buy one food here for ${price} CITY`, 'buy', { itemType: 'food', quantity: 1 });
    add('public_work', 'Do labour at this shelter for CITY', 'public_work', {});
  }

  obs.nearbyAgents.forEach((other, index) => {
    const distance = Math.abs(other.x - x) + Math.abs(other.y - y);
    const tag = `a${index + 1}`;
    if (distance <= config.actions.give.maxDistance) {
      for (const item of obs.inventory ?? []) {
        if (item.quantity > 0) add(`give_${item.type}_to_${tag}`, `Hand one ${item.type} to agent ${other.id}`, 'give', { targetAgentId: other.id, itemType: item.type, quantity: 1 });
      }
      if (obs.self.balance >= 5) add(`give_city_to_${tag}`, `Hand 5 CITY to agent ${other.id}`, 'give', { targetAgentId: other.id, itemType: 'CITY', quantity: 5 });
    }
    if (distance <= config.actions.harm.maxDistance) add(`strike_${tag}`, `Strike agent ${other.id} lightly`, 'harm', { targetAgentId: other.id, intensity: 'light' });
    if (distance <= config.actions.steal.maxDistance) {
      for (const item of other.inventory ?? []) {
        if (item.quantity > 0) add(`take_${item.type}_from_${tag}`, `Take one ${item.type} from agent ${other.id} without their agreement`, 'steal', { targetAgentId: other.id, targetItemType: item.type, quantity: 1 });
      }
    }
  });

  obs.nearbyJobOffers?.forEach((offer, index) => {
    add(`accept_job_${index + 1}`, `Accept a job offering ${offer.salary} CITY for ${offer.duration} minutes of work`, 'accept_job', { jobOfferId: offer.id });
  });
  if (obs.activeEmployments?.some((e) => e.role === 'worker' && !e.isComplete)) add('work', 'Work under the job you accepted', 'work', {});

  return options.slice(0, MAX_OPTIONS);
}

/** Same world description and observation an LLM agent reads, minus its response format and action list. */
export function decisionState(obs: AgentObservation): string {
  const full = buildFullPrompt(obs);
  const formatStart = full.indexOf('## How to Respond');
  const experienceStart = full.indexOf('## Your Experience');
  const choiceStart = full.lastIndexOf('## Your Choice');
  let state = formatStart >= 0 && experienceStart > formatStart ? full.slice(0, formatStart) + full.slice(experienceStart) : full;
  if (choiceStart >= 0) state = state.slice(0, state.lastIndexOf('## Your Choice'));
  return state.trim();
}

export class DecisionModelProvider implements DecisionProvider {
  readonly kind: LLMType;
  private readonly protocol: DecisionProtocol;

  constructor(private readonly config: DecisionModelProviderConfig) {
    if (!isDecisionProtocol(config.connection.protocol)) throw new Error('Not a decision-model connection');
    if (config.connection.transport === 'official-relay') throw new Error('Decision models are not available through the official relay');
    this.kind = config.provider;
    this.protocol = config.connection.protocol;
  }

  async decide(ctx: DecisionContext, signal: AbortSignal): Promise<ActionDecision | UndecidedDecision> {
    const observation = ctx.observation as AgentObservation;
    const options = decisionOptions(observation);
    const { chosen, probability, probabilities, modelId, tokens } = await this.ask(decisionState(observation), options, signal);
    const telemetry = {
      modelId,
      tokens,
      costEligible: false,
      pricingContext: { providerId: this.config.provider, modelId, endpoint: this.config.connection.endpoint },
    };
    // No option clearly won: the model stays undecided and the agent does nothing this turn.
    if (chosen === null) {
      const known = Object.entries(probabilities ?? {}).filter(([key]) => options.some((option) => option.key === key));
      return { undecided: true, reasoning: 'Undecided: no option clearly preferred', probabilities: known.length > 0 ? Object.fromEntries(known) : undefined, telemetry };
    }
    const option = options.find((candidate) => candidate.key === chosen)!;
    return {
      type: option.type,
      params: option.params,
      reasoning: `Chose "${option.key}" (${option.description})${probability === undefined ? '' : ` with probability ${probability.toFixed(2)}`}`,
      telemetry,
    };
  }

  /** Explicit connection check: one closed question, no world action. */
  async probe(signal: AbortSignal): Promise<void> {
    await this.ask('This is a connection check. The connection works if you can read this.', [
      { key: 'works', description: 'The connection works', type: 'sleep', params: { duration: 1 } },
      { key: 'fails', description: 'The connection does not work', type: 'sleep', params: { duration: 1 } },
    ], signal);
  }

  private async ask(state: string, options: DecisionOption[], signal: AbortSignal) {
    const release = await this.config.budget?.acquire(this.config.connectionId ?? this.config.provider, signal);
    try {
      if (signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
      const modelId = this.config.modelId || getDefaultModelId(this.config.provider);
      const body = this.protocol === 'typesafe-systemone'
        ? { model: modelId, state, questions: { [QUESTION_ID]: { type: 'choice', instructions: INSTRUCTIONS, criteria: Object.fromEntries(options.map((o) => [o.key, o.description])) } } }
        : { content: state, question: { id: QUESTION_ID, kind: 'choice', instructions: INSTRUCTIONS, options: options.map((o) => ({ option: o.key, description: o.description })) } };
      const { connection } = this.config;
      const url = connection.transport === 'user-relay' ? `${connection.relayUrl}/${connection.endpoint.slice('https://'.length)}` : connection.endpoint;

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
          body: JSON.stringify(body),
          signal,
          redirect: 'error',
          cache: 'no-store',
          credentials: 'omit',
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ProviderRequestError('network', this.config.provider);
      }
      if (!response.ok) {
        const details = await boundedProviderJson(response, 65536).catch(() => undefined);
        throw new ProviderRequestError(classifyProviderStatus(response.status, details), this.config.provider, response.status);
      }
      let json: unknown;
      try { json = await boundedProviderJson(response); } catch { throw new ProviderRequestError('incompatible', this.config.provider); }
      const answer = this.protocol === 'typesafe-systemone' ? readTypeSafe(json) : readLevanto(json);
      if (!answer || (answer.chosen !== null && !options.some((option) => option.key === answer.chosen))) throw new ProviderRequestError('incompatible', this.config.provider);
      return { ...answer, modelId: answer.modelId ?? modelId };
    } finally {
      release?.();
    }
  }
}

/** `chosen` is null when the model is undecided. */
interface Answer { chosen: string | null; probability?: number; probabilities?: Record<string, number>; modelId?: string; tokens?: { input?: number; output?: number } }

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {});
const count = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined);

function readTypeSafe(json: unknown): Answer | undefined {
  const data = record(json);
  const answer = record(record(data.answers)[QUESTION_ID]);
  if (typeof answer.choice !== 'string') return undefined;
  const probability = record(answer.probabilities)[answer.choice];
  const usage = record(data.usage);
  return {
    chosen: answer.choice,
    probability: typeof probability === 'number' ? probability : undefined,
    modelId: typeof data.model === 'string' ? data.model : undefined,
    tokens: { input: count(usage.input_tokens), output: count(usage.output_tokens) },
  };
}

function readLevanto(json: unknown): Answer | undefined {
  const data = record(json);
  const result = record(data.result);
  const meta = record(data.meta);
  const modelId = typeof meta.model === 'string' ? meta.model : undefined;
  if (typeof result.chosen === 'string') {
    return { chosen: result.chosen, probability: typeof result.probability === 'number' ? result.probability : undefined, modelId };
  }
  if (result.chosen !== null) return undefined;
  // A null choice means the top options were too close to call. Probabilities may
  // come as a map or as a list in option order; they are kept for the observer.
  const raw = result.probabilities;
  const entries: Array<[string, unknown]> = Array.isArray(raw)
    ? raw.map((item) => [String(record(item).option ?? ''), record(item).probability])
    : Object.entries(record(raw));
  const probabilities = Object.fromEntries(entries.filter((entry): entry is [string, number] => entry[0] !== '' && typeof entry[1] === 'number'));
  return { chosen: null, probabilities: Object.keys(probabilities).length > 0 ? probabilities : undefined, modelId };
}
