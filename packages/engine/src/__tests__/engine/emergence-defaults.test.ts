import { afterEach, expect, test } from 'bun:test';
import { getRuntimeConfig, resetRuntimeConfig } from '../../config';
import { buildObservation } from '../../agents/observer';
import { createAgent } from '../../engine-memory/queries/agents';
import { updateRelationshipTrust } from '../../engine-memory/queries/memories';
import { resetStore } from '../../engine-memory/store';
import { buildFullPrompt } from '../../llm/prompt-builder';
import { handleSpawnOffspring } from '../../actions/handlers/spawn-offspring';
import { createIntent } from '../../actions';

afterEach(() => { resetStore(); resetRuntimeConfig(); });

test('agents never see the trust score the system keeps about a neighbour', async () => {
  const self = await createAgent({ llmType: 'fixture', x: 5, y: 5 });
  const other = await createAgent({ llmType: 'fixture', x: 6, y: 5 });
  await updateRelationshipTrust(self.id, other.id, 80, 0);
  const observation = await buildObservation(self, 0, [self, other], [], []);
  expect(observation.nearbyAgents.map((agent) => agent.id)).toContain(other.id);
  expect(observation.relationships).toBeUndefined();
  const prompt = buildFullPrompt(observation);
  expect(prompt).not.toContain('familiar face');
  expect(prompt).not.toContain('distrust');
});

test('reproduction and puzzle games are unavailable unless a world enables them', async () => {
  expect(getRuntimeConfig().puzzle.enabled).toBe(false);
  expect(getRuntimeConfig().actions.spawnOffspring.enabled).toBe(false);
  const agent = await createAgent({ llmType: 'fixture', balance: 10_000, energy: 100, health: 100 });
  const result = await handleSpawnOffspring(createIntent(agent.id, 'spawn_offspring', {}, 0), agent);
  expect(result.success).toBe(false);
  expect(result.error).toContain('not available');
});
