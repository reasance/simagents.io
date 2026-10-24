/**
 * Gather Action Handler
 *
 * Collect resources from resource spawns (Sugarscape-style).
 * Agent must be at a location with a resource spawn.
 *
 * Cost: Energy
 * Reward: Resources added to inventory
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult } from '../types';
import type { Agent } from '../../db/schema';
import { getResourceSpawnsAtPosition, harvestResource } from '../../db/queries/world';
import { addToInventory } from '../../db/queries/inventory';
import { storeMemory } from '../../db/queries/memories';
import { getAliveAgents } from '../../db/queries/agents';
import { CONFIG as GLOBAL_CONFIG, getRuntimeConfig } from '../../config';

// Gather configuration (use global config values)
const CONFIG = {
  energyCostPerUnit: GLOBAL_CONFIG.actions.gather.energyCostPerUnit,
  hungerCostPerUnit: 0.3, // Hunger cost per resource unit gathered
  maxGatherPerAction: GLOBAL_CONFIG.actions.gather.maxPerAction,
} as const;

/**
 * Count other agents at the same position for cooperation bonus
 */
async function countAgentsAtPosition(agentId: string, x: number, y: number): Promise<number> {
  const coopConfig = getRuntimeConfig().cooperation;
  if (!coopConfig.enabled) return 0;

  const aliveAgents = await getAliveAgents();
  return aliveAgents.filter((a) => a.id !== agentId && a.x === x && a.y === y).length;
}

/**
 * Calculate cooperation multiplier for gathering
 * More agents at the same position = better efficiency (up to max cap)
 */
function getCooperationMultiplier(otherAgentsCount: number): number {
  const coopConfig = getRuntimeConfig().cooperation;
  if (!coopConfig.enabled || otherAgentsCount === 0) return 1.0;

  const multiplierPerAgent = coopConfig.gather.efficiencyMultiplierPerAgent;
  const maxMultiplier = coopConfig.gather.maxEfficiencyMultiplier;

  // Calculate: 1 + (otherAgents * (multiplier - 1)), capped at max
  const bonus = otherAgentsCount * (multiplierPerAgent - 1);
  return Math.min(1 + bonus, maxMultiplier);
}

// Map resource types to inventory item types
const RESOURCE_TO_ITEM: Record<string, string> = {
  food: 'food',
  energy: 'battery', // Energy resource becomes battery item
  material: 'material',
};

export interface GatherParams {
  resourceType?: string; // Optional - if not specified, gather any available
  quantity?: number; // How much to try to gather (default: 1)
}

