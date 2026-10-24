/**
 * Response Parser - Parse LLM responses into structured decisions
 */

import { validateActionParams } from '../actions/validation';
import type { AgentDecision } from './types';
import type { ActionType } from '../actions/types';
import { randomChoice } from '../utils/random';
import { getRuntimeConfig, isEmergentPromptEnabled } from '../config';
import { resolveSurfaceAction } from './prompts/action-surface';

const VALID_ACTIONS: ActionType[] = [
  // Core survival actions
  'move', 'buy', 'consume', 'sleep', 'work', 'gather', 'trade',
  // Survival fallbacks (always available)
  'forage', 'public_work',
  // Communication
  'signal', 'speak', 'give',
  // Phase 1: Emergence Observation
  'claim', 'name_location',
  // Phase 2: Conflict Actions
  'harm', 'steal', 'deceive',
  // Phase 2: Social Discovery
  'share_info',
  // Phase 4: Verifiable Credentials
  'issue_credential', 'revoke_credential',
  // Phase 4: Gossip Protocol
  'spread_gossip',
  // Phase 4: Reproduction
  'spawn_offspring',
  // Employment System
  'offer_job', 'accept_job', 'pay_worker', 'claim_escrow', 'quit_job', 'fire_worker', 'cancel_job_offer',
  // Puzzle System
  'join_puzzle', 'leave_puzzle', 'share_fragment', 'form_team', 'join_team', 'submit_solution',
];

/**
 * Parse LLM response into AgentDecision
 */
export function parseResponse(response: string): AgentDecision | null {
  try {
    // Strip markdown code blocks if present
    let cleaned = response.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    // Try to extract JSON from response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate action. Emergent prompts offer a curated surface with physical aliases.
    const name = typeof parsed.action === 'string' ? parsed.action : '';
    const action = isEmergentPromptEnabled()
      ? resolveSurfaceAction(name)
      : VALID_ACTIONS.includes(name as ActionType) ? name as ActionType : undefined;
    if (!action) {
      return null;
    }

    // Validate params
    if (!parsed.params || typeof parsed.params !== 'object') {
      return null;
    }

    // Validate specific action params
    const validationResult = validateActionParams(action, parsed.params);
    if (validationResult) {
      return null;
    }

    const notes = typeof parsed.notes === 'string' ? parsed.notes.trim() : '';
    return {
      action,
      params: parsed.params,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
      ...(notes ? { notes: notes.slice(0, getRuntimeConfig().agent.privateNotesMaxLength) } : {}),
    };
  } catch (error) {
    return null;
  }
}

