import { beforeEach, expect, test } from 'bun:test';
import { createIntent, getRegisteredActionTypes } from '../../actions';
import type { ActionType, ActionParams } from '../../actions/types';
import { ActionExecutor } from '../../engine/executor';
import { resetStore, store } from '../../engine-memory/store';
import { createAgent, killAgent, updateAgent } from '../../engine-memory/queries/agents';
import { createResourceSpawn, createShelter } from '../../engine-memory/queries/world';
import { addToInventory } from '../../engine-memory/queries/inventory';
import { createJobOffer, createEmployment } from '../../engine-memory/queries/employment';
import { recordDirectDiscovery } from '../../engine-memory/queries/knowledge';
import { updateRelationshipTrust } from '../../engine-memory/queries/memories';
import { createCredential } from '../../engine-memory/queries/credentials';
import { createPuzzleGame, createPuzzleTeam, createPuzzleFragments, addPuzzleParticipant } from '../../engine-memory/queries/puzzles';
import { initializeRNG } from '../../utils/random';
import { getRuntimeConfig, resetRuntimeConfig, setRuntimeConfig } from '../../config';
import { serializeWorld, validateWorldSnapshotV1 } from '../../engine/persistence';
import { getAgentBusyUntil } from '../../engine/agent-meta';
import type { Agent } from '../../db/schema';
import { materializeVitals } from '../../engine/vitals';

type Fixture = { params: ActionParams; missing?: string; prepare?: () => Promise<void>; free?: string };
let executor: ActionExecutor;
const offer = (employerId: string, status = 'open') => createJobOffer({ id: 'offer', employerId, salary: 40, duration: 1,
  paymentType: 'on_completion', escrowAmount: status === 'open' ? 20 : 0, status, x: 0, y: 0, createdAtTick: 0 });