export async function handleGather(
  intent: ActionIntent<GatherParams>,
  agent: Agent
): Promise<ActionResult> {
  const { resourceType, quantity = 1 } = intent.params;
  const runtimeConfig = getRuntimeConfig();

  // Validate quantity
  if (quantity < 1 || quantity > CONFIG.maxGatherPerAction) {
    return {
      success: false,
      error: `Invalid quantity: must be between 1 and ${CONFIG.maxGatherPerAction}`,
    };
  }

  // Calculate energy cost
  const energyCost = CONFIG.energyCostPerUnit * quantity;

  // Check if agent has enough energy
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy: need ${energyCost}, have ${agent.energy}`,
    };
  }

  // Get resource spawns at agent's position
  const spawns = await getResourceSpawnsAtPosition(agent.x, agent.y);

  if (spawns.length === 0) {
    return {
      success: false,
      error: `No resources at position (${agent.x}, ${agent.y})`,
    };
  }

  // Find matching spawn (if resourceType specified) or first available
  let targetSpawn = spawns[0];
  if (resourceType) {
    const matching = spawns.find((s) => s.resourceType === resourceType);
    if (!matching) {
      return {
        success: false,
        error: `No ${resourceType} resource at position (${agent.x}, ${agent.y})`,
      };
    }
    targetSpawn = matching;
  }

  // Check if spawn has resources available
  if (targetSpawn.currentAmount <= 0) {
    return {
      success: false,
      error: `Resource spawn is depleted (will regenerate over time)`,
    };
  }

  // Phase 5: Cooperation Threshold (Sugarscape CT)
  // Rich spawns require multiple agents to fully harvest
  const groupGatherConfig = runtimeConfig.cooperation.groupGather;
  const otherAgentsHere = await countAgentsAtPosition(agent.id, agent.x, agent.y);
  const isRichSpawn = targetSpawn.currentAmount > groupGatherConfig.richSpawnThreshold;
  let maxGatherLimit = quantity;
  let groupGatherNote = '';

  if (groupGatherConfig.enabled && isRichSpawn) {
    if (otherAgentsHere + 1 < groupGatherConfig.minAgentsForRich) {
      // Solo agent at rich spawn - limited gathering
      maxGatherLimit = Math.min(quantity, groupGatherConfig.soloMaxFromRich);
      groupGatherNote = ` (RICH SPAWN: need ${groupGatherConfig.minAgentsForRich}+ agents to fully harvest, solo max: ${groupGatherConfig.soloMaxFromRich})`;
    }
  }

  // Harvest the resource (with cooperation threshold applied)
  const actualGathered = await harvestResource(targetSpawn.id, maxGatherLimit);

  if (actualGathered === 0) {
    return {
      success: false,
      error: 'Failed to gather resources',
    };
  }

  // Apply cooperation bonus/penalty (more agents nearby = better efficiency, alone = penalty)
  // Note: otherAgentsHere was already counted above for cooperation threshold check
  let efficiencyMultiplier = getCooperationMultiplier(otherAgentsHere);

  // Phase 5: Group bonus for rich spawns when cooperating
  if (groupGatherConfig.enabled && isRichSpawn && otherAgentsHere + 1 >= groupGatherConfig.minAgentsForRich) {
    efficiencyMultiplier *= groupGatherConfig.groupBonus;
    groupGatherNote = ` (GROUP BONUS: +${Math.round((groupGatherConfig.groupBonus - 1) * 100)}% efficiency with ${otherAgentsHere + 1} agents!)`;
  }

  // Solo penalty: if no other agents nearby, reduce efficiency
  if (otherAgentsHere === 0 && runtimeConfig.cooperation.enabled) {
    efficiencyMultiplier *= runtimeConfig.cooperation.solo.gatherEfficiencyModifier;
  }

  const finalGathered = Math.floor(actualGathered * efficiencyMultiplier);

  // Convert resource type to inventory item type
  const itemType = RESOURCE_TO_ITEM[targetSpawn.resourceType] || targetSpawn.resourceType;

  // Add to inventory (with cooperation bonus/penalty applied)
  await addToInventory(agent.id, itemType, finalGathered);

  // Calculate actual energy and hunger cost (based on what was actually gathered)
  const actualEnergyCost = CONFIG.energyCostPerUnit * actualGathered;
  const actualHungerCost = CONFIG.hungerCostPerUnit * actualGathered;
  const newEnergy = agent.energy - actualEnergyCost;
  const newHunger = Math.max(0, agent.hunger - actualHungerCost);

  // Store memory of gathering (include cooperation bonus/penalty info if applicable)
  let coopNote = groupGatherNote; // Start with group gather note if set
  if (!coopNote) {
    if (finalGathered > actualGathered) {
      coopNote = ` (cooperation bonus: +${finalGathered - actualGathered})`;
    } else if (finalGathered < actualGathered) {
      coopNote = ` (solo penalty: -${actualGathered - finalGathered})`;
    }
  }
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Gathered ${finalGathered}x ${targetSpawn.resourceType} at (${agent.x}, ${agent.y}). Spawn has ${targetSpawn.currentAmount - actualGathered} remaining.`,
    importance: 5,
    emotionalValence: 0.4,
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: {
      energy: newEnergy,
      hunger: newHunger,
    },
    events: [
      {
        id: uuid(),
        type: 'agent_gathered',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          position: { x: agent.x, y: agent.y },
          resourceType: targetSpawn.resourceType,
          itemType,
          amountRequested: quantity,
          amountGathered: finalGathered, // With cooperation bonus applied
          baseAmountGathered: actualGathered,
          cooperationMultiplier: efficiencyMultiplier,
          otherAgentsNearby: otherAgentsHere,
          spawnRemainingAmount: targetSpawn.currentAmount - actualGathered,
          energyCost: actualEnergyCost,
          hungerCost: actualHungerCost,
          // Phase 5: Group gather info
          isRichSpawn,
          soloLimitApplied: maxGatherLimit < quantity,
          newEnergy,
          newHunger,
        },
      },
    ],
  };
}