/** Internal baseline decision helper. Never used for provider errors. */
export function getFallbackDecision(
  hunger: number,
  energy: number,
  balance: number,
  agentX?: number,
  agentY?: number,
  inventory?: Array<{ type: string; quantity: number }>,
  nearbyResourceSpawns?: Array<{ x: number; y: number; resourceType: string; currentAmount: number }>,
  nearbyShelters?: Array<{ x: number; y: number }>,
  // Social context (Phase 1.2: Enable social fallbacks)
  nearbyJobOffers?: Array<{ id: string; salary: number; employerId: string }>,
  activeEmployments?: Array<{ id: string; role: 'worker' | 'employer'; ticksWorked: number; ticksRequired: number }>,
  nearbyAgents?: Array<{ id: string }>
): AgentDecision {
  const hasFood = inventory?.some((i) => i.type === 'food' && i.quantity > 0) ?? false;
  const foodQuantity = inventory?.find((i) => i.type === 'food')?.quantity ?? 0;
  const currentX = agentX ?? 50;
  const currentY = agentY ?? 50;
  const atShelter = nearbyShelters?.some((s) => s.x === currentX && s.y === currentY) ?? false;

  // Social context helpers
  const hasActiveWorkerJob = activeEmployments?.some((e) => e.role === 'worker' && e.ticksWorked < e.ticksRequired) ?? false;
  const activeWorkerJob = activeEmployments?.find((e) => e.role === 'worker' && e.ticksWorked < e.ticksRequired);
  const hasNearbyAgents = (nearbyAgents?.length ?? 0) > 0;

  // Priority 1: Consume food if hungry AND have food
  if (hunger < 50 && hasFood) {
    return {
      action: 'consume',
      params: { itemType: 'food' },
      reasoning: 'Fallback: hungry, consuming food from inventory',
    };
  }

  // Priority 2: If critically hungry, at shelter, and have money, buy food
  if (hunger < 30 && balance >= 10 && atShelter) {
    return {
      action: 'buy',
      params: { itemType: 'food', quantity: 1 },
      reasoning: 'Fallback: critically hungry, buying food at shelter',
    };
  }

  // Priority 3: If hungry and at a food spawn, gather food
  if (hunger < 50 && nearbyResourceSpawns) {
    const foodSpawnHere = nearbyResourceSpawns.find(
      (s) => s.x === currentX && s.y === currentY && s.resourceType === 'food' && s.currentAmount > 0
    );
    if (foodSpawnHere) {
      return {
        action: 'gather',
        params: { resourceType: 'food', quantity: 1 },
        reasoning: 'Fallback: hungry, gathering food at current location',
      };
    }
  }

  // Priority 4: If hungry and no food spawns nearby, FORAGE (always works anywhere!)
  if (hunger < 40 && !hasFood) {
    // Check if there's a food spawn here first
    const foodSpawnHere = nearbyResourceSpawns?.find(
      (s) => s.x === currentX && s.y === currentY && s.resourceType === 'food' && s.currentAmount > 0
    );
    if (!foodSpawnHere) {
      // No food spawn here - try foraging (60% success, but always available!)
      return {
        action: 'forage',
        params: {},
        reasoning: 'Fallback: hungry with no food spawn nearby, foraging',
      };
    }
  }

  // Priority 5: If hungry, move towards nearest food spawn
  if (hunger < 40 && nearbyResourceSpawns) {
    const foodSpawns = nearbyResourceSpawns.filter((s) => s.resourceType === 'food' && s.currentAmount > 0);
    if (foodSpawns.length > 0) {
      // Find closest food spawn
      const closest = foodSpawns.reduce((a, b) => {
        const distA = Math.abs(a.x - currentX) + Math.abs(a.y - currentY);
        const distB = Math.abs(b.x - currentX) + Math.abs(b.y - currentY);
        return distA < distB ? a : b;
      });
      // Move one step towards it
      const dx = Math.sign(closest.x - currentX);
      const dy = Math.sign(closest.y - currentY);
      return {
        action: 'move',
        params: { toX: currentX + (dx || dy ? dx : 0), toY: currentY + (dx ? 0 : dy) },
        reasoning: 'Fallback: hungry, moving towards food spawn',
      };
    }
  }

  // ===== SOCIAL ACTIONS (Phase 1.2) =====

  // Priority 5.5: Work if have active employment (SOCIAL - steady income)
  if (hasActiveWorkerJob && energy >= 15 && activeWorkerJob) {
    return {
      action: 'work',
      params: {},
      reasoning: `Fallback: working on employment contract (${activeWorkerJob.ticksWorked}/${activeWorkerJob.ticksRequired} ticks)`,
    };
  }

  // Priority 5.6: Accept best job offer if poor and offers available (SOCIAL)
  if (balance < 30 && nearbyJobOffers && nearbyJobOffers.length > 0 && energy >= 20) {
    // Pick the best salary job offer
    const bestOffer = nearbyJobOffers.reduce((a, b) => (a.salary > b.salary ? a : b));
    return {
      action: 'accept_job',
      params: { jobOfferId: bestOffer.id },
      reasoning: `Fallback: poor, accepting job offer for ${bestOffer.salary} CITY`,
    };
  }

  // Priority 5.7: Trade surplus food if have 3+ and nearby agents (SOCIAL)
  if (foodQuantity >= 3 && hasNearbyAgents && nearbyAgents && nearbyAgents.length > 0) {
    const targetAgent = nearbyAgents[0]; // Pick first nearby agent
    return {
      action: 'trade',
      params: {
        targetAgentId: targetAgent.id,
        offeringItemType: 'food',
        offeringQuantity: 1,
        requestingItemType: 'CITY',
        requestingQuantity: 8, // Fair price for food
      },
      reasoning: 'Fallback: surplus food, trading with nearby agent',
    };
  }

  // ===== END SOCIAL ACTIONS =====

  // Priority 6: Rest if exhausted
  if (energy < 30) {
    return {
      action: 'sleep',
      params: { duration: 3 },
      reasoning: 'Fallback: exhausted, resting',
    };
  }

  // Priority 7: Public work if poor AND at shelter (earns 15 CITY, always available!)
  if (balance < 50 && energy >= 20 && atShelter) {
    return {
      action: 'public_work',
      params: {},
      reasoning: 'Fallback: low funds at shelter, doing public work',
    };
  }

  // Priority 8: If poor but not at shelter, try foraging for food to sell
  if (balance < 30 && energy >= 10 && !atShelter) {
    return {
      action: 'forage',
      params: {},
      reasoning: 'Fallback: poor and not at shelter, foraging for resources',
    };
  }

  // Priority 9: Random exploration if healthy
  if (energy >= 10) {
    // Random direction
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    const dir = randomChoice(directions) ?? directions[0];
    return {
      action: 'move',
      params: { toX: currentX + dir.dx, toY: currentY + dir.dy },
      reasoning: 'Fallback: exploring',
    };
  }

  // Default: rest
  return {
    action: 'sleep',
    params: { duration: 1 },
    reasoning: 'Fallback: no urgent needs, resting',
  };
}