async function employment(workerId: string, completed = true) {
  const employerId = workerId === 'a' ? 'b' : 'a';
  await offer(employerId, 'accepted');
  await createEmployment({ id: 'employment', jobOfferId: 'offer', employerId, workerId, salary: 40,
    paymentType: 'on_completion', escrowAmount: 20, ticksRequired: 1, ticksWorked: completed ? 1 : 0, startedAtTick: 0, endedAtTick: completed ? 0 : null });
}
async function participate(agentId = 'a', teamId: string | null = null) {
  await addPuzzleParticipant({ id: `participant-${agentId}`, gameId: 'game', agentId, teamId, stakedAmount: 5, joinedAtTick: 0 });
}
const fixtures = {
  move: { params: { toX: 1, toY: 0 } },
  buy: { params: { itemType: 'food', quantity: 1, locationId: 'shelter' }, missing: 'locationId' },
  consume: { params: { itemType: 'food', quantity: 1 } },
  sleep: { params: { duration: 1 }, free: 'Rest restores energy without requiring inventory or money.' },
  work: { params: {}, prepare: () => employment('a', false) },
  gather: { params: { resourceType: 'food', quantity: 1 } },
  forage: { params: {}, prepare: async () => { initializeRNG('1'); } },
  public_work: { params: { taskType: 'road_maintenance' } },
  trade: { params: { targetAgentId: 'b', offeringItemType: 'food', offeringQuantity: 1, requestingItemType: 'material', requestingQuantity: 1 }, missing: 'targetAgentId' },
  claim: { params: { claimType: 'territory', x: 0, y: 0 }, free: 'A territorial claim has no inventory or monetary prerequisite.' },
  name_location: { params: { name: 'Market', x: 0, y: 0 }, free: 'Naming has no inventory or monetary prerequisite.' },
  harm: { params: { targetAgentId: 'b', intensity: 'light' }, missing: 'targetAgentId', prepare: async () => { initializeRNG('1'); } },
  steal: { params: { targetAgentId: 'b', targetItemType: 'material', quantity: 1 }, missing: 'targetAgentId', prepare: async () => { initializeRNG('1'); } },
  deceive: { params: { targetAgentId: 'b', claim: 'A resource nearby', claimType: 'resource_location' }, missing: 'targetAgentId' },
  share_info: { params: { targetAgentId: 'b', subjectAgentId: 'c', infoType: 'location', position: { x: 0, y: 0 } }, missing: 'targetAgentId' },
  signal: { params: { message: 'hello', intensity: 1 } },
  speak: { params: { message: 'Is there water near here?', to: 'b' }, missing: 'to', free: 'Speaking needs no inventory, energy or money.' },
  give: { params: { targetAgentId: 'b', itemType: 'food', quantity: 2 }, missing: 'targetAgentId' },
  issue_credential: { params: { subjectAgentId: 'b', claimType: 'skill', description: 'A demonstrated skill' }, missing: 'subjectAgentId' },
  revoke_credential: { params: { credentialId: 'credential' }, missing: 'credentialId', prepare: async () => { await createCredential({ id: 'credential', tick: 0, issuerId: 'a', issuerSignature: 'fixture', subjectId: 'b', claimType: 'skill', claimDescription: 'fixture' }); }, free: 'Revocation needs the issuing identity, not inventory or money.' },
  spread_gossip: { params: { targetAgentId: 'b', subjectAgentId: 'c', topic: 'skill', claim: 'Useful skill', sentiment: 1 }, missing: 'targetAgentId' },
  spawn_offspring: { params: { partnerId: 'b', mutationIntensity: 0 }, missing: 'partnerId', prepare: async () => { await updateRelationshipTrust('b', 'a', 100, 0); } },
  offer_job: { params: { salary: 40, duration: 1, paymentType: 'on_completion', escrowPercent: 50 } },
  accept_job: { params: { jobOfferId: 'offer' }, missing: 'jobOfferId', prepare: async () => { await offer('b'); }, free: 'Accepting work requires an open offer, not worker funds.' },
  pay_worker: { params: { employmentId: 'employment' }, missing: 'employmentId', prepare: () => employment('b') },
  claim_escrow: { params: { employmentId: 'employment' }, missing: 'employmentId', prepare: () => employment('a'), free: 'Claiming already-earned escrow requires no claimant funds.' },
  quit_job: { params: { employmentId: 'employment' }, missing: 'employmentId', prepare: () => employment('a', false), free: 'Leaving work requires no inventory or money.' },
  fire_worker: { params: { employmentId: 'employment' }, missing: 'employmentId', prepare: () => employment('b', false), free: 'Firing settles existing escrow without a new payment prerequisite.' },
  cancel_job_offer: { params: { jobOfferId: 'offer' }, missing: 'jobOfferId', prepare: async () => { await offer('a'); }, free: 'Cancelling returns an existing deposit.' },
  join_puzzle: { params: { gameId: 'game' }, missing: 'gameId' },
  leave_puzzle: { params: { gameId: 'game' }, missing: 'gameId', prepare: () => participate() },
  share_fragment: { params: { fragmentId: 'fragment', targetAgentId: 'b' }, missing: 'fragmentId', prepare: async () => { await participate(); await participate('b'); } },
  form_team: { params: { gameId: 'game', teamName: 'Group' }, missing: 'gameId', prepare: () => participate() },
  join_team: { params: { teamId: 'team' }, missing: 'teamId', prepare: async () => { await participate(); await participate('b', 'team'); await createPuzzleTeam({ id: 'team', gameId: 'game', leaderId: 'b', totalStake: 5, createdAtTick: 0 }); }, free: 'Joining uses the already-staked participant balance.' },
  submit_solution: { params: { gameId: 'game', solution: 'answer' }, missing: 'gameId', prepare: () => participate() },
} satisfies Record<ActionType, Fixture>;
const matrix = getRegisteredActionTypes().map(type => ({ type, ...fixtures[type] })) as Array<Fixture & { type: ActionType }>;
const capture = () => serializeWorld({ worldSeed: 'matrix', savedAtSimTimeMs: 20 * 60000, speed: 1 });
const actor = () => store.agents.get('a')!;
type Oracle = {
  events: string[];
  delta?: Partial<Pick<Agent, 'energy' | 'hunger' | 'balance' | 'health'>>;
  effects(): void;
};
// Independent fixture outcomes: checking only `success` and snapshot validity
// misses handlers that return success without performing their advertised work.
// Enumerating the registry here makes a new action require an effects/cost oracle.
const outcomes = {
  move: { events: ['agent_moved'], delta: { energy: -1, hunger: -0.2 }, effects() {
    expect(actor()).toMatchObject({ x: 1, y: 0, state: 'walking' });
    expect(store.scents.get('0:0')).toMatchObject({ agentId: 'a', tick: 20 });
  } },
  buy: { events: ['agent_bought', 'balance_changed'], delta: { energy: -3, balance: -10 }, effects() {
    expect(store.inventory.get('a:food')!.quantity).toBe(11);
  } },
  consume: { events: ['agent_consumed'], delta: { hunger: 20 }, effects() {
    expect(store.inventory.get('a:food')!.quantity).toBe(9);
  } },
  sleep: { events: ['agent_sleeping'], effects() {
    expect(actor().state).toBe('sleeping');
    expect(getAgentBusyUntil('a')).toBe(21 * 60000);
  } },
  work: { events: ['agent_worked', 'employment_work_completed'], delta: { energy: -2, hunger: -0.5 }, effects() {
    expect(store.employments.get('employment')).toMatchObject({ ticksWorked: 1, amountPaid: 0, escrowAmount: 20, status: 'active' });
  } },
  gather: { events: ['agent_gathered'], delta: { energy: -1, hunger: -0.3 }, effects() {
    expect(store.resourceSpawns.get('resource')!.currentAmount).toBe(99);
    expect(store.inventory.get('a:food')!.quantity).toBe(11);
  } },
  forage: { events: ['agent_forage'], delta: { energy: -3 }, effects() {
    expect(store.inventory.get('a:food')!.quantity).toBe(11);
    expect(store.forageCooldowns.size).toBe(1);
  } },
  public_work: { events: ['agent_public_work'], delta: { energy: -1 }, effects() {
    expect(store.publicWorkSessions.get('a')).toMatchObject({ ticksWorked: 1, taskType: 'road_maintenance' });
  } },
  trade: { events: ['agent_traded', 'agent_received_trade'], effects() {
    expect(store.inventory.get('a:food')!.quantity).toBe(9);
    expect(store.inventory.get('a:material')!.quantity).toBe(1);
    expect(store.inventory.get('b:food')!.quantity).toBe(1);
    expect(store.inventory.get('b:material')!.quantity).toBe(9);
  } },
  claim: { events: ['location_claimed'], effects() {
    expect([...store.agentClaims.values()]).toEqual([expect.objectContaining({ agentId: 'a', x: 0, y: 0, claimType: 'territory' })]);
  } },
  name_location: { events: ['location_named', 'name_consensus_changed'], effects() {
    expect([...store.locationNames.values()]).toEqual([expect.objectContaining({ name: 'Market', x: 0, y: 0 })]);
  } },
  harm: { events: ['agent_harmed'], delta: { energy: -5, hunger: -2 }, effects() {
    expect(store.agents.get('b')!.health).toBe(90);
    expect(store.relationships.get('b:a')!.trustScore).toBe(-30);
  } },
  steal: { events: ['agent_stole'], delta: { energy: -8, hunger: -2 }, effects() {
    expect(store.inventory.get('a:material')!.quantity).toBe(1);
    expect(store.inventory.get('b:material')!.quantity).toBe(9);
  } },
  deceive: { events: ['agent_deceived'], delta: { energy: -2 }, effects() {
    expect([...store.memories.values()].some(m => m.agentId === 'b' && m.content.includes('A resource nearby'))).toBe(true);
  } },
  share_info: { events: ['agent_shared_info'], delta: { energy: -1 }, effects() {
    expect([...store.agentKnowledge.values()]).toContainEqual(expect.objectContaining({ agentId: 'b', knownAgentId: 'c', discoveryType: 'referral', referredById: 'a' }));
  } },
  give: { events: ['agent_gave', 'agent_received'], delta: {}, effects() {
    expect(store.inventory.get('a:food')!.quantity).toBe(8);
    expect(store.inventory.get('b:food')!.quantity).toBe(2);
  } },
  speak: { events: ['agent_spoke', 'agent_heard', 'agent_heard'], delta: {}, effects() {
    const heard = store.events.filter(e => e.eventType === 'agent_heard');
    expect(heard.map(e => e.agentId).sort()).toEqual(['b', 'c']);
    expect(heard.find(e => e.agentId === 'b')!.payload).toMatchObject({ speakerId: 'a', message: 'Is there water near here?', addressedToListener: true });
    expect(heard.find(e => e.agentId === 'c')!.payload).toMatchObject({ addressedToListener: false });
  } },
  signal: { events: ['agent_signaled'], delta: { energy: -5 }, effects() {
    expect(store.events.at(-1)!.payload).toMatchObject({ message: 'hello', intensity: 1, range: 10 });
  } },
  issue_credential: { events: ['credential_issued'], delta: { energy: -2 }, effects() {
    expect([...store.agentCredentials.values()]).toEqual([expect.objectContaining({ issuerId: 'a', subjectId: 'b', claimType: 'skill', revoked: false })]);
  } },
  revoke_credential: { events: ['credential_revoked'], effects() {
    expect(store.agentCredentials.get('credential')).toMatchObject({ revoked: true, revokedAtTick: 20 });
  } },
  spread_gossip: { events: ['gossip_spread'], delta: { energy: -1 }, effects() {
    expect(store.gossipEvents).toEqual([expect.objectContaining({ sourceAgentId: 'a', targetAgentId: 'b', subjectAgentId: 'c', claim: 'Useful skill', sentiment: 1 })]);
  } },
  spawn_offspring: { events: ['reproduction_started'], delta: { energy: -30, balance: -200 }, effects() {
    expect(actor().state).toBe('gestating');
    expect(store.agents.size).toBe(3); // Birth must wait for gestation.
    expect([...store.reproductionStates.values()]).toEqual([expect.objectContaining({ parentAgentId: 'a', partnerAgentId: 'b', status: 'gestating', mutationIntensity: 0, gestationStartTick: 20 })]);
  } },
  offer_job: { events: ['job_offered'], delta: { balance: -20 }, effects() {
    expect([...store.jobOffers.values()]).toEqual([expect.objectContaining({ employerId: 'a', salary: 40, escrowAmount: 20, status: 'open' })]);
  } },
  accept_job: { events: ['job_accepted'], effects() {
    expect(store.jobOffers.get('offer')!.status).toBe('accepted');
    expect([...store.employments.values()]).toEqual([expect.objectContaining({ employerId: 'b', workerId: 'a', escrowAmount: 20, amountPaid: 0, status: 'active' })]);
  } },
  pay_worker: { events: ['worker_paid', 'balance_changed', 'employment_completed'], delta: { balance: -20 }, effects() {
    expect(store.agents.get('b')!.balance).toBe(1040);
    expect(store.employments.get('employment')).toMatchObject({ amountPaid: 40, escrowAmount: 0, status: 'completed' });
  } },
  claim_escrow: { events: ['escrow_claimed', 'balance_changed', 'employer_defaulted'], delta: { balance: 20 }, effects() {
    expect(store.employments.get('employment')).toMatchObject({ amountPaid: 20, escrowAmount: 0, status: 'unpaid' });
  } },
  quit_job: { events: ['worker_quit'], effects() {
    expect(store.agents.get('b')!.balance).toBe(1020);
    expect(store.employments.get('employment')).toMatchObject({ status: 'abandoned', escrowAmount: 0 });
  } },
  fire_worker: { events: ['worker_fired'], delta: { balance: 20 }, effects() {
    expect(store.agents.get('b')!.balance).toBe(1000);
    expect(store.employments.get('employment')).toMatchObject({ status: 'fired', escrowAmount: 0, amountPaid: 0 });
  } },
  cancel_job_offer: { events: ['job_offer_cancelled', 'balance_changed'], delta: { balance: 20 }, effects() {
    expect(store.jobOffers.get('offer')!.status).toBe('cancelled');
  } },
  join_puzzle: { events: ['puzzle_joined'], delta: { balance: -5 }, effects() {
    expect([...store.puzzleParticipants.values()]).toEqual([expect.objectContaining({ agentId: 'a', gameId: 'game', stakedAmount: 5, status: 'active' })]);
    expect(store.puzzleGames.get('game')!.prizePool).toBe(55);
  } },
  leave_puzzle: { events: ['puzzle_left'], delta: { energy: -5, balance: 2.5 }, effects() {
    expect(store.puzzleParticipants.get('participant-a')!.status).toBe('left');
    expect(store.puzzleFragments.get('fragment')!.ownerId).toBeNull();
    expect(store.puzzleGames.get('game')!.prizePool).toBe(47.5);
  } },
  share_fragment: { events: ['fragment_shared'], delta: { energy: -1 }, effects() {
    expect(store.puzzleFragments.get('fragment')).toMatchObject({ ownerId: 'a', sharedWith: ['b'] });
    expect(store.puzzleParticipants.get('participant-a')!.fragmentsShared).toBe(1);
  } },
  form_team: { events: ['team_formed'], delta: { energy: -2 }, effects() {
    const team = [...store.puzzleTeams.values()][0];
    expect(team).toMatchObject({ gameId: 'game', leaderId: 'a', name: 'Group' });
    expect(store.puzzleParticipants.get('participant-a')!.teamId).toBe(team.id);
  } },
  join_team: { events: ['team_joined'], effects() {
    expect(store.puzzleParticipants.get('participant-a')!.teamId).toBe('team');
    expect(store.puzzleTeams.get('team')!.totalStake).toBe(10);
  } },
  submit_solution: { events: ['puzzle_solved'], delta: { energy: -3, balance: 45 }, effects() {
    expect(store.puzzleGames.get('game')).toMatchObject({ status: 'completed', winnerId: 'a', prizeDistribution: [
      { agentId: 'a', amount: 30, type: 'solo_winner' },
      { agentId: 'a', amount: 15, type: 'contributor' },
    ] });
    expect([...store.puzzleAttempts.values()]).toEqual([expect.objectContaining({ submitterId: 'a', attemptedSolution: 'answer', isCorrect: true })]);
  } },
} satisfies Record<ActionType, Oracle>;

