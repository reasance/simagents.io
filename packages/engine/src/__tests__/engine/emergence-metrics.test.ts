import { beforeEach, expect, test } from 'bun:test';
import { resetRuntimeConfig } from '../../config';
import { createAgent } from '../../engine-memory/queries/agents';
import { addToInventory } from '../../engine-memory/queries/inventory';
import { resetStore } from '../../engine-memory/store';
import { createIntent } from '../../actions';
import { ActionExecutor } from '../../engine/executor';
import { serializeWorld } from '../../engine/persistence';
import { computeEmergenceMetrics, emergenceAgentsCsv, emergenceEdgesCsv } from '../../engine/emergence-metrics';

beforeEach(() => { resetStore(); resetRuntimeConfig(); });

test('relational metrics count speech, replies, gifts, force and shared names from the event log', async () => {
  await createAgent({ id: 'ana', name: 'Agent 1', llmType: 'claude', x: 5, y: 5 });
  await createAgent({ id: 'bo', name: '=Agent 2', llmType: 'codex', x: 5, y: 6 });
  await createAgent({ id: 'cy', name: 'Agent 3', llmType: 'gemini', x: 40, y: 40 });
  await addToInventory('ana', 'food', 3);
  const executor = new ActionExecutor({ nowMs: () => 30 * 60000 });
  const meta = { processingTimeMs: 1200, modelId: 'claude-opus-5-5', effort: 'max', tokens: { input: 500, output: 40 } };
  await executor.submit(createIntent('ana', 'speak', { message: 'Do you need food?', to: 'bo' }, 30), meta);
  await executor.submit(createIntent('bo', 'speak', { message: 'Yes, please.', to: 'ana' }, 30), { processingTimeMs: 300 });
  await executor.submit(createIntent('ana', 'give', { targetAgentId: 'bo', itemType: 'food', quantity: 1 }, 30), meta);
  await executor.submit(createIntent('bo', 'harm', { targetAgentId: 'ana', intensity: 'light' }, 30));
  await executor.submit(createIntent('ana', 'name_location', { name: 'River' }, 30), meta);
  await executor.submit(createIntent('bo', 'name_location', { name: 'river' }, 30));

  const metrics = computeEmergenceMetrics(serializeWorld({ worldSeed: 'metrics', savedAtSimTimeMs: 60 * 60000, speed: 1 }));
  const ana = metrics.agents.find((row) => row.agentId === 'ana')!;
  const bo = metrics.agents.find((row) => row.agentId === 'bo')!;
  expect(ana).toMatchObject({ modelId: 'claude-opus-5-5', effort: 'max', utterances: 1, questions: 1, giftsGiven: 1, distinctAddressees: 1, distinctListeners: 1, decisions: 3, meanDecisionMs: 1200, inputTokens: 1500 });
  expect(bo).toMatchObject({ giftsReceived: 1, utterances: 1, questions: 0, strikes: expect.any(Number) });
  expect(metrics.agents.find((row) => row.agentId === 'cy')).toMatchObject({ utterances: 0, distinctListeners: 0, decisions: 0 });
  expect(metrics.addressedReciprocity).toBe(1);
  expect(metrics.giftReciprocity).toBe(0);
  expect(metrics.placeNames).toEqual({ proposals: 2, distinctNames: 1, sharedNames: 1 });
  expect(metrics.edges.find((edge) => edge.from === 'ana' && edge.to === 'bo')).toMatchObject({ heard: 1, addressed: 1, gifts: 1 });
  expect(ana.survivalMinutes).toBe(60);
  expect(ana.decisionsPerSimHour).toBe(3);

  const agentsCsv = emergenceAgentsCsv(metrics);
  expect(agentsCsv.split('\n')[0]).toStartWith('agentId,name,llmType,modelId,effort');
  expect(agentsCsv).toContain("'=Agent 2");
  expect(emergenceEdgesCsv(metrics).split('\n')).toHaveLength(metrics.edges.length + 1);
});
