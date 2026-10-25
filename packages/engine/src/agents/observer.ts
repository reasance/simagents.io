/**
 * Agent Observer - Builds observations for agents
 *
 * Scientific Model: includes resource spawns and shelters
 * Phase 1: includes memories and relationships
 * Phase 5: includes personality trait in self observation
 */

import type { Agent, Shelter, ResourceSpawn } from '../db/schema';
import type {
  AgentObservation,
  NearbyAgent,
  NearbyLocation,
  NearbyResourceSpawn,
  NearbyShelter,
  NearbyClaim,
  LocationNameEntry,
  AvailableAction,
  RecentEvent,
  InventoryEntry,
  AgentMemoryEntry,
  RelationshipInfo,
  KnownAgentEntry,
  ScentTrace,
  SignalHeard,
  ConversationLine,
  NearbyJobOffer,
  ActiveEmployment,
  OpenJobOffer,
  // Puzzle System
  ActivePuzzleGame,
  MyPuzzleFragment,
  MyPuzzleTeam,
  NearbyPuzzlePlayer,
  PuzzleParticipationInfo,
} from '../llm/types';
import { buildAvailableActions } from '../llm/available-actions';
import { getVisibleAgents, getAdjacentPositions, getDirection, getDistance } from '../world/grid';
import { getAgentInventory } from '../db/queries/inventory';
import { getRecentMemories, getAgentRelationships } from '../db/queries/memories';
import { getKnownAgentsForObserver, type SharedInfo } from '../db/queries/knowledge';
import { getNearbyClaims } from '../db/queries/claims';
import { getNearbyNamedLocations, getLocationNamesForObserver } from '../db/queries/naming';
import { getConversationForAgent, getRecentSignals } from '../db/queries/events';
import { getScentsAt, calculateScentStrength } from '../world/scent';
import {
  getOpenJobOffersNearPosition,
  getActiveEmploymentsForWorker,
  getActiveEmploymentsForEmployer,
  getOpenJobOffersByEmployer,
} from '../db/queries/employment';
import {
  getAgentPuzzleContext,
  isAgentInActivePuzzle,
  getFragmentsOwnedByAgent,
  getTeamMembers,
  getParticipant,
  getAgentActivePuzzleGame,
} from '../db/queries/puzzles';
import { CONFIG, getRuntimeConfig } from '../config';
import { surfaceActionName } from '../llm/prompts/action-surface';
import { isBlackoutActive } from '../simulation/shocks';
import { isPersonalityEnabled, isValidPersonality, type PersonalityTrait } from './personalities';

const VISIBILITY_RADIUS = CONFIG.simulation.visibilityRadius;

/**
 * Filter items within visibility radius
 */
function getVisibleItems<T extends { x: number; y: number }>(
  items: T[],
  center: { x: number; y: number },
  radius: number
): T[] {
  return items.filter((item) => {
    const dx = Math.abs(item.x - center.x);
    const dy = Math.abs(item.y - center.y);
    return dx <= radius && dy <= radius;
  });
}

/**
 * Build observation for an agent
 */