function expectCosts(before: Agent, delta: Oracle['delta'] = {}) {
  for (const field of ['energy', 'hunger', 'balance', 'health'] as const) {
    expect(actor()[field], `${field} cost`).toBeCloseTo(before[field] + (delta[field] ?? 0), 8);
  }
}
function economicState() {
  return { agents: [...store.agents.values()].map(a => ({ id: a.id, x: a.x, y: a.y, balance: a.balance, health: a.health, energy: a.energy, hunger: a.hunger })),
    inventory: [...store.inventory], resources: [...store.resourceSpawns.values()].map(r => [r.id, r.currentAmount]) };
}
beforeEach(async () => {
  resetStore(); resetRuntimeConfig(); initializeRNG('matrix');
  setRuntimeConfig({ needs: { hungerDecay: 0, energyDecay: 0 }, cooperation: { enabled: false }, puzzle: { enabled: true }, actions: { spawnOffspring: { enabled: true } } });
  executor = new ActionExecutor({ nowMs: () => 20 * 60000 });
  await createAgent({ id: 'a', llmType: 'fixture', balance: 1000, energy: 100, hunger: 80, x: 0, y: 0 });
  await createAgent({ id: 'b', llmType: 'fixture', balance: 1000, energy: 100, x: 0, y: 0 });
  await createAgent({ id: 'c', llmType: 'fixture', x: 0, y: 0 });
  await recordDirectDiscovery('a', 'c', { x: 0, y: 0 }, 0);
  await createShelter({ id: 'shelter', x: 0, y: 0 });
  await createResourceSpawn({ id: 'resource', x: 0, y: 0, biome: 'forest', resourceType: 'food', maxAmount: 100, currentAmount: 100 });
  await addToInventory('a', 'food', 10); await addToInventory('b', 'material', 10);
  await createPuzzleGame({ id: 'game', gameType: 'password', solution: 'answer', fragmentCount: 1, entryStake: 5, prizePool: 50, createdAtTick: 0, endsAtTick: 100 });
  await createPuzzleFragments([{ id: 'fragment', gameId: 'game', fragmentIndex: 0, content: 'answer', ownerId: 'a', originalOwnerId: 'a' }]);
});
test('matrix covers the complete runtime registry', () => {
  expect(Object.keys(fixtures).sort()).toEqual(getRegisteredActionTypes().sort());
  expect(Object.keys(outcomes).sort()).toEqual(getRegisteredActionTypes().sort());
});
for (const fixture of matrix) {
  const { type, params, prepare, missing, free } = fixture;
  test(`${type}: valid success, costs, events and persisted invariants`, async () => {
    await prepare?.();
    const before = { ...actor() };
    const result = await executor.submit(createIntent('a', type, params, 20));
    expect(result.result.success, result.result.error).toBe(true);
    expect(result.events.some(e => e.type === `agent_${type}`)).toBe(true);
    expect(result.events.every(e => e.tick === 20)).toBe(true);
    expect(store.metrics.totalActions).toBe(1);
    expect(store.metrics.failedActions).toBe(0);
    expect(() => validateWorldSnapshotV1(capture())).not.toThrow();
    const outcome: Oracle = outcomes[type];
    expect(result.events.map(e => e.type)).toEqual([`agent_${type}`, ...outcome.events]);
    expectCosts(before, outcome.delta);
    outcome.effects();
  });
  test(`${type}: malformed input preserves resources and emits exactly one failed attempt`, async () => {
    await prepare?.(); const before = economicState();
    const result = await executor.submit(createIntent('a', type, { unexpected: true } as never, 20));
    expect(result.result.success).toBe(false);
    expect(economicState()).toEqual(before);
    expect(result.events.map(e => e.type)).toEqual(['action_failed']);
    expect(store.metrics.failedActions).toBe(1);
    expect(getAgentBusyUntil('a')).toBe(20 * 60000 + getRuntimeConfig().durations.failedActionPenaltyMs);
  });
  test(`${type}: dead actor cannot mutate resources`, async () => {
    await prepare?.(); await killAgent('a'); const before = economicState();
    const result = await executor.submit(createIntent('a', type, params, 20));
    expect(result.result.success).toBe(false); expect(result.dropped).toBe(true);
    expect(economicState()).toEqual(before);
    expect(result.events.map(e => e.type)).toEqual(['action_failed']);
    expect(result.events[0].payload).toMatchObject({ action: type, reason: 'agent_dead' });
    expect(getAgentBusyUntil('a')).toBe(0);
    expect(() => validateWorldSnapshotV1(capture())).not.toThrow();
  });
  test(`${type}: cancellation while queued has no effects, costs or events`, async () => {
    await prepare?.(); const before = capture();
    let release!: () => void;
    const blocker = executor.mutate(() => new Promise<void>(resolve => { release = resolve; }));
    await Promise.resolve();
    const controller = new AbortController();
    const result = executor.submit(createIntent('a', type, params, 20), undefined, controller.signal);
    controller.abort(); release(); await blocker;
    await expect(result).rejects.toThrow('cancelled');
    expect(capture()).toEqual(before);
  });
  if (missing) test(`${type}: missing reference cannot change economy or inventory`, async () => {
    await prepare?.(); const before = economicState();
    const result = await executor.submit(createIntent('a', type, { ...params, [missing]: 'missing' }, 20));
    expect(result.result.success).toBe(false); expect(economicState()).toEqual(before);
    expect(result.events.map(e => e.type)).toEqual(['action_failed']);
    expect(() => validateWorldSnapshotV1(capture())).not.toThrow();
  });
  test(`${type}: depleted resources ${free ? 'have no additional funding requirement' : 'reject the attempt safely'}`, async () => {
    await prepare?.(); await updateAgent('a', { energy: 0, balance: 0 }); store.inventory.clear();
    // Account for elapsed exhaustion before measuring the action's own cost.
    // The executor still materializes vitals again at exactly this same time.
    await materializeVitals('a', 20 * 60000);
    const before = { ...actor() };
    const result = await executor.submit(createIntent('a', type, params, 20));
    expect(result.result.success).toBe(!!free);
    expect(() => validateWorldSnapshotV1(capture())).not.toThrow();
    expect([...store.agents.values()].every(a => a.balance >= 0 && a.energy >= 0 && a.health >= 0)).toBe(true);
    if (free) {
      const outcome: Oracle = outcomes[type];
      expectCosts(before, outcome.delta);
      expect(result.events.map(e => e.type)).toEqual([`agent_${type}`, ...outcome.events]);
      outcome.effects();
    } else {
      expectCosts(before);
      expect(result.events.map(e => e.type)).toEqual(['action_failed']);
      expect(store.metrics.failedActions).toBe(1);
    }
  });
}

