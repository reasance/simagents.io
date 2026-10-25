import { afterEach, beforeEach, expect, test } from 'bun:test';
import { defaultConnection, validateConnectionProfile } from '@simagents/shared';
import { SimEngine } from '../../engine/engine';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { store } from '../../engine-memory/store';
import { updateAgent } from '../../engine-memory/queries/agents';
import { ProviderRequestError } from '../../engine/llm/provider-error';
import { DecisionModelProvider } from '../../engine/llm/decision-model-provider';
import { computeEmergenceMetrics } from '../../engine/emergence-metrics';
import type { DecisionProvider } from '../../engine/decision';
import type { Agent } from '../../db/schema';

const originalFetch = globalThis.fetch;
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
let engine: SimEngine | undefined;
beforeEach(() => { resetRuntimeConfig(); setRuntimeConfig({ engine: { minDecisionIntervalMs: 0, decisionRetryBaseMs: 0 }, needs: { hungerDecay: 0.01, energyDecay: 0.01 } }); });
afterEach(async () => { await engine?.reset(); engine = undefined; globalThis.fetch = originalFetch; resetRuntimeConfig(); });

test('four agents at different speeds talk, fail, choose and are measured in one world', async () => {
  globalThis.fetch = (async () => Response.json({ model: 'jev-1.14.0', answers: { next_action: { choice: 'rest' } } })) as unknown as typeof fetch;
  const roles = new Map<string, 'fast' | 'slow' | 'failing' | 'decision'>();
  const jev = validateConnectionProfile({ ...defaultConnection('typesafe'), transport: 'direct' });

  engine = new SimEngine({
    speed: 1,
    onError: (error) => { throw error; },
    providerFactory: (agent: Agent, tools): DecisionProvider => {
      const role = roles.get(agent.id)!;
      if (role === 'decision') return new DecisionModelProvider({ provider: 'typesafe', connection: jev, apiKey: 'k' });
      return { kind: 'fixture', decide: async (_ctx, signal) => {
        if (role === 'failing') throw new ProviderRequestError('credentials', 'fixture');
        // Simulated provider latency in wall-clock time: the world keeps moving meanwhile.
        await tools.sleepWall(role === 'fast' ? 1000 : 20000, signal);
        const listener = [...roles].find(([, other]) => other === (role === 'fast' ? 'slow' : 'fast'))![0];
        return { type: 'speak', params: { message: role === 'fast' ? 'Is there water here?' : 'Not that I know.', to: listener },
          telemetry: { modelId: 'claude-opus-5-5', effort: role === 'fast' ? 'low' : 'max' } };
      } };
    },
  });
  await engine.seed({ agentCount: 4 });
  const ids = [...store.agents.keys()].sort();
  (['fast', 'slow', 'failing', 'decision'] as const).forEach((role, index) => roles.set(ids[index], role));
  for (const id of ids) await updateAgent(id, { x: 20, y: 20 });

  await engine.start();
  for (let second = 0; second < 60; second++) {
    await engine.tickWall(1000);
    for (let i = 0; i < 5; i++) await turn();
  }
  engine.pause();

  expect(engine.getState().lifecycle).toBe('paused');
  const byRole = (role: string) => ids[['fast', 'slow', 'failing', 'decision'].indexOf(role)];
  const metrics = computeEmergenceMetrics(engine.snapshot());
  const row = (role: string) => metrics.agents.find((agent) => agent.agentId === byRole(role))!;

  expect(row('fast')).toMatchObject({ effort: 'low', modelId: 'claude-opus-5-5' });
  expect(row('slow')).toMatchObject({ effort: 'max' });
  expect(row('fast').decisions).toBeGreaterThan(row('slow').decisions * 3);
  expect(row('slow').decisions).toBeGreaterThan(0);
  expect(row('fast').questions).toBeGreaterThan(0);
  expect(metrics.addressedReciprocity).toBe(1);

  expect(row('failing')).toMatchObject({ unresponsive: true, decisions: 0 });
  expect(row('decision').decisions).toBeGreaterThan(0);
  expect(row('decision').utterances).toBe(0);
  expect(store.events.some((event) => event.agentId === byRole('slow') && event.eventType === 'agent_heard'
    && (event.payload as { message?: string }).message === 'Is there water here?')).toBe(true);
});
