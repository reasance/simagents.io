import { beforeEach, expect, test } from 'bun:test';
import { ActionExecutor } from '../../engine/executor';
import { createIntent, getHandler, registerHandler } from '../../actions';
import type { ActionParams, ActionType } from '../../actions/types';
import { createAgent, getAgentById, killAgent } from '../../engine-memory/queries/agents';
import { resetStore, store } from '../../engine-memory/store';
import { resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { createPuzzleGame, createPuzzleFragments, getAgentPuzzleContext, expirePuzzleGames } from '../../engine-memory/queries/puzzles';
import { completeGestations } from '../../engine/reproduction';
import { createRosterProviderFactory } from '../../engine/llm/roster-factory';
import { storeMemory, decayStaleRelationships, updateRelationshipTrust } from '../../engine-memory/queries/memories';

let executor: ActionExecutor;
beforeEach(() => {
  resetStore(); resetRuntimeConfig();
  // These mechanics are off by default; the tests cover them when a world enables them.
  setRuntimeConfig({ puzzle: { enabled: true }, actions: { spawnOffspring: { enabled: true } } });
  executor = new ActionExecutor({ nowMs: () => 0 });
});
const act = (id: string, type: ActionType, params: ActionParams) => executor.submit(createIntent(id, type, params, 0));
async function puzzle() {
  const a = await createAgent({ id: 'a', llmType: 'fixture' });
  const b = await createAgent({ id: 'b', llmType: 'fixture' });
  const game = await createPuzzleGame({ gameType: 'password', solution: 'alpha', createdAtTick: 0, endsAtTick: 10, prizePool: 50, fragmentCount: 2 });
  const fragments = await createPuzzleFragments([
    { gameId: game.id, fragmentIndex: 0, content: 'al' },
    { gameId: game.id, fragmentIndex: 1, content: 'pha' },
  ]);
  expect((await act(a.id, 'join_puzzle', { gameId: game.id })).result.success).toBe(true);
  expect((await act(b.id, 'join_puzzle', { gameId: game.id })).result.success).toBe(true);
  return { a, b, game, fragments };
}

test('failed attempts retain declared costs and outcome events', async () => {
  const agent = await createAgent({ llmType: 'fixture', energy: 40 });
  const original = getHandler('forage')!;
  registerHandler('forage', async () => ({ success: false, error: 'fixture miss', changes: { energy: 35 }, events: [{ id: 'miss', type: 'forage_missed', tick: 0, timestamp: 0, payload: {} }] }));
  try {
    const result = await act(agent.id, 'forage', {});
    expect((await getAgentById(agent.id))?.energy).toBe(35);
    expect(result.events.map((event) => event.type)).toEqual(['forage_missed', 'action_failed']);
  } finally { registerHandler('forage', original); }
});

test('puzzle fragments reach recipients, focus restricts actions, leaving never clears another owner', async () => {
  const { a, b, game, fragments } = await puzzle();
  expect((await act(a.id, 'share_fragment', { fragmentId: fragments[0].id, targetAgentId: b.id })).result.success).toBe(true);
  expect((await getAgentPuzzleContext(b.id)).myFragments.map((f) => f.content).sort()).toEqual(['al', 'pha']);
  expect((await act(b.id, 'move', { toX: 1, toY: 0 })).result.success).toBe(false);
  const before = (await getAgentById(b.id))!.balance;
  const poolBefore = store.puzzleGames.get(game.id)!.prizePool;
  expect((await act(b.id, 'leave_puzzle', { gameId: game.id })).result.success).toBe(true);
  const refund = (await getAgentById(b.id))!.balance - before;
  expect(store.puzzleGames.get(game.id)!.prizePool).toBe(poolBefore - refund);
  expect(store.puzzleFragments.get(fragments[0].id)?.ownerId).toBe(a.id);
  expect((await act(b.id, 'leave_puzzle', { gameId: game.id })).result.success).toBe(false);
});

test('puzzle solution distributes recorded prizes only once and releases focus', async () => {
  const { a, b, game } = await puzzle();
  const before = [...store.agents.values()].reduce((sum, agent) => sum + agent.balance, 0);
  expect((await act(a.id, 'submit_solution', { gameId: game.id, solution: 'wrong' })).result.success).toBe(true);
  expect((await act(a.id, 'submit_solution', { gameId: game.id, solution: 'alpha' })).result.success).toBe(true);
  const solved = store.puzzleGames.get(game.id)!;
  const paid = solved.prizeDistribution!.reduce((sum, p) => sum + p.amount, 0);
  expect(paid).toBeLessThanOrEqual(solved.prizePool);
  expect([...store.agents.values()].reduce((sum, agent) => sum + agent.balance, 0) - before).toBeCloseTo(paid);
  expect((await act(a.id, 'submit_solution', { gameId: game.id, solution: 'alpha' })).result.success).toBe(false);
  expect((await getAgentPuzzleContext(b.id)).currentGameId).toBeUndefined();
});

test('expiration releases participants and prevents refund after the deadline', async () => {
  const { a, game } = await puzzle();
  await expirePuzzleGames(10);
  expect((await getAgentPuzzleContext(a.id)).currentGameId).toBeUndefined();
  expect((await act(a.id, 'leave_puzzle', { gameId: game.id })).result.success).toBe(false);
});

test('offspring inherit stable connection identity after renaming the roster', async () => {
  const parent = await createAgent({ id: 'parent', name: 'old name', connectionId: 'profile', llmType: 'baseline_rule', balance: 1000, energy: 100 });
  expect((await act(parent.id, 'spawn_offspring', { mutationIntensity: 0 })).result.success).toBe(true);
  const births = await completeGestations(10, 600000);
  expect(births.length).toBe(1);
  const child = (await getAgentById(births[0].agentId!))!;
  expect(child.connectionId).toBe('profile');
  expect(child.llmType).toBe(parent.llmType);
  expect(child.color).toBe(parent.color);
  const factory = createRosterProviderFactory([{ id: 'profile', name: 'renamed', provider: 'baseline_rule', modelId: 'baseline_rule', color: '#000000' }], { getKey: () => undefined });
  expect(factory(child, { sleepWall: async () => {} }).kind).toBe('baseline_rule');
  expect(await completeGestations(20, 1200000)).toEqual([]);
});

test('parent death terminates gestation instead of retrying forever', async () => {
  const parent = await createAgent({ llmType: 'fixture', balance: 1000, energy: 100 });
  await act(parent.id, 'spawn_offspring', {});
  await killAgent(parent.id);
  expect(await completeGestations(1, 60000)).toEqual([]);
  expect([...store.reproductionStates.values()][0].status).toBe('failed');
});

test('missing connections never silently become a baseline', async () => {
  const agent = await createAgent({ llmType: 'fixture' });
  const factory = createRosterProviderFactory([], { getKey: () => undefined });
  expect(() => factory(agent, { sleepWall: async () => {} })).toThrow('No configured connection');
});

test('memory is bounded and stale negative trust decays toward neutral', async () => {
  const a = await createAgent({ llmType: 'fixture' });
  const b = await createAgent({ llmType: 'fixture' });
  for (let tick = 0; tick < 120; tick++) await storeMemory({ agentId: a.id, type: 'action', content: 'fixture', tick });
  expect(store.memories.size).toBe(100);
  await updateRelationshipTrust(a.id, b.id, -50, 0);
  const before = [...store.relationships.values()][0].trustScore;
  await decayStaleRelationships(10000);
  expect([...store.relationships.values()][0].trustScore).toBeGreaterThan(before);
});

test('death is materialized and emitted once, including outside heartbeat', async () => {
  const { materializeVitals } = await import('../../engine/vitals');
  const { runHousekeeping } = await import('../../engine/heartbeat');
  const agent = await createAgent({ llmType: 'fixture', health: 0.1, hunger: 0, energy: 0 });
  await materializeVitals(agent.id, 60000);
  await materializeVitals(agent.id, 120000);
  await runHousekeeping(180000, 60000);
  expect((await getAgentById(agent.id))?.state).toBe('dead');
  expect(store.events.filter((e) => e.agentId === agent.id && e.eventType === 'agent_died').length).toBe(1);
});

test('active heartbeat discovers nearby agents and prunes dead-owner memory', async () => {
  const { runHousekeeping } = await import('../../engine/heartbeat');
  const a = await createAgent({ id: 'a', llmType: 'fixture', x: 0, y: 0 });
  const b = await createAgent({ id: 'b', llmType: 'fixture', x: 1, y: 0 });
  await runHousekeeping(60000, 1000);
  expect([...store.agentKnowledge.values()].some((k) => k.agentId === a.id && k.knownAgentId === b.id)).toBe(true);
  await storeMemory({ agentId: b.id, type: 'action', content: 'test', tick: 1 });
  await killAgent(b.id);
  await runHousekeeping(120000, 1000);
  expect([...store.memories.values()].some((m) => m.agentId === b.id)).toBe(false);
});

test('leaving, rejoining and leaving again retains one participant and settles each stake once', async () => {
  const { a, game } = await puzzle();
  const firstId = [...store.puzzleParticipants.values()].find(p => p.agentId === a.id)!.id;
  const totalMoney = () => [...store.agents.values()].reduce((sum, agent) => sum + agent.balance, 0) + store.puzzleGames.get(game.id)!.prizePool;
  const conserved = totalMoney();
  expect((await act(a.id, 'leave_puzzle', { gameId: game.id })).result.success).toBe(true);
  expect((await act(a.id, 'join_puzzle', { gameId: game.id })).result.success).toBe(true);
  expect([...store.puzzleParticipants.values()].filter(p => p.agentId === a.id)).toHaveLength(1);
  expect(store.puzzleParticipants.get(firstId)?.status).toBe('active');
  expect((await act(a.id, 'leave_puzzle', { gameId: game.id })).result.success).toBe(true);
  expect(totalMoney()).toBe(conserved);
  expect((await act(a.id, 'leave_puzzle', { gameId: game.id })).result.success).toBe(false);
  expect(totalMoney()).toBe(conserved);
});
