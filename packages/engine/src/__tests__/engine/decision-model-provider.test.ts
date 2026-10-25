import { afterEach, beforeEach, expect, test } from 'bun:test';
import { defaultConnection, validateConnectionProfile, type ConnectionProfile } from '@simagents/shared';
import { resetRuntimeConfig } from '../../config';
import { buildObservation } from '../../agents/observer';
import { createAgent, getAliveAgents } from '../../engine-memory/queries/agents';
import { addToInventory } from '../../engine-memory/queries/inventory';
import { resetStore } from '../../engine-memory/store';
import { isUndecided, type ActionDecision, type UndecidedDecision } from '../../engine/decision';
import { DecisionModelProvider, decisionOptions, decisionState } from '../../engine/llm/decision-model-provider';
import { ProviderRequestError } from '../../engine/llm/provider-error';
import { createRosterProviderFactory } from '../../engine/llm/roster-factory';

const originalFetch = globalThis.fetch;
beforeEach(() => { resetStore(); resetRuntimeConfig(); });
afterEach(() => { globalThis.fetch = originalFetch; resetStore(); resetRuntimeConfig(); });

async function scene() {
  await createAgent({ id: 'chooser', llmType: 'typesafe', x: 10, y: 10, balance: 20 });
  await createAgent({ id: 'neighbour', llmType: 'claude', x: 10, y: 11 });
  await addToInventory('chooser', 'food', 2);
  await addToInventory('neighbour', 'material', 1);
  const agents = await getAliveAgents();
  const agent = agents.find((candidate) => candidate.id === 'chooser')!;
  return { agent, observation: await buildObservation(agent, 0, agents, [], []) };
}

const typesafe = (): ConnectionProfile => validateConnectionProfile({ ...defaultConnection('typesafe'), transport: 'direct' });
const levanto = (): ConnectionProfile => validateConnectionProfile({ ...defaultConnection('levanto'), transport: 'direct' });

test('options are concrete physical actions with unique keys and never include speech', async () => {
  const { observation } = await scene();
  const options = decisionOptions(observation);
  const keys = options.map((option) => option.key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const key of ['rest', 'move_north', 'move_south', 'move_east', 'move_west', 'forage', 'consume_food', 'give_food_to_a1', 'give_city_to_a1', 'strike_a1', 'take_material_from_a1']) expect(keys).toContain(key);
  expect(options.some((option) => option.type === 'speak')).toBe(false);
  expect(options.find((option) => option.key === 'give_food_to_a1')!.params).toEqual({ targetAgentId: 'neighbour', itemType: 'food', quantity: 1 });
});

test('the state is the LLM world description and observation without response format or action list', async () => {
  const { observation } = await scene();
  const state = decisionState(observation);
  expect(state).toContain('## Your Body');
  expect(state).toContain('## Your Experience');
  expect(state).not.toContain('## How to Respond');
  expect(state).not.toContain('## Actions');
  expect(state).not.toContain('## Your Choice');
});

test('Jev receives one choice question and its answer becomes the chosen action', async () => {
  const { agent, observation } = await scene();
  let sent: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent = { url, init };
    return Response.json({ model: 'jev-1.14.0', answers: { next_action: { type: 'choice', choice: 'give_food_to_a1', confidence: 0.8, probabilities: { give_food_to_a1: 0.9, rest: 0.1 } } }, usage: { input_tokens: 400, output_tokens: 20 } });
  }) as unknown as typeof fetch;
  const decision = await new DecisionModelProvider({ provider: 'typesafe', connection: typesafe(), modelId: 'jev-1.14.0', apiKey: 'secret-key' }).decide({ agent, observation, rng: () => 0.5 }, new AbortController().signal);
  expect(decision).toMatchObject({ type: 'give', params: { targetAgentId: 'neighbour', itemType: 'food', quantity: 1 }, telemetry: { modelId: 'jev-1.14.0', tokens: { input: 400, output: 20 } } });
  expect(sent!.url).toBe('https://api.typesafe.ai/v1/systemone');
  expect(sent!.init.credentials).toBe('omit');
  expect((sent!.init.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
  const body = JSON.parse(String(sent!.init.body));
  expect(body.model).toBe('jev-1.14.0');
  expect(body.questions.next_action.type).toBe('choice');
  expect(Object.keys(body.questions.next_action.criteria)).toContain('give_food_to_a1');
  expect(String(sent!.init.body)).not.toContain('secret-key');
});

