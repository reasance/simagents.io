/**
 * Forage Action Handler
 *
 * Survival fallback action - find small amounts of food anywhere.
 * Unlike gather, this doesn't require a resource spawn.
 * Low yield but always available (with cooldown).
 *
 * Cost: Minimal energy
 * Reward: Small chance of food (1 unit on success)
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult } from '../types';
import type { Agent } from '../../db/schema';
import { addToInventory } from '../../db/queries/inventory';
import { storeMemory } from '../../db/queries/memories';
import { getAliveAgents } from '../../db/queries/agents';
import { CONFIG, getRuntimeConfig } from '../../config';
import { random } from '../../utils/random';
import {
  entries as forageCooldownEntries,
  get as getForageCooldown,
  remove as removeForageCooldown,
  reset as resetForageCooldowns,
  set as setForageCooldown,
  size as forageCooldownSize,
} from '../state/forage-cooldowns';

/**
 * Check if agent is alone (no other agents within solo radius)
 * Used for cooperation penalty system
 */
async function isAgentAlone(agentId: string, x: number, y: number): Promise<boolean> {
  const coopConfig = getRuntimeConfig().cooperation;
  if (!coopConfig.enabled) return false;

  const aliveAgents = await getAliveAgents();
  const nearbyAgents = aliveAgents.filter((a) => {
    if (a.id === agentId) return false;
    const distance = Math.abs(a.x - x) + Math.abs(a.y - y);
    return distance <= coopConfig.solo.aloneRadius;
  });

  return nearbyAgents.length === 0;
}

/**
 * Count nearby foragers for cooperation bonus
 * Returns count of agents within cooperation radius
 */
async function countNearbyForagers(agentId: string, x: number, y: number): Promise<number> {
  const coopConfig = getRuntimeConfig().cooperation;
  if (!coopConfig.enabled) return 0;

  const cooperationRadius = coopConfig.forage?.cooperationRadius ?? 3;
  const aliveAgents = await getAliveAgents();
  const nearbyForagers = aliveAgents.filter((a) => {
    if (a.id === agentId) return false;
    const distance = Math.abs(a.x - x) + Math.abs(a.y - y);
    return distance <= cooperationRadius;
  });

  return nearbyForagers.length;
}

export function clearForageCooldowns(): void {
  resetForageCooldowns();
}

function getCooldownKey(agentId: string, x: number, y: number): string {
  return `${agentId}:${x}:${y}`;
}

export type ForageParams = Record<string, never>;

export async function handleForage(
  intent: ActionIntent<ForageParams>,
  agent: Agent
): Promise<ActionResult> {
  const config = CONFIG.actions.forage;
  const runtimeConfig = getRuntimeConfig();

  // Check energy
  if (agent.energy < config.energyCost) {
    return {
      success: false,
      error: `Not enough energy: need ${config.energyCost}, have ${agent.energy}`,
    };
  }

  // Check cooldown at this location
  const cooldownKey = getCooldownKey(agent.id, agent.x, agent.y);
  const lastForageTick = getForageCooldown(cooldownKey) || 0;

  if (intent.tick - lastForageTick < config.cooldownTicks) {
    const ticksRemaining = config.cooldownTicks - (intent.tick - lastForageTick);
    return {
      success: false,
      error: `Recently foraged here. Wait ${ticksRemaining} more tick(s) or move to another location.`,
    };
  }

  // Set cooldown
  setForageCooldown(cooldownKey, intent.tick);

  // Clean up old cooldowns (memory management)
  if (forageCooldownSize() > 1000) {
    const oldTicks = intent.tick - 100;
    for (const [key, tick] of forageCooldownEntries()) {
      if (tick < oldTicks) {
        removeForageCooldown(key);
      }
    }
  }

  // Calculate success rate with solo penalty OR cooperation bonus
  let effectiveSuccessRate = config.baseSuccessRate;
  const alone = await isAgentAlone(agent.id, agent.x, agent.y);
  const nearbyForagerCount = await countNearbyForagers(agent.id, agent.x, agent.y);

  if (alone && runtimeConfig.cooperation.enabled) {
    // Solo penalty: reduced success rate when foraging alone
    effectiveSuccessRate *= runtimeConfig.cooperation.solo.forageSuccessRateModifier;
  } else if (nearbyForagerCount > 0 && runtimeConfig.cooperation.enabled) {
    // Cooperation bonus: +15% per nearby agent, capped at +45%
    const bonusPerAgent = runtimeConfig.cooperation.forage?.nearbyAgentBonus ?? 0.15;
    const maxBonus = runtimeConfig.cooperation.forage?.maxCooperationBonus ?? 0.45;
    const coopBonus = Math.min(nearbyForagerCount * bonusPerAgent, maxBonus);
    effectiveSuccessRate *= (1 + coopBonus);
    // Cap at 95% max success rate
    effectiveSuccessRate = Math.min(effectiveSuccessRate, 0.95);
  }

  // Calculate success (random based on success rate)
  const successRoll = random();
  const isSuccess = successRoll < effectiveSuccessRate;

  // Apply energy cost regardless of success
  const newEnergy = agent.energy - config.energyCost;

  if (!isSuccess) {
    // Failed to find anything
    await storeMemory({
      agentId: agent.id,
      type: 'action',
      content: `Foraged at (${agent.x}, ${agent.y}) but found nothing useful.`,
      importance: 2,
      emotionalValence: -0.1,
      x: agent.x,
      y: agent.y,
      tick: intent.tick,
    });

    return {
      success: true, // Action succeeded, just didn't find food
      changes: {
        energy: newEnergy,
      },
      events: [
        {
          id: uuid(),
          type: 'agent_forage',
          tick: intent.tick,
          timestamp: Date.now(),
          agentId: agent.id,
          payload: {
            position: { x: agent.x, y: agent.y },
            found: false,
            foodFound: 0,
            energyCost: config.energyCost,
            newEnergy,
            nearbyForagers: nearbyForagerCount,
            effectiveSuccessRate: Math.round(effectiveSuccessRate * 100),
          },
        },
      ],
    };
  }

  // Success! Add food to inventory
  const foodFound = config.foodYield;
  await addToInventory(agent.id, 'food', foodFound);

  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Foraged at (${agent.x}, ${agent.y}) and found ${foodFound} food! A lucky find.`,
    importance: 4,
    emotionalValence: nearbyForagerCount > 0 ? 0.5 : 0.3, // Higher satisfaction when cooperating
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: {
      energy: newEnergy,
    },
    events: [
      {
        id: uuid(),
        type: 'agent_forage',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          position: { x: agent.x, y: agent.y },
          found: true,
          foodFound,
          energyCost: config.energyCost,
          newEnergy,
          nearbyForagers: nearbyForagerCount,
          effectiveSuccessRate: Math.round(effectiveSuccessRate * 100),
        },
      },
    ],
  };
}
