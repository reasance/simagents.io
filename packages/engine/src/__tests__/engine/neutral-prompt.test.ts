import { afterEach, beforeEach, expect, test } from 'bun:test';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { buildObservation } from '../../agents/observer';
import { createAgent, getAgentById, getAliveAgents } from '../../engine-memory/queries/agents';
import { addToInventory } from '../../engine-memory/queries/inventory';
import { resetStore, store } from '../../engine-memory/store';
import { buildFullPrompt } from '../../llm/prompt-builder';
import { buildEmergentSystemPrompt } from '../../llm/prompts/emergent-prompt';
import { emergenceActions } from '../../llm/prompts/action-surface';
import { parseResponse } from '../../llm/response-parser';
import { normalizeDecisionText } from '../../engine/llm/protocol-adapters';
import { createIntent } from '../../actions';
import { ActionExecutor } from '../../engine/executor';
import { SimEngine } from '../../engine/engine';
import type { ActionDecision } from '../../engine/decision';
import { setCustomSystemPrompt } from '../../llm/prompt-manager';
import { createPuzzleGame } from '../../engine-memory/queries/puzzles';
import { updateAgent } from '../../engine-memory/queries/agents';
import type { AgentObservation } from '../../llm/types';

beforeEach(() => { resetStore(); resetRuntimeConfig(); setCustomSystemPrompt(null); });
afterEach(() => { resetStore(); resetRuntimeConfig(); setCustomSystemPrompt(null); });

const BANNED: RegExp[] = [
  // Social framing and goals the world must not suggest (word prefixes)
  ...['cooperat', 'collaborat', 'help', 'trust', 'betray', 'enem', 'friend', 'all(y|ies|iance)', 'reputation', 'profit', 'opportunit'].map((word) => new RegExp(`\\b${word}`)),
  // Moral labels for physical acts
  ...['steal', 'harm', 'deceiv', 'attack', 'gossip', 'lie\\b', 'lying'].map((word) => new RegExp(`\\b${word}`)),
  // Model and provider identity (whole words)
  ...['claude', 'anthropic', 'gpt', 'openai', 'gemini', 'google', 'grok', 'xai', 'deepseek', 'qwen', 'kimi', 'moonshot', 'glm', 'mistral', 'minimax', 'jev', 'sage', 'opus', 'astra'].map((word) => new RegExp(`\\b${word}\\b`)),
];

async function richPrompt() {
  await createAgent({ id: 'self-agent', llmType: 'claude', name: 'Claude-Opus-max', x: 10, y: 10 });
  await createAgent({ id: 'other-agent', llmType: 'codex', name: 'GPT-6-Astra', x: 11, y: 10 });
  await addToInventory('other-agent', 'food', 3);
  const executor = new ActionExecutor({ nowMs: () => 2 * 60000 });
  await executor.submit(createIntent('other-agent', 'speak', { message: 'Hello there', to: 'self-agent' }, 2));
  const agents = await getAliveAgents();
  return buildFullPrompt(await buildObservation(agents.find((agent) => agent.id === 'self-agent')!, 3, agents, [], []));
}

test('the prompt describes physics without social framing, moral labels or model identity', async () => {
  const prompt = (await richPrompt()).toLowerCase();
  for (const pattern of BANNED) expect(prompt, `prompt matches ${pattern}`).not.toMatch(pattern);
  expect(prompt).toContain('hello there');
  expect(prompt).toContain('time keeps passing while you decide');
});

test('actions are listed alphabetically and structured reputation actions are not offered', () => {
  const names = emergenceActions().map((action) => action.name);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  for (const hidden of ['deceive', 'share_info', 'spread_gossip', 'issue_credential', 'revoke_credential', 'signal', 'spawn_offspring', 'join_puzzle', 'harm', 'steal']) {
    expect(names).not.toContain(hidden);
  }
  for (const physical of ['give', 'speak', 'strike', 'take', 'trade', 'buy', 'offer_job']) expect(names).toContain(physical);
  const system = buildEmergentSystemPrompt();
  for (const action of emergenceActions()) expect(system).toContain(`- ${action.name}: `);
});

test('enabling reproduction or puzzles adds their actions to the list and shows open games', async () => {
  setRuntimeConfig({ puzzle: { enabled: true }, actions: { spawnOffspring: { enabled: true } } });
  const names = emergenceActions().map((action) => action.name);
  expect(names).toContain('spawn_offspring');
  expect(names).toContain('join_puzzle');
  const self = await createAgent({ llmType: 'fixture', x: 5, y: 5 });
  const game = await createPuzzleGame({ gameType: 'password', solution: 'alpha', createdAtTick: 0, endsAtTick: 100, prizePool: 50, fragmentCount: 2 });
  const observation = await buildObservation(self, 1, await getAliveAgents(), [], []);
  expect(observation.activePuzzleGames?.map((active) => active.id)).toEqual([game.id]);
});

test('physical names map to engine actions and unoffered actions are rejected', () => {
  expect(parseResponse('{"action":"strike","params":{"targetAgentId":"b","intensity":"light"}}')?.action).toBe('harm');
  expect(parseResponse('{"action":"take","params":{"targetAgentId":"b","targetItemType":"food","quantity":1}}')?.action).toBe('steal');
  expect(parseResponse('{"action":"harm","params":{"targetAgentId":"b","intensity":"light"}}')).toBeNull();
  expect(parseResponse('{"action":"deceive","params":{"targetAgentId":"b","claim":"x","claimType":"other"}}')).toBeNull();
  // A custom prompt (or one restored from an older world) may name engine actions.
  setCustomSystemPrompt('Choose the signal action with message "check" and intensity 1.');
  expect(parseResponse('{"action":"signal","params":{"message":"check","intensity":1}}')?.action).toBe('signal');
  expect(parseResponse('{"action":"harm","params":{"targetAgentId":"b","intensity":"light"}}')?.action).toBe('harm');
  expect(parseResponse('{"action":"take","params":{"targetAgentId":"b","targetItemType":"food","quantity":1}}')?.action).toBe('steal');
});

