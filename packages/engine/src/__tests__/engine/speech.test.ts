import { afterEach, beforeEach, expect, test } from 'bun:test';
import { resetRuntimeConfig } from '../../config';
import { buildObservation } from '../../agents/observer';
import { createAgent, getAliveAgents } from '../../engine-memory/queries/agents';
import { resetStore } from '../../engine-memory/store';
import { buildFullPrompt } from '../../llm/prompt-builder';
import { createIntent } from '../../actions';
import { ActionExecutor } from '../../engine/executor';
import { serializeWorld, hydrateWorld } from '../../engine/persistence';

let executor: ActionExecutor;
beforeEach(() => { resetStore(); resetRuntimeConfig(); executor = new ActionExecutor({ nowMs: () => 3 * 60000 }); });
afterEach(() => { resetStore(); resetRuntimeConfig(); });

async function observe(id: string, tick: number) {
  const agents = await getAliveAgents();
  return buildObservation(agents.find((agent) => agent.id === id)!, tick, agents, [], []);
}

test('speech reaches only agents within earshot and keeps who said what to whom', async () => {
  await createAgent({ id: 'speaker', llmType: 'fixture', x: 10, y: 10 });
  await createAgent({ id: 'near', llmType: 'fixture', x: 12, y: 11 });
  await createAgent({ id: 'far', llmType: 'fixture', x: 40, y: 40 });

  const result = await executor.submit(createIntent('speaker', 'speak', { message: 'Do you know where water is?', to: 'near' }, 3));
  expect(result.result.success, result.result.error).toBe(true);

  const heard = await observe('near', 5);
  expect(heard.conversation).toEqual([{ tick: 3, speakerId: 'speaker', spokenByYou: false, to: 'near', message: 'Do you know where water is?' }]);
  expect(buildFullPrompt(heard)).toContain('[2 min ago] Agent speaker said to you: "Do you know where water is?"');

  expect((await observe('far', 5)).conversation).toEqual([]);
  expect(buildFullPrompt(await observe('speaker', 3))).toContain('[just now] You said to Agent near: "Do you know where water is?"');
});

test('an addressee outside earshot is rejected without anyone hearing', async () => {
  await createAgent({ id: 'speaker', llmType: 'fixture', x: 10, y: 10 });
  await createAgent({ id: 'far', llmType: 'fixture', x: 40, y: 40 });
  const result = await executor.submit(createIntent('speaker', 'speak', { message: 'Hello?', to: 'far' }, 3));
  expect(result.result.success).toBe(false);
  expect((await observe('far', 4)).conversation).toEqual([]);
});

test('conversation survives a snapshot round trip', async () => {
  await createAgent({ id: 'speaker', llmType: 'fixture', x: 10, y: 10 });
  await createAgent({ id: 'near', llmType: 'fixture', x: 10, y: 11 });
  await executor.submit(createIntent('speaker', 'speak', { message: 'Hello' }, 3));
  const snapshot = serializeWorld({ worldSeed: 'speech', savedAtSimTimeMs: 3 * 60000, speed: 1 });
  resetStore();
  hydrateWorld(snapshot);
  expect((await observe('near', 4)).conversation?.map((line) => line.message)).toEqual(['Hello']);
});
