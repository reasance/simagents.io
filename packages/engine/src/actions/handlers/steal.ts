/**
 * Steal Action Handler - Phase 2: Conflict Actions
 *
 * Take items from another agent's inventory without consent.
 * System imposes:
 * - Adjacency requirement
 * - Energy cost
 * - Success probability
 * - Item transfer
 *
 * EMERGENT: Property rights, punishment, guards, locks - all emerge from agent behavior.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, StealParams } from '../types';
import type { Agent } from '../../db/schema';
import { getAgentById } from '../../db/queries/agents';
import { getInventoryItem, addToInventory, removeFromInventory } from '../../db/queries/inventory';
import { updateRelationshipTrust, storeMemory } from '../../db/queries/memories';
import { checkIsRetaliation, recordRetaliationChain } from '../../db/queries/roles';
import { getDistance } from '../../world/grid';
import { findWitnesses } from '../utils/witnesses';
import { getRuntimeConfig } from '../../config';
import { random } from '../../utils/random';

// Hunger cost for stealing (sneaking is tiring)
const HUNGER_COST = 2;

export async function handleSteal(
  intent: ActionIntent<StealParams>,
  agent: Agent
): Promise<ActionResult> {
  const { targetAgentId, targetItemType, quantity } = intent.params;

  // Validate quantity
  if (quantity < 1) {
    return { success: false, error: 'Quantity must be at least 1' };
  }

  if (quantity > getRuntimeConfig().actions.steal.maxItemsPerAction) {
    return {
      success: false,
      error: `Cannot take more than ${getRuntimeConfig().actions.steal.maxItemsPerAction} items at once`,
    };
  }

  // Cannot steal from self
  if (targetAgentId === agent.id) {
    return { success: false, error: 'Cannot take from yourself' };
  }

  // Get target agent
  const targetAgent = await getAgentById(targetAgentId);
  if (!targetAgent) {
    return { success: false, error: 'Target agent not found' };
  }

  if (targetAgent.state === 'dead') {
    return { success: false, error: 'Cannot take from a dead agent' };
  }

  // Check distance
  const distance = getDistance(
    { x: agent.x, y: agent.y },
    { x: targetAgent.x, y: targetAgent.y }
  );
  if (distance > getRuntimeConfig().actions.steal.maxDistance) {
    return {
      success: false,
      error: `Target too far (distance: ${distance}, max: ${getRuntimeConfig().actions.steal.maxDistance})`,
    };
  }

  // Check energy
  const energyCost = getRuntimeConfig().actions.steal.energyCost;
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy (have: ${agent.energy}, need: ${energyCost})`,
    };
  }

  // Check target has the item
  const targetItem = await getInventoryItem(targetAgentId, targetItemType);
  if (!targetItem || targetItem.quantity < quantity) {
    return {
      success: false,
      error: `Target doesn't have ${quantity}x ${targetItemType} (has: ${targetItem?.quantity ?? 0})`,
    };
  }

  // Calculate success probability
  // Higher if target is sleeping, lower if target has more health
  const sleepBonus = targetAgent.state === 'sleeping' ? 0.2 : 0;
  const healthPenalty = (targetAgent.health / 100) * 0.2;
  const successRate = getRuntimeConfig().actions.steal.baseSuccessRate + sleepBonus - healthPenalty;
  const succeeded = random() < Math.min(successRate, 0.9);

  // Energy and hunger consumed regardless
  const newEnergy = Math.max(0, agent.energy - energyCost);
  const newHunger = Math.max(0, agent.hunger - HUNGER_COST);

  // Find witnesses
  const witnesses = await findWitnesses(
    agent.id,
    targetAgentId,
    { x: agent.x, y: agent.y },
    getRuntimeConfig().actions.steal.witnessRadius
  );

  if (succeeded) {
    // Transfer items
    await removeFromInventory(targetAgentId, targetItemType, quantity);
    await addToInventory(agent.id, targetItemType, quantity);

    // Track retaliation chain
    const retaliationCheck = await checkIsRetaliation(agent.id, targetAgentId);
    if (retaliationCheck.isRetaliation) {
      await recordRetaliationChain(
        agent.id,
        targetAgentId,
        'steal',
        intent.tick,
        retaliationCheck.existingChainId,
        retaliationCheck.depth
      );
    } else {
      // Start a new potential chain (depth 0 = initial attack)
      await recordRetaliationChain(agent.id, targetAgentId, 'steal', intent.tick, null, 0);
    }

    // Update victim trust
    await updateRelationshipTrust(
      targetAgentId,
      agent.id,
      getRuntimeConfig().actions.steal.trustImpactVictim,
      intent.tick,
      `Stole ${quantity}x ${targetItemType} from me`
    );

    // Store memories
    await storeMemory({
      agentId: targetAgentId,
      type: 'interaction',
      content: `Another agent took ${quantity}x ${targetItemType} from me.`,
      importance: 8,
      emotionalValence: -0.9,
      involvedAgentIds: [agent.id],
      x: targetAgent.x,
      y: targetAgent.y,
      tick: intent.tick,
    });

    await storeMemory({
      agentId: agent.id,
      type: 'action',
      content: `Took ${quantity}x ${targetItemType} from another agent.`,
      importance: 6,
      emotionalValence: 0.2, // Slight positive - got items
      involvedAgentIds: [targetAgentId],
      x: agent.x,
      y: agent.y,
      tick: intent.tick,
    });

    // Witness processing
    for (const witness of witnesses) {
      await updateRelationshipTrust(
        witness.id,
        agent.id,
        getRuntimeConfig().actions.steal.trustImpactWitness,
        intent.tick,
        `Witnessed stealing from another agent`
      );

      await storeMemory({
        agentId: witness.id,
        type: 'observation',
        content: `Saw an agent take items from another agent.`,
        importance: 5,
        emotionalValence: -0.5,
        involvedAgentIds: [agent.id, targetAgentId],
        x: witness.x,
        y: witness.y,
        tick: intent.tick,
      });
    }

    return {
      success: true,
      changes: { energy: newEnergy, hunger: newHunger },
      events: [
        {
          id: uuid(),
          type: 'agent_stole',
          tick: intent.tick,
          timestamp: Date.now(),
          agentId: agent.id,
          payload: {
            thiefId: agent.id,
            victimId: targetAgentId,
            itemType: targetItemType,
            quantity,
            witnessIds: witnesses.map((w) => w.id),
            position: { x: agent.x, y: agent.y },
            energyCost,
            hungerCost: HUNGER_COST,
          },
        },
      ],
    };
  } else {
    // Theft failed - victim knows about the attempt
    await updateRelationshipTrust(
      targetAgentId,
      agent.id,
      Math.floor(getRuntimeConfig().actions.steal.trustImpactVictim / 2),
      intent.tick,
      `Attempted to steal from me`
    );

    await storeMemory({
      agentId: targetAgentId,
      type: 'interaction',
      content: `Stopped another agent from taking something of mine.`,
      importance: 7,
      emotionalValence: -0.7,
      involvedAgentIds: [agent.id],
      x: targetAgent.x,
      y: targetAgent.y,
      tick: intent.tick,
    });

    await storeMemory({
      agentId: agent.id,
      type: 'action',
      content: `Tried to take ${targetItemType} from another agent but was stopped.`,
      importance: 5,
      emotionalValence: -0.4,
      involvedAgentIds: [targetAgentId],
      x: agent.x,
      y: agent.y,
      tick: intent.tick,
    });

    return {
      success: false,
      changes: { energy: newEnergy, hunger: newHunger },
      error: 'The other agent stopped you',
      events: [
        {
          id: uuid(),
          type: 'agent_steal_failed',
          tick: intent.tick,
          timestamp: Date.now(),
          agentId: agent.id,
          payload: {
            thiefId: agent.id,
            victimId: targetAgentId,
            targetItemType,
            quantity,
            position: { x: agent.x, y: agent.y },
            energyCost,
            hungerCost: HUNGER_COST,
          },
        },
      ],
    };
  }
}