test('private notes are parsed, bounded and survive structured output', () => {
  expect(parseResponse('{"action":"sleep","params":{"duration":1},"notes":"  water is east  "}')?.notes).toBe('water is east');
  expect(parseResponse('{"action":"sleep","params":{"duration":1}}')?.notes).toBeUndefined();
  expect(parseResponse(`{"action":"sleep","params":{"duration":1},"notes":"${'x'.repeat(5000)}"}`)?.notes).toHaveLength(1000);
  const structured = normalizeDecisionText('{"action":"sleep","paramsJson":"{\\"duration\\":1}","reasoning":"r","notes":"remember"}', true);
  expect(parseResponse(structured)?.notes).toBe('remember');
  expect(parseResponse(normalizeDecisionText('{"action":"sleep","paramsJson":"{\\"duration\\":1}","reasoning":"r","notes":""}', true))?.notes).toBeUndefined();
});

test('notes written in one decision are stored and shown back only to their author', async () => {
  let calls = 0;
  const engine = new SimEngine({ speed: 1, providerFactory: () => ({ kind: 'fixture', decide: async (): Promise<ActionDecision> => {
    calls++;
    return { type: 'sleep', params: { duration: 1 }, ...(calls === 1 ? { notes: 'The river is two cells north.' } : {}) };
  } }) });
  try {
    await engine.seed({ agentCount: 2 });
    await engine.start();
    for (let i = 0; i < 20 && calls < 2; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    await engine.pause();
    const writers = [...store.agents.values()].filter((agent) => agent.privateNotes);
    expect(writers.length).toBeGreaterThan(0);
    const author = (await getAgentById(writers[0].id))!;
    const agents = await getAliveAgents();
    const own = buildFullPrompt(await buildObservation(author, 1, agents, [], []));
    expect(own).toContain('**Your Private Notes**\nThe river is two cells north.');
    const other = agents.find((agent) => agent.id !== author.id && !agent.privateNotes);
    if (other) expect(buildFullPrompt(await buildObservation(other, 1, agents, [], []))).not.toContain('The river is two cells north.');
  } finally {
    await engine.reset();
  }
});

test('after taking and striking, an agent reads plain physical words and its latest action', async () => {
  let actorId = '';
  let targetId = '';
  let prompt = '';
  const engine = new SimEngine({ speed: 1, onError: (error) => { throw error; }, providerFactory: (agent) => {
    let turn = 0;
    return { kind: 'fixture', decide: async (ctx): Promise<ActionDecision> => {
      if (agent.id !== actorId) return { type: 'sleep', params: { duration: 10 } };
      turn++;
      if (turn === 1) return { type: 'steal', params: { targetAgentId: targetId, targetItemType: 'food', quantity: 1 } };
      // Enough speech that the take falls outside the five events the prompt shows.
      if (turn <= 4) return { type: 'speak', params: { message: `turn ${turn}`, to: targetId } };
      if (turn === 5) return { type: 'harm', params: { targetAgentId: targetId, intensity: 'light' } };
      prompt ||= buildFullPrompt(ctx.observation as AgentObservation);
      return { type: 'sleep', params: { duration: 10 } };
    } };
  } });
  try {
    await engine.seed({ agentCount: 2 });
    [actorId, targetId] = [...store.agents.keys()].sort();
    await updateAgent(actorId, { x: 20, y: 20 });
    await updateAgent(targetId, { x: 20, y: 21 });
    await addToInventory(targetId, 'food', 5);
    await engine.start();
    for (let i = 0; i < 40 && !prompt; i++) {
      for (let j = 0; j < 20; j++) await new Promise((resolve) => setTimeout(resolve, 0));
      await engine.tickWall(15000);
    }
  } finally {
    await engine.reset();
  }
  const lower = prompt.toLowerCase();
  expect(lower).toContain('## what recently happened');
  for (const pattern of [...BANNED, /\bstole\b/, /\btheft\b/, /\bagent_[a-z]/]) expect(lower, `prompt matches ${pattern}`).not.toMatch(pattern);
  expect(lower.slice(lower.indexOf('## what recently happened'))).toContain('strike');
});

test('giving CITY moves currency to an adjacent agent and nothing is minted', async () => {
  await createAgent({ id: 'giver', llmType: 'fixture', balance: 30, x: 5, y: 5 });
  await createAgent({ id: 'receiver', llmType: 'fixture', balance: 4, x: 5, y: 6 });
  const executor = new ActionExecutor({ nowMs: () => 0 });
  const result = await executor.submit(createIntent('giver', 'give', { targetAgentId: 'receiver', itemType: 'CITY', quantity: 10 }, 0));
  expect(result.result.success, result.result.error).toBe(true);
  expect(store.agents.get('giver')!.balance).toBe(20);
  expect(store.agents.get('receiver')!.balance).toBe(14);
  const tooMuch = await executor.submit(createIntent('giver', 'give', { targetAgentId: 'receiver', itemType: 'CITY', quantity: 100 }, 0));
  expect(tooMuch.result.success).toBe(false);
  expect(store.agents.get('giver')!.balance + store.agents.get('receiver')!.balance).toBe(34);
});
