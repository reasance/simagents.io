import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { SimEngine } from '../../engine/engine';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { store } from '../../engine-memory/store';
import type { ActionDecision } from '../../engine/decision';

const engines: SimEngine[] = [];
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
function make(decide: () => Promise<ActionDecision>, onError?: (error: unknown) => void) {
  const engine = new SimEngine({ speed: 1, providerFactory: () => ({ kind: 'fixture', decide }), onError });
  engines.push(engine);
  return engine;
}
beforeEach(() => { resetRuntimeConfig(); setRuntimeConfig({ puzzle: { enabled: false } }); });
afterEach(async () => { for (const engine of engines.splice(0)) await engine.reset(); resetRuntimeConfig(); });

describe('explicit session lifecycle', () => {
  test('seed and hydration make no provider requests until explicit start', async () => {
    let calls = 0;
    const engine = make(async () => { calls++; return { type: 'sleep', params: { duration: 1 } }; });
    await engine.seed({ agentCount: 1 });
    await turn();
    expect(calls).toBe(0);
    const snapshot = engine.snapshot();
    await engine.hydrate(snapshot);
    await turn();
    expect(calls).toBe(0);
    expect(engine.getState().lifecycle).toBe('initialized');
    await engine.start();
    await turn();
    expect(calls).toBe(1);
  });

  test('reset ignores a response from the terminated session', async () => {
    let finish!: (decision: ActionDecision) => void;
    const engine = make(() => new Promise((resolve) => { finish = resolve; }));
    await engine.seed({ agentCount: 1 });
    await engine.start();
    await turn();
    await engine.reset();
    finish({ type: 'sleep', params: { duration: 1 } });
    await turn();
    expect(store.agents.size).toBe(0);
    expect(store.events.length).toBe(0);
    expect(engine.getState().lifecycle).toBe('initialized');
  });

  test('pause discards in-flight decisions and freezes time', async () => {
    let finish!: (decision: ActionDecision) => void;
    const engine = make(() => new Promise((resolve) => { finish = resolve; }));
    await engine.seed({ agentCount: 1 });
    await engine.start();
    await turn();
    engine.pause();
    finish({ type: 'sleep', params: { duration: 1 } });
    await engine.tickWall(10000);
    await turn();
    expect(engine.nowMs()).toBe(0);
    expect([...store.agents.values()][0].state).toBe('idle');
  });

  test('an unclassified decision error stops the world without a fallback action', async () => {
    const errors: unknown[] = [];
    // Classified provider failures leave only that agent unresponsive (failure-isolation.test.ts).
    const engine = make(async () => { throw new Error('fixture engine fault'); }, (e) => errors.push(e));
    await engine.seed({ agentCount: 1 });
    await engine.start();
    await turn();
    expect(engine.getState().lifecycle).toBe('error');
    expect(engine.isPaused()).toBe(true);
    expect(errors.length).toBe(1);
    expect(store.events.length).toBe(0);
  });

  test('simultaneous heartbeats and mutations serialize without losing an update', async () => {
    const engine = make(() => new Promise(() => {}));
    await engine.seed({ agentCount: 0 });
    engine.resume();
    const order: string[] = [];
    const mutation = engine.getExecutor().mutate(async () => {
      order.push('begin'); await turn(); order.push('end');
    });
    await Promise.all([mutation, engine.tickWall(1000), engine.tickWall(1000)]);
    expect(order).toEqual(['begin', 'end']);
    expect(engine.nowMs()).toBe(2000);
    expect(store.worldState.currentTick).toBe(0);
  });
});
