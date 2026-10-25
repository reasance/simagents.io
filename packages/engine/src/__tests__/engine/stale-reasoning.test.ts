import { afterEach, beforeEach, expect, test } from 'bun:test';
import { resetRuntimeConfig } from '../../config';
import { buildObservation } from '../../agents/observer';
import { createAgent, getAliveAgents } from '../../engine-memory/queries/agents';
import { resetStore } from '../../engine-memory/store';
import { createRosterProviderFactory } from '../../engine/llm/roster-factory';

const originalFetch = globalThis.fetch;
beforeEach(() => { resetStore(); resetRuntimeConfig(); });
afterEach(() => { globalThis.fetch = originalFetch; resetStore(); resetRuntimeConfig(); });

test('a saved world with a thinking budget on a model that now takes effort levels sends the provider default', async () => {
  await createAgent({ id: 'sonnet', name: 'Agent 1', llmType: 'claude', x: 10, y: 10 });
  const agents = await getAliveAgents();
  const observation = await buildObservation(agents[0], 0, agents, [], []);
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return Response.json({ error: { type: 'overloaded_error' } }, { status: 529 });
  }) as unknown as typeof fetch;

  const factory = createRosterProviderFactory([{
    id: 'sonnet-entry', name: 'Agent 1', provider: 'claude', modelId: 'claude-sonnet-5', reasoningLevel: 4096, color: '#000000',
    capabilities: { temperature: false, output: 'text-json', tokenParameter: 'max_tokens', reasoning: 'budget', maxOutputTokens: 32768 },
  }], { getKey: () => 'k' });
  await factory(agents[0], { sleepWall: async () => {} }).decide({ agent: agents[0], observation, rng: () => 0.5 }, new AbortController().signal).catch(() => undefined);

  expect(body).toBeDefined();
  expect(body).not.toHaveProperty('thinking');
  expect(body).not.toHaveProperty('output_config.effort');
});