export async function buildObservation(
  agent: Agent,
  tick: number,
  allAgents: Agent[],
  allResourceSpawns: ResourceSpawn[],
  allShelters: Shelter[],
  recentEvents: RecentEvent[] = []
): Promise<AgentObservation> {
  // Parse personality from agent (may be stored as string in DB)
  let personality: PersonalityTrait | null = null;
  if (isPersonalityEnabled() && agent.personality) {
    if (isValidPersonality(agent.personality)) {
      personality = agent.personality as PersonalityTrait;
    }
  }

  // Self data
  const self = {
    id: agent.id,
    x: agent.x,
    y: agent.y,
    hunger: agent.hunger,
    energy: agent.energy,
    health: agent.health,
    balance: agent.balance,
    state: agent.state,
    // Include personality in observation (Phase 5)
    personality,
    privateNotes: agent.privateNotes,
  };

  // Nearby agents (within visibility radius, excluding self)
  // During communication blackout, agents cannot see other agents
  let nearbyAgents: NearbyAgent[] = [];

  if (!isBlackoutActive(tick)) {
    const visibleAgents = getVisibleAgents(
      allAgents.filter((a) => a.id !== agent.id),
      { x: agent.x, y: agent.y },
      VISIBILITY_RADIUS
    );

    // Phase 4: Fetch inventory for close agents (within cooperation range)
    // This enables trade by letting agents know what others have
    const COOPERATION_RANGE = CONFIG.cooperation.forage.cooperationRadius ?? 3;

    nearbyAgents = await Promise.all(
      visibleAgents.map(async (a) => {
        const distance = Math.abs(a.x - agent.x) + Math.abs(a.y - agent.y);
        const baseAgent: NearbyAgent = {
          id: a.id,
          x: a.x,
          y: a.y,
          state: a.state,
        };

        // Only fetch inventory for close agents to enable trade decisions
        if (distance <= COOPERATION_RANGE) {
          const rawInventory = await getAgentInventory(a.id);
          if (rawInventory.length > 0) {
            baseAgent.inventory = rawInventory.map((item) => ({
              type: item.itemType,
              quantity: item.quantity,
            }));
          }
        }

        return baseAgent;
      })
    );
  }

  // Nearby resource spawns
  const visibleSpawns = getVisibleItems(
    allResourceSpawns,
    { x: agent.x, y: agent.y },
    VISIBILITY_RADIUS
  );

  const nearbyResourceSpawns: NearbyResourceSpawn[] = visibleSpawns.map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    resourceType: s.resourceType,
    currentAmount: s.currentAmount,
    maxAmount: s.maxAmount,
  }));

  // Nearby shelters
  const visibleShelters = getVisibleItems(
    allShelters,
    { x: agent.x, y: agent.y },
    VISIBILITY_RADIUS
  );

  const nearbyShelters: NearbyShelter[] = visibleShelters.map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    canSleep: s.canSleep,
    ownerId: s.ownerAgentId ?? undefined,
  }));

  // Get agent's inventory
  const rawInventory = await getAgentInventory(agent.id);
  const inventory: InventoryEntry[] = rawInventory.map((item) => ({
    type: item.itemType,
    quantity: item.quantity,
  }));

  // Phase 1: Get recent memories
  const rawMemories = await getRecentMemories(agent.id, CONFIG.memory.recentCount);
  const recentMemories: AgentMemoryEntry[] = rawMemories.map((m) => ({
    tick: m.tick,
    content: m.content,
    type: m.type,
    importance: m.importance,
    emotionalValence: m.emotionalValence,
  }));

  // Phase 1: Get relationships for nearby agents
  const rawRelationships = await getAgentRelationships(agent.id);
  const relationships: Record<string, RelationshipInfo> = {};

  // Only include relationships for nearby agents (to keep context focused)
  const nearbyAgentIds = new Set(nearbyAgents.map((a) => a.id));
  for (const rel of rawRelationships) {
    if (nearbyAgentIds.has(rel.otherAgentId)) {
      relationships[rel.otherAgentId] = {
        trustScore: rel.trustScore,
        interactionCount: rel.interactionCount,
        lastInteractionTick: rel.lastInteractionTick ?? undefined,
      };
    }
  }

  // Phase 2: Get known agents (through direct contact or referral)
  const rawKnownAgents = await getKnownAgentsForObserver(agent.id, tick, 10);
  const knownAgents: KnownAgentEntry[] = rawKnownAgents.map((k) => ({
    id: k.id,
    discoveryType: k.discoveryType,
    referredBy: k.referredBy,
    referralDepth: k.referralDepth,
    lastKnownPosition: k.sharedInfo.lastKnownPosition,
    reputationClaim: k.sharedInfo.reputationClaim,
    dangerWarning: k.sharedInfo.dangerWarning,
    informationAge: k.informationAge,
  }));

  // Phase 1: Get nearby claims (Landmarks visible from further away)
  const LANDMARK_RADIUS = CONFIG.simulation.landmarkVisibilityRadius;
  const rawClaims = await getNearbyClaims(agent.x, agent.y, LANDMARK_RADIUS);
  const nearbyClaims: NearbyClaim[] = rawClaims.map((c) => ({
    id: c.id,
    agentId: c.agentId,
    x: c.x,
    y: c.y,
    claimType: c.claimType as NearbyClaim['claimType'],
    description: c.description ?? undefined,
    strength: c.strength,
    claimedAtTick: c.claimedAtTick,
  }));

  // Phase 1: Get nearby location names (Landmarks)
  const rawNamedLocations = await getNearbyNamedLocations(agent.x, agent.y, LANDMARK_RADIUS);
  const nearbyLocationNames: Record<string, LocationNameEntry[]> = {};

  // Group names by position and get all names for each
  for (const loc of rawNamedLocations) {
    const key = `${loc.x},${loc.y}`;
    if (!nearbyLocationNames[key]) {
      // Get all names for this position
      const names = await getLocationNamesForObserver(loc.x, loc.y);
      nearbyLocationNames[key] = names;
    }
  }

  // Feature 1: Stigmergy (Scents)
  // getAdjacentPositions uses WORLD_SIZE internally for bounds checking
  const adjacentPositions = getAdjacentPositions({ x: agent.x, y: agent.y });
  adjacentPositions.push({ x: agent.x, y: agent.y }); // Include current pos

  const rawScents = await getScentsAt(adjacentPositions);
  const scents: ScentTrace[] = rawScents
    .filter(s => s.agentId !== agent.id) // Don't smell self
    .map((s) => ({
      x: s.x,
      y: s.y,
      strength: calculateScentStrength(s.tick, tick),
      agentId: s.agentId, // In real stigmergy ID is unknown, but here we allow it for "recognition" if known
    }));

  // Feature 2: Signals (Long-range)
  const rawSignals = await getRecentSignals(tick);
  const signals: SignalHeard[] = [];

  for (const sigEvent of rawSignals) {
    if (sigEvent.agentId === agent.id) continue; // Ignore own signals

    const payload = sigEvent.payload as Record<string, unknown>;

    // Validate payload has required fields before accessing
    if (
      typeof payload?.x !== 'number' ||
      typeof payload?.y !== 'number' ||
      typeof payload?.range !== 'number' ||
      typeof payload?.message !== 'string'
    ) {
      // Skip malformed signal events
      continue;
    }

    const signalPos = { x: payload.x, y: payload.y };
    // Use Manhattan distance for signal propagation (consistent with movement cost)
    const dist = Math.abs(agent.x - signalPos.x) + Math.abs(agent.y - signalPos.y);

    if (dist <= payload.range) {
      const intensity = typeof payload.intensity === 'number' ? payload.intensity : 1;
      signals.push({
        direction: getDirection({ x: agent.x, y: agent.y }, signalPos),
        message: payload.message,
        intensity: intensity >= 4 ? 'loud' : 'quiet',
        tick: sigEvent.tick,
      });
    }
  }

  // Speech: everything this agent said or heard, as raw utterances.
  const rawConversation = await getConversationForAgent(agent.id, getRuntimeConfig().actions.speak.conversationWindow);
  const conversation: ConversationLine[] = rawConversation.flatMap((event) => {
    const payload = event.payload as Record<string, unknown>;
    if (typeof payload?.message !== 'string') return [];
    const spokenByYou = event.eventType === 'agent_spoke';
    const speakerId = spokenByYou ? agent.id : payload.speakerId;
    if (typeof speakerId !== 'string') return [];
    const to = spokenByYou
      ? (typeof payload.to === 'string' ? payload.to : null)
      : (payload.addressedToListener === true ? agent.id : null);
    return [{ tick: event.tick, speakerId, spokenByYou, to, message: payload.message }];
  });

  // Employment System: Job offers, active contracts, own postings
  // Only query if agent.id is a valid UUID (skip for mock agents in tests)
  const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agent.id);

  const [rawNearbyJobOffers, workerEmployments, employerEmployments, rawMyJobOffers] = isValidUuid
    ? await Promise.all([
        getOpenJobOffersNearPosition(agent.x, agent.y, VISIBILITY_RADIUS, tick),
        getActiveEmploymentsForWorker(agent.id),
        getActiveEmploymentsForEmployer(agent.id),
        getOpenJobOffersByEmployer(agent.id),
      ])
    : [[], [], [], []];

  // Map nearby job offers (exclude own offers)
  const nearbyJobOffers: NearbyJobOffer[] = rawNearbyJobOffers
    .filter((o) => o.employerId !== agent.id)
    .map((o) => ({
      id: o.id,
      employerId: o.employerId,
      salary: o.salary,
      duration: o.duration,
      paymentType: o.paymentType as NearbyJobOffer['paymentType'],
      escrowPercent: o.salary > 0 ? Math.round((o.escrowAmount / o.salary) * 100) : 0,
      description: o.description ?? undefined,
      x: o.x,
      y: o.y,
    }));

  // Map active employments (both as worker and employer)
  const activeEmployments: ActiveEmployment[] = [
    ...workerEmployments.map((e) => ({
      id: e.id,
      role: 'worker' as const,
      otherPartyId: e.employerId,
      salary: e.salary,
      ticksWorked: e.ticksWorked,
      ticksRequired: e.ticksRequired,
      paymentType: e.paymentType as ActiveEmployment['paymentType'],
      amountPaid: e.amountPaid,
      isComplete: e.ticksWorked >= e.ticksRequired,
      needsPayment: e.paymentType === 'on_completion' && e.ticksWorked >= e.ticksRequired && e.amountPaid < e.salary,
    })),
    ...employerEmployments.map((e) => ({
      id: e.id,
      role: 'employer' as const,
      otherPartyId: e.workerId,
      salary: e.salary,
      ticksWorked: e.ticksWorked,
      ticksRequired: e.ticksRequired,
      paymentType: e.paymentType as ActiveEmployment['paymentType'],
      amountPaid: e.amountPaid,
      isComplete: e.ticksWorked >= e.ticksRequired,
      needsPayment: e.paymentType === 'on_completion' && e.ticksWorked >= e.ticksRequired && e.amountPaid < e.salary,
    })),
  ];

  // Map own job offers
  const myJobOffers: OpenJobOffer[] = rawMyJobOffers.map((o) => ({
    id: o.id,
    salary: o.salary,
    duration: o.duration,
    paymentType: o.paymentType as OpenJobOffer['paymentType'],
    escrowAmount: o.escrowAmount,
    createdAtTick: o.createdAtTick,
    expiresAtTick: o.expiresAtTick ?? undefined,
  }));

  // Puzzle Game System
  let activePuzzleGames: ActivePuzzleGame[] = [];
  let myPuzzleFragments: MyPuzzleFragment[] = [];
  let myPuzzleTeam: MyPuzzleTeam | undefined;
  let puzzleParticipation: PuzzleParticipationInfo | undefined;
  let inActivePuzzle = false;
  const nearbyPuzzlePlayers: NearbyPuzzlePlayer[] = [];

  // Puzzles are off by default; a world turns them on through its runtime config.
  if (getRuntimeConfig().puzzle.enabled && isValidUuid) {
    // Check if agent is in an active puzzle
    inActivePuzzle = await isAgentInActivePuzzle(agent.id);

    // Get full puzzle context for the agent
    const puzzleContext = await getAgentPuzzleContext(agent.id, agent.tenantId);

    // Map active puzzle games from context
    activePuzzleGames = puzzleContext.activePuzzleGames.map((game) => ({
      id: game.id,
      gameType: game.gameType,
      status: game.status,
      prizePool: game.prizePool,
      entryStake: game.entryStake,
      participantCount: game.participantCount,
      fragmentsNeeded: game.fragmentCount,
      ticksRemaining: (game.endsAtTick || tick) - tick,
      isParticipating: game.isParticipating,
    }));

    // If agent is in a puzzle, get detailed participation info
    if (puzzleContext.currentGameId) {
      const currentGame = puzzleContext.activePuzzleGames.find(
        (g) => g.id === puzzleContext.currentGameId
      );
      const participation = await getParticipant(agent.id, puzzleContext.currentGameId);

      if (currentGame && participation) {
        puzzleParticipation = {
          gameId: puzzleContext.currentGameId,
          gameType: currentGame.gameType,
          stakedAmount: participation.stakedAmount,
          fragmentsReceived: participation.fragmentsReceived,
          fragmentsShared: participation.fragmentsShared,
          contributionScore: participation.contributionScore,
          teamId: participation.teamId ?? undefined,
          ticksRemaining: (currentGame.endsAtTick || tick) - tick,
        };

        // Map agent's fragments
        myPuzzleFragments = puzzleContext.myFragments.map((f) => ({
          id: f.id,
          gameId: f.gameId,
          gameType: currentGame.gameType,
          fragmentIndex: f.fragmentIndex,
          hint: f.hint ?? undefined,
          content: f.content,
          sharedWith: (f.sharedWith as string[]) || [],
        }));

        // Map agent's team info
        if (puzzleContext.myTeam) {
          const members = await getTeamMembers(puzzleContext.myTeam.id);
          myPuzzleTeam = {
            id: puzzleContext.myTeam.id,
            gameId: puzzleContext.myTeam.gameId,
            name: puzzleContext.myTeam.name || `Team-${puzzleContext.myTeam.leaderId.slice(0, 8)}`,
            leaderId: puzzleContext.myTeam.leaderId,
            memberCount: members.length,
            totalStake: puzzleContext.myTeam.totalStake,
            isLeader: puzzleContext.myTeam.leaderId === agent.id,
          };
        }

        // Find nearby agents who are in puzzles
        const nearbyAgentIds = nearbyAgents.map((a) => a.id);
        for (const nearbyAgentId of nearbyAgentIds) {
          const nearbyAgentInPuzzle = await isAgentInActivePuzzle(nearbyAgentId);
          if (nearbyAgentInPuzzle) {
            const nearbyAgent = nearbyAgents.find((a) => a.id === nearbyAgentId);
            const nearbyAgentGame = await getAgentActivePuzzleGame(nearbyAgentId);
            const nearbyParticipation = nearbyAgentGame
              ? await getParticipant(nearbyAgentId, nearbyAgentGame.id)
              : undefined;
            const rel = relationships[nearbyAgentId];

            if (nearbyAgent) {
              const nearbyFragments = await getFragmentsOwnedByAgent(nearbyAgentId);
              nearbyPuzzlePlayers.push({
                agentId: nearbyAgentId,
                distance: Math.abs(agent.x - nearbyAgent.x) + Math.abs(agent.y - nearbyAgent.y),
                trustLevel: rel?.trustScore ?? 0,
                fragmentCount: nearbyFragments.length,
                inSameGame: nearbyAgentGame?.id === puzzleContext.currentGameId,
                teamId: nearbyParticipation?.teamId ?? undefined,
              });
            }
          }
        }
      }
    }
  }

  // Build available actions based on current state
  const observation: AgentObservation = {
    tick,
    timestamp: Date.now(),
    self,
    nearbyAgents,
    nearbyResourceSpawns,
    nearbyShelters,
    nearbyLocations: [], // Empty for backwards compatibility
    availableActions: [],
    recentEvents,
    inventory,
    recentMemories,
    // System-computed trust stays internal: agents form their own views of each other.
    nearbyClaims,
    nearbyLocationNames,
    knownAgents,
    scents,
    signals,
    conversation,
    // Employment System
    nearbyJobOffers,
    activeEmployments,
    myJobOffers,
    // Puzzle Game System
    activePuzzleGames: activePuzzleGames.length > 0 ? activePuzzleGames : undefined,
    myPuzzleFragments: myPuzzleFragments.length > 0 ? myPuzzleFragments : undefined,
    myPuzzleTeam,
    puzzleParticipation,
    inActivePuzzle: inActivePuzzle || undefined,
    nearbyPuzzlePlayers: nearbyPuzzlePlayers.length > 0 ? nearbyPuzzlePlayers : undefined,
  };

  // Add available actions
  observation.availableActions = buildAvailableActions(observation);

  return observation;
}

