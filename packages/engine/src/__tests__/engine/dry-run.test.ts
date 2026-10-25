import { afterEach, beforeEach, expect, test } from 'bun:test';
import { getDefaultModelId } from '@simagents/shared';
import { resetRuntimeConfig } from '../../config';
import { buildObservation } from '../../agents/observer';
import { createAgent, getAliveAgents } from '../../engine-memory/queries/agents';
import { resetStore } from '../../engine-memory/store';
import { createRosterProviderFactory } from '../../engine/llm/roster-factory';
import { DRY_RUN_MODEL_PREFIX, dryRunLatencyMs } from '../../engine/llm/dry-run-provider';
import type { RequestTrace } from '../../engine/llm/request-trace';
import { isUndecided } from '../../engine/decision';

const originalFetch = globalThis.fetch;
beforeEach(() => { resetStore(); resetRuntimeConfig(); });
afterEach(() => { globalThis.fetch = originalFetch; resetStore(); resetRuntimeConfig(); });

test('a dry run reads no key, sends nothing and answers with a parsed decision after an effort-scaled wait', async () => {
  await createAgent({ id: 'a', name: 'Agent 1', llmType: 'claude', x: 10, y: 10 });
  await createAgent({ id: 'b', name: 'Agent 2', llmType: 'claude', x: 11, y: 10 });
  const agents = await getAliveAgents();
  const self = agents.find((agent) => agent.id === 'a')!;
  const observation = await buildObservation(self, 0, agents, [], []);
  let fetched = false, keyRead = false;
  globalThis.fetch = (async () => { fetched = true; return Response.json({}); }) as unknown as typeof fetch;
  const traces: RequestTrace[] = [];
  const waits: number[] = [];

  const factory = createRosterProviderFactory(
    [{ id: 'entry-a', name: 'Agent 1', provider: 'claude', modelId: getDefaultModelId('claude'), reasoningLevel: 'max', color: '#000000', connectionId: 'missing' }],
    { getKey: () => { keyRead = true; return 'k'; } },
    { dryRun: true, onTrace: (trace) => traces.push(trace) },
  );
  const provider = factory(self, { sleepWall: async (ms) => { waits.push(ms); } });
  const decision = await provider.decide({ agent: self, observation, rng: () => 0.5 }, new AbortController().signal);

  expect(fetched).toBe(false);
  expect(keyRead).toBe(false);
  expect(provider.kind).toBe('dry_run');
  expect(isUndecided(decision)).toBe(false);
  if (isUndecided(decision)) return;
  expect(decision.telemetry).toMatchObject({ costEligible: false, effort: 'max', modelId: `${DRY_RUN_MODEL_PREFIX}${getDefaultModelId('claude')}` });
  expect(decision.telemetry?.tokens?.input).toBeGreaterThan(100);
  expect(waits).toHaveLength(1);
  expect(traces).toHaveLength(1);
  expect(traces[0]).toMatchObject({ protocol: 'dry-run', outcome: 'success', agentId: 'a' });
  expect(JSON.parse(traces[0].requestBody)).toMatchObject({ dryRun: true });
});

test('higher effort waits longer for the same model and draw', () => {
  const at = (level: Parameters<typeof dryRunLatencyMs>[1]) => dryRunLatencyMs('claude-sonnet-5-5', level, () => 0.5);
  expect(at('low')).toBeLessThan(at('medium'));
  expect(at('medium')).toBeLessThan(at('high'));
  expect(at('high')).toBeLessThan(at('max'));
  expect(at(undefined)).toBeLessThan(at('low'));
});

test('a dry run speaks to whoever is within earshot when it is not in need', async () => {
  await createAgent({ id: 'a', name: 'Agent 1', llmType: 'claude', x: 10, y: 10 });
  await createAgent({ id: 'b', name: 'Agent 2', llmType: 'claude', x: 12, y: 10 });
  const agents = await getAliveAgents();
  const self = agents.find((agent) => agent.id === 'a')!;
  const observation = await buildObservation(self, 0, agents, [], []);
  const factory = createRosterProviderFactory([{ id: 'entry-a', name: 'Agent 1', provider: 'claude', modelId: getDefaultModelId('claude'), color: '#000000' }],
    { getKey: () => undefined }, { dryRun: true });
  const decision = await factory(self, { sleepWall: async () => {} }).decide({ agent: self, observation, rng: () => 0.1 }, new AbortController().signal);
  expect(!isUndecided(decision) && decision.type).toBe('speak');
});
