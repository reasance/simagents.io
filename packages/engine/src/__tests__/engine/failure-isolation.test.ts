import { afterEach, beforeEach, expect, test } from 'bun:test';
import { SimEngine } from '../../engine/engine';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { store } from '../../engine-memory/store';
import { ProviderRequestError, type ProviderErrorCode } from '../../engine/llm/provider-error';
import type { ActionDecision, UndecidedDecision } from '../../engine/decision';
import type { Agent } from '../../db/schema';

const engines: SimEngine[] = [];
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle(rounds = 30) { for (let i = 0; i < rounds; i++) await turn(); }
const sleep: ActionDecision = { type: 'sleep', params: { duration: 1 } };

beforeEach(() => { resetRuntimeConfig(); setRuntimeConfig({ engine: { decisionRetryBaseMs: 0, minDecisionIntervalMs: 0 } }); });
afterEach(async () => { for (const engine of engines.splice(0)) await engine.reset(); resetRuntimeConfig(); });

/** The first seeded agent fails as scripted; every other agent sleeps. */
async function world(failures: Array<ProviderErrorCode | 'ok'>) {
  const calls = new Map<string, number>();
  const unresponsive: Array<[string, string]> = [];
  let failing: string | undefined;
  const engine = new SimEngine({
    speed: 1,
    onError: (error) => { throw error; },
    onAgentUnresponsive: (agentId, reason) => unresponsive.push([agentId, reason]),
    providerFactory: (agent: Agent) => ({ kind: 'fixture', decide: async () => {
      failing ??= agent.id;
      const count = (calls.get(agent.id) ?? 0) + 1;
      calls.set(agent.id, count);
      const step = agent.id === failing ? failures[count - 1] ?? 'ok' : 'ok';
      if (step !== 'ok') throw new ProviderRequestError(step, 'fixture');
      return sleep;
    } }),
  });
  engines.push(engine);
  await engine.seed({ agentCount: 2 });
  return { engine, calls, unresponsive, failingId: () => failing! };
}

const eventsOf = (type: string) => store.events.filter((event) => event.eventType === type);

test('a credentials failure leaves only that agent unresponsive while the world keeps running', async () => {
  const { engine, calls, unresponsive, failingId } = await world(['credentials']);
  await engine.start();
  await settle();
  expect(engine.getState().lifecycle).toBe('running');
  expect(unresponsive).toEqual([[failingId(), 'credentials']]);
  expect(calls.get(failingId())).toBe(1);
  const other = [...calls.keys()].find((id) => id !== failingId())!;
  expect(calls.get(other)).toBeGreaterThan(0);
  expect(eventsOf('agent_decision_failed').map((event) => event.payload)).toEqual([expect.objectContaining({ code: 'credentials', willRetry: false })]);
  expect(eventsOf('agent_unresponsive')).toHaveLength(1);
  await engine.tickWall(1000);
  await settle();
  expect(calls.get(failingId())).toBe(1);
});

test('rate limits are retried and a later success resets the failure count', async () => {
  const { engine, calls, unresponsive, failingId } = await world(['rate-limit', 'rate-limit', 'ok', 'rate-limit', 'rate-limit', 'ok']);
  await engine.start();
  // Each successful sleep keeps the agent busy until simulated time passes.
  for (let i = 0; i < 10 && (calls.get(failingId()) ?? 0) < 6; i++) { await settle(); await engine.tickWall(5 * 60000); }
  await settle();
  expect(unresponsive).toEqual([]);
  expect(calls.get(failingId())).toBeGreaterThanOrEqual(6);
  expect(eventsOf('agent_decision_failed').every((event) => (event.payload as { willRetry: boolean }).willRetry)).toBe(true);
});

test('three consecutive failures leave the agent unresponsive and its body keeps changing', async () => {
  setRuntimeConfig({ needs: { hungerDecay: 5 } });
  const { engine, unresponsive, failingId } = await world(['unavailable', 'incompatible', 'network']);
  await engine.start();
  await settle(60);
  expect(unresponsive).toEqual([[failingId(), 'network']]);
  expect(engine.getState().lifecycle).toBe('running');
  const hungerBefore = store.agents.get(failingId())!.hunger;
  await engine.tickWall(10 * 60000);
  await settle();
  expect(store.agents.get(failingId())!.hunger).toBeLessThan(hungerBefore);
});

test('an explicit start gives unresponsive agents another chance', async () => {
  const { engine, calls, failingId } = await world(['quota']);
  await engine.start();
  await settle();
  expect(calls.get(failingId())).toBe(1);
  engine.pause();
  await engine.start();
  await settle();
  expect(calls.get(failingId())).toBeGreaterThan(1);
});

test('an undecided answer is neither an action nor a failure', async () => {
  const undecided: UndecidedDecision = { undecided: true, reasoning: 'Undecided', probabilities: { rest: 0.49, forage: 0.51 }, telemetry: { modelId: 'levanto-sage-v1.3' } };
  const calls: string[] = [];
  const engine = new SimEngine({
    speed: 1,
    onError: (error) => { throw error; },
    providerFactory: (agent: Agent) => ({ kind: 'fixture', decide: async () => {
      calls.push(agent.id);
      return calls.length <= 2 ? undecided : sleep;
    } }),
  });
  engines.push(engine);
  await engine.seed({ agentCount: 1 });
  await engine.start();
  for (let i = 0; i < 5 && calls.length < 3; i++) { await settle(); await engine.tickWall(1000); }
  await settle();
  expect(calls.length).toBe(3);
  expect(eventsOf('agent_undecided').map((event) => event.payload)).toEqual([
    expect.objectContaining({ probabilities: { rest: 0.49, forage: 0.51 }, modelId: 'levanto-sage-v1.3' }),
    expect.objectContaining({ probabilities: { rest: 0.49, forage: 0.51 } }),
  ]);
  expect(eventsOf('agent_decision_failed')).toHaveLength(0);
  expect(eventsOf('agent_unresponsive')).toHaveLength(0);
  expect(eventsOf('agent_sleeping')).toHaveLength(1);
});