/**
 * Format event for observation
 */
export function formatEvent(event: { type: string; tick: number; payload: Record<string, unknown> }): RecentEvent {
  let description = event.type;
  const payload = event.payload as Record<string, Record<string, unknown> | unknown>;

  // Agents read what physically happened, in the action names they were offered;
  // engine identifiers (`agent_harm`, `agent_stole`, ...) never reach them.
  switch (event.type) {
    case 'agent_undecided':
      description = 'Stayed undecided and did nothing';
      break;
    // Provider trouble is not part of the world: the agent only learns that it did nothing.
    case 'agent_decision_failed':
      description = 'A turn passed without any action';
      break;
    case 'agent_unresponsive':
      description = 'Did nothing for a while';
      break;
    case 'agent_spoke':
      description = typeof payload.to === 'string' ? `Spoke to Agent ${payload.to}` : 'Spoke aloud';
      break;
    case 'agent_heard':
      description = `Heard Agent ${payload.speakerId} speak${payload.addressedToListener === true ? ' to you' : ''}`;
      break;
    case 'agent_gave':
      description = `Handed ${payload.quantity} ${payload.itemType} to Agent ${payload.recipientId}`;
      break;
    case 'agent_received':
      description = `Was handed ${payload.quantity} ${payload.itemType} by Agent ${payload.giverId}`;
      break;
    case 'agent_harmed':
      description = `Struck Agent ${payload.victimId} (${payload.intensity}), dealing ${payload.damage} damage${payload.victimDied === true ? '; the blow was fatal' : ''}`;
      break;
    case 'agent_harm_failed':
      description = `Tried to strike Agent ${payload.victimId} but missed`;
      break;
    case 'agent_stole':
      description = `Took ${payload.quantity} ${payload.itemType} from Agent ${payload.victimId}`;
      break;
    case 'agent_steal_failed':
      description = `Tried to take ${payload.targetItemType} from Agent ${payload.victimId} but was stopped`;
      break;
    case 'agent_moved': {
      const to = payload.to as { x?: number; y?: number } | undefined;
      description = `Moved to (${to?.x}, ${to?.y})`;
      break;
    }
    case 'agent_bought':
      description = `Bought ${event.payload.quantity}x ${event.payload.itemType}`;
      break;
    case 'agent_consumed':
      description = `Consumed ${event.payload.itemType}`;
      break;
    case 'agent_worked':
      description = `Worked for ${event.payload.duration} tick(s), earned ${event.payload.salary} CITY`;
      break;
    case 'agent_gathered':
      description = `Gathered ${event.payload.amountGathered}x ${event.payload.resourceType}`;
      break;
    case 'agent_sleeping':
      description = `Started sleeping`;
      break;
    case 'agent_woke':
      description = `Woke up`;
      break;
    case 'needs_warning':
      description = `Warning: ${event.payload.need} is ${event.payload.level}`;
      break;
    case 'balance_changed': {
      const change = event.payload.change as number;
      description = `Balance ${change >= 0 ? '+' : ''}${change} CITY`;
      break;
    }
    case 'agent_traded': {
      const offered = payload.offered as { itemType: string; quantity: number };
      const received = payload.received as { itemType: string; quantity: number };
      description = `Traded ${offered.quantity}x ${offered.itemType} for ${received.quantity}x ${received.itemType}`;
      break;
    }
    case 'agent_received_trade': {
      const off = payload.offered as { itemType: string; quantity: number };
      const rec = payload.received as { itemType: string; quantity: number };
      description = `Received trade: gave ${off.quantity}x ${off.itemType}, got ${rec.quantity}x ${rec.itemType}`;
      break;
    }
    case 'action_failed':
      description = `ACTION FAILED: ${surfaceActionName(String(event.payload.action))} - ${event.payload.error}`;
      break;
    // Phase 1: Emergence events
    case 'location_claimed': {
      const pos = payload.position as { x: number; y: number };
      description = `Claimed (${pos.x}, ${pos.y}) as ${payload.claimType}`;
      break;
    }
    case 'claim_reinforced': {
      const pos = payload.position as { x: number; y: number };
      description = `Reinforced ${payload.claimType} claim at (${pos.x}, ${pos.y})`;
      break;
    }
    case 'location_named': {
      const pos = payload.position as { x: number; y: number };
      description = `Named (${pos.x}, ${pos.y}) as "${payload.name}"`;
      break;
    }
    case 'name_supported': {
      const pos = payload.position as { x: number; y: number };
      description = `Supported naming (${pos.x}, ${pos.y}) as "${payload.name}"`;
      break;
    }
    case 'name_consensus_changed': {
      const pos = payload.position as { x: number; y: number };
      description = `Consensus name for (${pos.x}, ${pos.y}) changed to "${payload.newConsensus}"`;
      break;
    }
    default:
      // Every decision is logged as `agent_<engine action>` before its outcome.
      if (typeof payload.action === 'string' && event.type === `agent_${payload.action}`) {
        description = `Chose to ${surfaceActionName(payload.action)}`;
      }
  }

  return {
    type: event.type,
    tick: event.tick,
    description,
  };
}