for (const scenario of [
  { type: 'buy', seed: '5', success: false, delta: { energy: -3 }, events: ['action_failed'] },
  { type: 'harm', seed: '3', success: false, delta: { energy: -5, hunger: -2 }, events: ['agent_harm_failed', 'action_failed'] },
  { type: 'steal', seed: '3', success: false, delta: { energy: -8, hunger: -2 }, events: ['agent_steal_failed', 'action_failed'] },
  // An unsuccessful search/answer is a completed world action, not a rejected
  // model decision. Neither may mint a reward or erase its energy cost.
  { type: 'forage', seed: '3', success: true, delta: { energy: -3 }, events: ['agent_forage', 'agent_forage'] },
  { type: 'submit_solution', seed: '3', success: true, delta: { energy: -3 }, events: ['agent_submit_solution', 'solution_submitted'] },
] satisfies Array<{ type: ActionType; seed: string; success: boolean; delta: Oracle['delta']; events: string[] }>) {
  test(`${scenario.type}: unfavorable outcome retains declared costs without a reward`, async () => {
    const fixture = fixtures[scenario.type] as Fixture;
    await fixture.prepare?.();
    initializeRNG(scenario.seed);
    const before = { ...actor() };
    const inventoryBefore = structuredClone([...store.inventory]);
    const targetBefore = { ...store.agents.get('b')! };
    const params = scenario.type === 'submit_solution' ? { gameId: 'game', solution: 'wrong' } : fixture.params;
    const result = await executor.submit(createIntent('a', scenario.type, params, 20));
    expect(result.result.success).toBe(scenario.success);
    expectCosts(before, scenario.delta);
    expect([...store.inventory]).toEqual(inventoryBefore);
    expect(store.agents.get('b')).toEqual(targetBefore);
    expect(result.events.map(e => e.type)).toEqual(scenario.events);
    expect(store.metrics.totalActions).toBe(1);
    expect(store.metrics.failedActions).toBe(scenario.success ? 0 : 1);
    if (scenario.type === 'submit_solution') {
      expect([...store.puzzleAttempts.values()]).toEqual([expect.objectContaining({ submitterId: 'a', isCorrect: false })]);
      expect(store.puzzleGames.get('game')).toMatchObject({ status: 'open', winnerId: null, prizePool: 50 });
    }
    expect(() => validateWorldSnapshotV1(capture())).not.toThrow();
  });
}

