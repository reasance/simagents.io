import { z } from 'zod';
import { CONFIG } from '../config';
import type { WorldSnapshotV1, JsonObject } from './persistence';

const id = z.string().min(1).max(256);
const text = z.string();
const amount = z.number().finite().nonnegative();
const count = amount.int().safe();
const positiveCount = count.min(1);
const signed = z.number().finite();
const date = z.string().refine(value => Number.isFinite(Date.parse(value)), 'Invalid date');
const nullableId = id.nullable();
const nullableText = text.nullable();
const nullableTick = count.nullable();
const nullableDate = date.nullable();
const jsonObject = z.record(z.string(), z.unknown());
const tenant = { tenantId: nullableText };
const identity = { id, ...tenant };
const timestamps = { createdAt: date, updatedAt: date };
const position = { x: count, y: count };
const needs = amount.max(100);
const payment = z.enum(['upfront', 'on_completion', 'per_tick']);
const row = (shape: z.ZodRawShape) => z.object(shape).passthrough();

// Each persisted entity has an explicit schema. Payload/content fields remain JSON.
export const snapshotEntitySchemas = {
  agents: row({ ...identity, ...timestamps, ...position, llmType: id, name: nullableText.optional(),
    connectionId: id.optional(), rosterEntryId: id.optional(), hunger: needs, energy: needs, health: needs,
    balance: amount, state: z.enum(['idle', 'walking', 'working', 'sleeping', 'dead', 'gestating']),
    color: z.string().regex(/^#[0-9a-f]{6}$/i), personality: nullableText, diedAt: nullableDate, privateNotes: z.string().max(4000).optional() }),
  resourceSpawns: row({ ...identity, ...position, biome: id, resourceType: id, maxAmount: amount,
    currentAmount: amount, regenRate: amount, discovered: z.boolean(), createdAt: nullableDate }),
  shelters: row({ ...identity, ...position, canSleep: z.boolean(), ownerAgentId: nullableId, createdAt: nullableDate }),
  events: row({ id: positiveCount, ...tenant, tick: count, agentId: nullableId, eventType: id,
    payload: jsonObject, category: z.enum(['infrastructure', 'emergent', 'puzzle', 'observation']),
    version: positiveCount, createdAt: date }),
  memories: row({ ...identity, agentId: id, type: id, content: text, importance: amount,
    emotionalValence: signed, involvedAgentIds: z.array(id), x: count.nullable(), y: count.nullable(), tick: count, createdAt: date }),
  relationships: row({ ...identity, ...timestamps, agentId: id, otherAgentId: id,
    trustScore: signed.min(-100).max(100), interactionCount: count, lastInteractionTick: nullableTick, notes: nullableText }),
  ledgerEntries: row({ ...identity, txId: id, tick: count, fromAgentId: nullableId, toAgentId: nullableId,
    amount: signed, category: id, description: nullableText, createdAt: date }),
  jobOffers: row({ ...identity, ...timestamps, ...position, employerId: id, salary: amount,
    duration: positiveCount, paymentType: payment, escrowAmount: amount, description: nullableText,
    status: z.enum(['open', 'accepted', 'cancelled', 'expired']), createdAtTick: count, expiresAtTick: nullableTick }),
  employments: row({ ...identity, ...timestamps, jobOfferId: id, employerId: id, workerId: id,
    salary: amount, paymentType: payment, escrowAmount: amount, ticksRequired: positiveCount,
    ticksWorked: count, amountPaid: amount, status: z.enum(['active', 'completed', 'abandoned', 'unpaid', 'fired']),
    startedAtTick: count, endedAtTick: nullableTick }),
  reproductionStates: row({ ...identity, parentAgentId: id, partnerAgentId: nullableId,
    gestationStartTick: count, gestationDurationTicks: positiveCount, offspringAgentId: nullableId,
    status: z.enum(['gestating', 'completed', 'failed']), failureReason: nullableText, createdAt: date,
    completedAt: nullableDate, mutationIntensity: amount.max(1).optional() }),
  agentLineages: row({ ...identity, agentId: id, generation: count, parentIds: z.array(id),
    spawnedAtTick: count, spawnedByParentId: nullableId, systemPromptBase: nullableText,
    mutations: z.array(z.unknown()), initialBalance: amount.nullable(), initialEnergy: needs.nullable(),
    initialSpawnX: count.nullable(), initialSpawnY: count.nullable(), inheritedRelationships: z.array(z.unknown()), createdAt: date }),
  gossipEvents: row({ id: positiveCount, ...tenant, tick: count, sourceAgentId: id, targetAgentId: id,
    subjectAgentId: id, topic: id, claim: text, sentiment: signed.min(-100).max(100), evidenceEventId: nullableTick, createdAt: date }),
  agentCredentials: row({ ...identity, ...timestamps, tick: count, issuerId: id, issuerSignature: text,
    subjectId: id, claimType: id, claimDescription: text, claimEvidence: nullableText,
    claimLevel: count.nullable(), expiresAtTick: nullableTick, revoked: z.boolean(), revokedAtTick: nullableTick }),
  informationBeliefs: row({ ...identity, agentId: id, infoHash: text, claimType: id, claimContent: jsonObject,
    isTrue: z.boolean().nullable(), sourceAgentId: nullableId, receivedTick: count,
    actedOnTick: nullableTick, correctedTick: nullableTick, correctionSourceId: nullableId, spreadCount: count, createdAt: date }),
  agentRoles: row({ ...identity, agentId: id, role: id, confidence: amount.max(1), detectedAtTick: count, updatedAt: date }),
  retaliationChains: row({ ...identity, chainId: id, attackerId: id, victimId: id, actionType: id, depth: count, tick: count, createdAt: date }),
  agentClaims: row({ ...identity, ...timestamps, ...position, agentId: id, claimType: id,
    description: nullableText, strength: amount, claimedAtTick: count, lastReinforcedTick: nullableTick }),
  agentKnowledge: row({ ...identity, ...timestamps, agentId: id, knownAgentId: id, discoveryType: id,
    referredById: nullableId, referralDepth: count, sharedInfo: z.unknown(), informationAge: amount }),
  locationNames: row({ ...identity, ...timestamps, ...position, name: text, namedByAgentId: id, usageCount: count, namedAtTick: count }),
  puzzleGames: row({ ...identity, gameType: id, status: z.enum(['open', 'active', 'completed', 'expired']),
    solution: text, solutionHash: nullableText, prizePool: amount, entryStake: amount,
    maxParticipants: positiveCount, minParticipants: positiveCount, fragmentCount: count,
    createdAtTick: count, startsAtTick: nullableTick, endsAtTick: nullableTick, winnerId: nullableId, createdAt: nullableDate,
    prizeDistribution: z.array(z.object({ agentId: id, amount, type: id })).optional() }),
  puzzleTeams: row({ id, gameId: id, leaderId: id, name: nullableText, totalStake: amount,
    status: z.enum(['forming', 'active', 'won', 'lost', 'expired']), createdAtTick: count, createdAt: nullableDate }),
  puzzleFragments: row({ id, gameId: id, fragmentIndex: count, content: text, hint: nullableText,
    ownerId: nullableId, originalOwnerId: nullableId, sharedWith: z.array(id), createdAt: nullableDate }),
  puzzleParticipants: row({ id, gameId: id, agentId: id, teamId: nullableId, stakedAmount: amount,
    contributionScore: amount, fragmentsReceived: count, fragmentsShared: count, attemptsMade: count,
    joinedAtTick: count, status: z.enum(['active', 'left', 'banned', 'expired']), createdAt: nullableDate }),
  puzzleAttempts: row({ id, gameId: id, submitterId: id, teamId: nullableId, attemptedSolution: text,
    isCorrect: z.boolean(), submittedAtTick: count, createdAt: nullableDate }),
} as const;

const inventorySchema = row({ ...identity, agentId: id, itemType: id, quantity: amount, properties: jsonObject.nullable(), createdAt: nullableDate });
const worldSchema = z.object({ id: positiveCount, currentTick: count, startedAt: date, lastTickAt: nullableDate, isPaused: z.boolean() });

const numbers = (names: string[], validator: z.ZodNumber = amount) => Object.fromEntries(names.map(name => [name, validator.optional()]));
const partial = (shape: z.ZodRawShape) => z.object(shape).strict().partial();
const durations = ['defaultMs', 'failedActionPenaltyMs', 'movePerTileMs', 'gatherMs', 'forageMs', 'workMs', 'sleepMs', 'tradeMs', 'buyMs', 'consumeMs', 'shareInfoMs', 'signalMs', 'harmMs', 'stealMs'];
export const runtimeOverridesSchema = partial({
  simulation: partial({ tickIntervalMs: positiveCount }),
  agent: partial({ startingBalance: amount, startingHunger: needs, startingEnergy: needs, startingHealth: needs }),
  needs: partial(numbers(['hungerDecay', 'energyDecay', 'lowHungerThreshold', 'criticalHungerThreshold', 'lowEnergyThreshold', 'criticalEnergyThreshold'], needs)),
  llmCache: partial({ enabled: z.boolean(), ttlSeconds: amount, shareAcrossAgents: z.boolean() }),
  engine: partial({ decisionTimeoutMs: positiveCount, minDecisionIntervalMs: amount, heartbeatIntervalMs: positiveCount }),
  durations: partial(numbers(durations)),
  actions: partial({
    move: partial(numbers(['energyCost', 'hungerCost', 'consecutivePenalty'])),
    gather: partial(numbers(['energyCostPerUnit', 'maxPerAction'])),
    work: partial(numbers(['basePayPerTick', 'energyCostPerTick'])),
    sleep: partial(numbers(['energyRestoredPerTick'])),
    harm: partial({ damage: partial(numbers(['light', 'moderate', 'severe'])) }),
    spawnOffspring: partial({ enabled: z.boolean() }),
  }),
  economy: partial({ currencyDecayRate: amount.max(1), currencyDecayInterval: positiveCount, currencyDecayThreshold: amount }),
  experiment: partial({ enablePersonalities: z.boolean(), normalizeCapabilities: z.boolean(), useSyntheticVocabulary: z.boolean(),
    safetyLevel: z.enum(['standard', 'minimal', 'none']), llmDecisionTemperature: amount.max(2), llmDecisionMaxTokens: positiveCount }),
  cooperation: partial({ enabled: z.boolean(),
    gather: partial(numbers(['efficiencyMultiplierPerAgent', 'maxEfficiencyMultiplier', 'cooperationRadius'])),
    groupGather: partial({ enabled: z.boolean(), ...numbers(['richSpawnThreshold', 'minAgentsForRich', 'soloMaxFromRich', 'groupBonus']) }),
    work: partial(numbers(['nearbyWorkerBonus', 'nearbyWorkerRadius'])),
    forage: partial(numbers(['nearbyAgentBonus', 'maxCooperationBonus', 'cooperationRadius'])),
    buy: partial(numbers(['trustPriceModifier', 'minTrustDiscount', 'maxTrustPenalty'], signed)),
    solo: partial(numbers(['forageSuccessRateModifier', 'publicWorkPaymentModifier', 'gatherEfficiencyModifier', 'aloneRadius'])),
  }),
  biomeExclusivity: partial({ enabled: z.boolean() }),
  seasons: partial({ enabled: z.boolean(), cycleLengthTicks: positiveCount }),
  resourceDepletion: partial({ enabled: z.boolean(), depletionThresholdTicks: positiveCount, degradationRate: amount.max(1) }),
  spoilage: partial({ enabled: z.boolean(), rates: partial(numbers(['food', 'water', 'medicine', 'battery', 'material', 'tool'], amount.max(1))), removalThreshold: amount }),
  puzzle: partial({ enabled: z.boolean(), defaultEntryStake: amount, roundDurationTicks: positiveCount, registrationWindow: count }),
});

/** Validation is read-only and completes before hydrate resets any live state. */
export function validateSnapshotDomain(snapshot: WorldSnapshotV1): void {
  const fail = (message: string): never => { throw new Error(message); };
  const check = (schema: z.ZodTypeAny, value: unknown, label: string) => {
    const result = schema.safeParse(value);
    if (!result.success) fail(`${label}: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  };
  check(worldSchema, snapshot.store.worldState, 'store.worldState');
  if (snapshot.configuration) check(runtimeOverridesSchema, snapshot.configuration.overrides, 'configuration.overrides');
  const agents = new Set(snapshot.store.agents.map(value => value.id as string));
  const games = new Set(snapshot.store.puzzleGames.map(value => value.id as string));
  const teams = new Map(snapshot.store.puzzleTeams.map(value => [value.id as string, value]));
  const offers = new Map(snapshot.store.jobOffers.map(value => [value.id as string, value]));
  const reference = (value: unknown, targets: Set<string> | Map<string, unknown>, label: string) => {
    if (value !== null && value !== undefined && (typeof value !== 'string' || !targets.has(value))) fail(`Unknown reference ${label}`);
  };
  const distinct = (values: unknown[], label: string) => { if (new Set(values).size !== values.length) fail(`Duplicate ${label}`); };
  const bounds = (value: unknown, label: string) => { if (value !== null && value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= CONFIG.simulation.gridSize)) fail(`Out-of-bounds ${label}`); };
  for (const [field, schema] of Object.entries(snapshotEntitySchemas)) {
    const values = snapshot.store[field as keyof typeof snapshotEntitySchemas];
    distinct(values.map(value => value.id), `${field}.id`);
    for (const [index, value] of values.entries()) {
      const label = `store.${field}[${index}]`;
      check(schema, value, label);
      for (const key of ['x', 'y', 'initialSpawnX', 'initialSpawnY']) bounds(value[key], `${label}.${key}`);
      for (const key of ['agentId', 'otherAgentId', 'knownAgentId', 'referredById', 'employerId', 'workerId', 'parentAgentId', 'partnerAgentId', 'offspringAgentId', 'sourceAgentId', 'targetAgentId', 'subjectAgentId', 'issuerId', 'subjectId', 'correctionSourceId', 'attackerId', 'victimId', 'namedByAgentId', 'spawnedByParentId', 'ownerAgentId', 'fromAgentId', 'toAgentId', 'leaderId', 'ownerId', 'originalOwnerId', 'submitterId']) {
        reference(value[key], agents, `${label}.${key}`);
      }
      for (const key of ['parentIds', 'sharedWith', 'involvedAgentIds']) {
        if (Array.isArray(value[key])) {
          if (key !== 'involvedAgentIds') distinct(value[key] as unknown[], `${label}.${key}`);
          for (const target of value[key] as unknown[]) reference(target, agents, `${label}.${key}`);
        }
      }
      reference(value.gameId, games, `${label}.gameId`);
      reference(value.teamId, teams, `${label}.teamId`);
      if (value.teamId && teams.get(value.teamId as string)?.gameId !== value.gameId) fail(`Cross-game team ${label}`);
      if (field === 'resourceSpawns' && (value.currentAmount as number) > (value.maxAmount as number)) fail(`Resource capacity exceeded ${label}`);
      if (field === 'jobOffers' && (value.escrowAmount as number) > (value.salary as number)) fail(`Invalid escrow ${label}`);
      if (field === 'employments') {
        reference(value.jobOfferId, offers, `${label}.jobOfferId`);
        if (offers.get(value.jobOfferId as string)?.employerId !== value.employerId) fail(`Employment employer mismatch ${label}`);
        // Default forfeits the original guarantee in addition to wages already
        // paid. The offer retains that deposit after the contract releases it.
        const forfeiture = value.status === 'unpaid' || value.status === 'abandoned'
          ? offers.get(value.jobOfferId as string)!.escrowAmount as number : 0;
        const paid = value.amountPaid as number, salary = value.salary as number;
        const roundoff = forfeiture > 0 ? Number.EPSILON * Math.max(paid, salary, forfeiture) * 2 : 0;
        if ((value.ticksWorked as number) > (value.ticksRequired as number) || paid - salary - forfeiture > roundoff || (value.escrowAmount as number) > salary) fail(`Invalid employment settlement ${label}`);
      }
      if (field === 'puzzleGames') {
        if ((value.minParticipants as number) > (value.maxParticipants as number)) fail(`Invalid participant limits ${label}`);
        if (value.startsAtTick !== null && value.endsAtTick !== null && (value.endsAtTick as number) < (value.startsAtTick as number)) fail(`Invalid puzzle duration ${label}`);
        if (value.winnerId !== null) {
          if (!agents.has(value.winnerId as string) && !teams.has(value.winnerId as string)) fail(`Unknown puzzle winner ${label}`);
          if (teams.has(value.winnerId as string) && teams.get(value.winnerId as string)?.gameId !== value.id) fail(`Cross-game winner ${label}`);
        }
        if (Array.isArray(value.prizeDistribution)) {
          const prizes = value.prizeDistribution as JsonObject[];
          for (const prize of prizes) reference(prize.agentId, agents, `${label}.prizeDistribution`);
          const awarded = prizes.reduce((sum, prize) => sum + (prize.amount as number), 0);
          const pool = value.prizePool as number;
          // Split decimal awards can round just above their pool. Bound only
          // arithmetic roundoff; a zero pool still permits no positive award.
          const tolerance = Number.EPSILON * pool * Math.max(1, prizes.length);
          if (!Number.isFinite(awarded) || awarded - pool > tolerance) fail(`Puzzle awards exceed prize pool ${label}`);
        }
      }
    }
  }
  for (const field of ['inventory', 'scents', 'forageCooldowns', 'publicWorkSessions'] as const) distinct(snapshot.store[field].map(entry => entry[0]), field);
  for (const [key, value] of snapshot.store.inventory) {
    check(inventorySchema, value, 'inventory');
    const item = value as JsonObject;
    reference(item.agentId, agents, 'inventory.agentId');
    if (key !== `${item.agentId}:${item.itemType}`) fail('Inventory key mismatch');
  }
  for (const [key, value] of snapshot.store.scents) {
    check(z.object({ agentId: id, tick: count, strength: amount }), value, 'scents');
    reference((value as JsonObject).agentId, agents, 'scents.agentId');
    const coordinates = key.split(':');
    if (coordinates.length !== 2 || coordinates.some(item => !/^\d+$/.test(item))) fail('Invalid scent coordinate key');
    coordinates.forEach(item => bounds(Number(item), 'scents'));
  }
  for (const [key, tick] of snapshot.store.forageCooldowns) {
    check(count, tick, 'forageCooldowns');
    const match = key.match(/^(.*):(\d+):(\d+)$/);
    if (!match) fail('Invalid forage cooldown key');
    reference(match![1], agents, 'forageCooldowns.agentId');
    bounds(Number(match![2]), 'forageCooldowns.x'); bounds(Number(match![3]), 'forageCooldowns.y');
  }
  for (const [agentId, session] of snapshot.store.publicWorkSessions) {
    reference(agentId, agents, 'publicWorkSessions.agentId');
    check(z.object({ startTick: count, taskType: z.enum(['road_maintenance', 'resource_survey', 'shelter_cleanup']), ticksWorked: count }), session, 'publicWorkSessions');
  }
  for (const [field, entries] of [['agentMeta', snapshot.engine.agentMeta], ['vitalsMeta', snapshot.engine.vitalsMeta]] as const) {
    distinct(entries.map(entry => entry[0]), field);
    for (const [agentId, value] of entries) {
      reference(agentId, agents, field);
      check(field === 'agentMeta' ? z.object({ busyUntil: amount }) : z.object({ vitalsUpdatedAt: amount, criticalSince: z.object({ hunger: amount.optional(), energy: amount.optional() }).strict() }), value, field);
    }
  }
  check(count, snapshot.engine.heartbeat.lastCurrencyDecayBoundaryTick, 'heartbeat.lastCurrencyDecayBoundaryTick');
  for (const [field, rows] of [['nextEventId', snapshot.store.events], ['nextEventVersion', snapshot.store.events], ['nextGossipId', snapshot.store.gossipEvents]] as const) {
    const next = snapshot.store[field];
    check(positiveCount, next, field);
    const rowField = field === 'nextEventVersion' ? 'version' : 'id';
    if (rows.some(value => (value[rowField] as number) >= next)) fail(`Nonmonotonic ${field}`);
  }
  distinct(snapshot.store.relationships.map(value => `${value.agentId}:${value.otherAgentId}`), 'relationship pair');
  distinct(snapshot.store.agentRoles.map(value => value.agentId), 'agent role');
  distinct(snapshot.store.agentLineages.map(value => value.agentId), 'agent lineage');
  distinct(snapshot.store.puzzleParticipants.map(value => `${value.gameId}:${value.agentId}`), 'puzzle participant');
  distinct(snapshot.store.puzzleFragments.map(value => `${value.gameId}:${value.fragmentIndex}`), 'puzzle fragment index');
  if (snapshot.random) for (const [agentId] of snapshot.random.agents) reference(agentId, agents, 'random.agents');
  if (snapshot.configuration?.connections) {
    const connections = new Set(snapshot.configuration.connections.map(value => value.id));
    distinct([...snapshot.configuration.connections.map(value => value.id)], 'connection id');
    for (const agent of snapshot.store.agents) reference(agent.connectionId, connections, 'agents.connectionId');
    for (const entry of snapshot.configuration.roster ?? []) reference(entry.connectionId, connections, 'roster.connectionId');
  }
}