test('Sage stays undecided when its choice is too close to call', async () => {
  const { agent, observation } = await scene();
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return Response.json({ id: 'next_action', kind: 'choice', result: { chosen: null, probability: null, probabilities: [{ option: 'rest', probability: 0.48 }, { option: 'forage', probability: 0.52 }, { option: 'fly_away', probability: 0 }] }, meta: { model: 'levanto-sage-v1.3', latency_ms: 90 } });
  }) as unknown as typeof fetch;
  const decision = await new DecisionModelProvider({ provider: 'levanto', connection: levanto(), apiKey: 'k' }).decide({ agent, observation, rng: () => 0.5 }, new AbortController().signal);
  expect(isUndecided(decision)).toBe(true);
  expect(decision).not.toHaveProperty('type');
  expect((decision as UndecidedDecision).probabilities).toEqual({ rest: 0.48, forage: 0.52 });
  expect(decision.telemetry?.modelId).toBe('levanto-sage-v1.3');
  expect((body.question as { kind: string; options: unknown[] }).kind).toBe('choice');
  expect((body.question as { options: Array<{ option: string }> }).options.map((option) => option.option)).toContain('forage');
});

test('Sage acts on a clear choice', async () => {
  const { agent, observation } = await scene();
  globalThis.fetch = (async () => Response.json({ id: 'next_action', kind: 'choice', result: { chosen: 'forage', probability: 0.8 }, meta: { model: 'levanto-sage-v1.3' } })) as unknown as typeof fetch;
  const decision = await new DecisionModelProvider({ provider: 'levanto', connection: levanto(), apiKey: 'k' }).decide({ agent, observation, rng: () => 0.5 }, new AbortController().signal);
  expect(isUndecided(decision)).toBe(false);
  expect((decision as ActionDecision).type).toBe('forage');
});

test('an unknown choice or an HTTP failure becomes a classified provider error', async () => {
  const { agent, observation } = await scene();
  const provider = new DecisionModelProvider({ provider: 'typesafe', connection: typesafe(), apiKey: 'k' });
  globalThis.fetch = (async () => Response.json({ answers: { next_action: { choice: 'fly_away' } } })) as unknown as typeof fetch;
  await expect(provider.decide({ agent, observation, rng: () => 0.5 }, new AbortController().signal)).rejects.toMatchObject({ code: 'incompatible' });
  globalThis.fetch = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
  const error = await provider.decide({ agent, observation, rng: () => 0.5 }, new AbortController().signal).catch((caught) => caught);
  expect(error).toBeInstanceOf(ProviderRequestError);
  expect(error.code).toBe('credentials');
});

test('user relays receive the request and the official relay is refused', async () => {
  const { agent, observation } = await scene();
  let url = '';
  globalThis.fetch = (async (target: string) => { url = target; return Response.json({ answers: { next_action: { choice: 'rest' } } }); }) as unknown as typeof fetch;
  const relayed = validateConnectionProfile({ ...defaultConnection('typesafe', 'https://relay.example.test'), transport: 'user-relay' });
  await new DecisionModelProvider({ provider: 'typesafe', connection: relayed, apiKey: 'k' }).decide({ agent, observation, rng: () => 0.5 }, new AbortController().signal);
  expect(url).toBe('https://relay.example.test/api.typesafe.ai/v1/systemone');
  expect(() => validateConnectionProfile({ ...defaultConnection('typesafe'), transport: 'official-relay', relayUrl: 'https://relay.example.test', relayCredentialRef: 'relay:access' })).toThrow('official relay');
});

test('a roster entry on a decision-model connection gets a decision-model provider', async () => {
  const { agent } = await scene();
  const connection = typesafe();
  agent.rosterEntryId = 'jev-entry';
  const factory = createRosterProviderFactory([{ id: 'jev-entry', name: 'Agent 1', provider: 'typesafe', modelId: 'jev-1.14.0', color: '#000000', connectionId: connection.id }], { getKey: () => 'k' }, { connections: [connection] });
  expect(factory(agent, { sleepWall: async () => {} })).toBeInstanceOf(DecisionModelProvider);
});