for (const type of ['accept_job', 'pay_worker', 'claim_escrow', 'quit_job', 'fire_worker', 'cancel_job_offer', 'leave_puzzle', 'submit_solution'] as const) {
  test(`${type}: repeating a settlement cannot refund, pay or award twice`, async () => {
    const fixture = fixtures[type] as Fixture;
    await fixture.prepare?.();
    expect((await executor.submit(createIntent('a', type, fixture.params, 20))).result.success).toBe(true);
    const domain = () => {
      const snapshot = capture().store;
      return {
        ...Object.fromEntries(Object.entries(snapshot)
          .filter(([key]) => !['events', 'nextEventId', 'nextEventVersion'].includes(key))),
        // The executor materializes the actor's vitals on every attempt,
        // refreshing this wall-clock audit timestamp even at the same sim time.
        // Contract/ledger timestamps and every other actor field stay checked.
        agents: snapshot.agents.map(agent => Object.fromEntries(Object.entries(agent)
          .filter(([key]) => agent.id !== 'a' || key !== 'updatedAt'))),
      };
    };
    const settled = domain();
    const result = await executor.submit(createIntent('a', type, fixture.params, 20));
    expect(result.result.success).toBe(false);
    expect(domain()).toEqual(settled);
    expect(result.events.map(e => e.type)).toEqual(['action_failed']);
    expect(store.metrics.totalActions).toBe(2);
    expect(store.metrics.failedActions).toBe(1);
    expect(() => validateWorldSnapshotV1(capture())).not.toThrow();
  });
}
