/**
 * Buy Action Handler
 *
 * Purchase items using CITY currency.
 * Requires being at a shelter (trading post).
 *
 * Cost: CITY currency
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, BuyParams } from '../types';
import type { Agent } from '../../db/schema';
import { addToInventory } from '../../db/queries/inventory';
import { getSheltersAtPosition } from '../../db/queries/world';
import { storeMemory, getAgentRelationships } from '../../db/queries/memories';
import { CONFIG, getRuntimeConfig } from '../../config';
import { random } from '../../utils/random';

// Item prices (MVP: simple fixed prices)
const ITEM_PRICES: Record<string, number> = {
  food: 10,
  water: 5,
  medicine: 20,
  tool: 30,
};


export async function handleBuy(
  intent: ActionIntent<BuyParams>,
  agent: Agent
): Promise<ActionResult> {
  const { itemType, quantity = 1 } = intent.params;
  const runtimeConfig = getRuntimeConfig();

  // Validate item type
  const basePrice = ITEM_PRICES[itemType];
  if (basePrice === undefined) {
    return {
      success: false,
      error: `Unknown item type: ${itemType}`,
    };
  }

  // Trust-based pricing: social agents get discounts, antisocial get penalties
  let trustMultiplier = 1.0;
  let trustNote = '';
  const buyConfig = runtimeConfig.cooperation.buy;

  if (runtimeConfig.cooperation.enabled && buyConfig) {
    const relationships = await getAgentRelationships(agent.id);
    if (relationships.length > 0) {
      // Calculate average trust score from all relationships
      const avgTrust = relationships.reduce((sum, r) => sum + r.trustScore, 0) / relationships.length;
      // Trust affects price: -10% at +100 trust, +10% at -100 trust
      const priceModifier = buyConfig.trustPriceModifier ?? 0.001;
      trustMultiplier = 1 - (avgTrust * priceModifier);
      // Clamp to ±10%
      const minDiscount = buyConfig.minTrustDiscount ?? -0.1;
      const maxPenalty = buyConfig.maxTrustPenalty ?? 0.1;
      trustMultiplier = Math.max(1 + minDiscount, Math.min(1 + maxPenalty, trustMultiplier));

      if (avgTrust > 20) {
        trustNote = ` (trusted customer: ${Math.round((1 - trustMultiplier) * 100)}% discount)`;
      } else if (avgTrust < -20) {
        trustNote = ` (untrusted: ${Math.round((trustMultiplier - 1) * 100)}% markup)`;
      }
    }
  }

  // Calculate total cost with trust modifier
  const price = Math.round(basePrice * trustMultiplier);
  const totalCost = price * quantity;

  // Check if agent has enough money
  if (agent.balance < totalCost) {
    return {
      success: false,
      error: `Not enough money: need ${totalCost} CITY, have ${agent.balance}`,
    };
  }

  // Check if agent is at a shelter (required for buying - shelters are trading posts)
  const sheltersHere = await getSheltersAtPosition(agent.x, agent.y);
  if (sheltersHere.length === 0) {
    return {
      success: false,
      error: `Must be at a shelter to buy items. Current position: (${agent.x}, ${agent.y})`,
    };
  }

  // Shelter transaction costs: energy cost and failure chance to encourage trading
  const shelterEnergyCost = CONFIG.actions.buy.energyCost || 2;
  const shelterFailureRate = CONFIG.actions.buy.failureRate || 0.1; // 10% failure rate

  // Check energy cost
  if (agent.energy < shelterEnergyCost) {
    return {
      success: false,
      error: `Not enough energy for shelter transaction: need ${shelterEnergyCost}, have ${agent.energy}`,
    };
  }

  // Check for transaction failure (simulates market instability)
  if (random() < shelterFailureRate) {
    // Transaction failed - still costs energy
    const newEnergy = agent.energy - shelterEnergyCost;

    await storeMemory({
      agentId: agent.id,
      type: 'action',
      content: `Failed to buy ${quantity}x ${itemType} at shelter - transaction failed. Lost ${shelterEnergyCost} energy.`,
      importance: 3,
      emotionalValence: -0.3,
      x: agent.x,
      y: agent.y,
      tick: intent.tick,
    });

    return {
      success: false,
      error: `Shelter transaction failed - market instability. Try trading with other agents instead.`,
      changes: {
        energy: newEnergy,
      },
    };
  }

  // Add items to inventory
  await addToInventory(agent.id, itemType, quantity);

  // Store memory of buying
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Bought ${quantity}x ${itemType} for ${totalCost} CITY at shelter. Cost ${shelterEnergyCost} energy. Balance now ${agent.balance - totalCost} CITY.`,
    importance: 4,
    emotionalValence: trustMultiplier < 1 ? 0.3 : 0.1, // More positive if got discount
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  // Success - return changes and events
  return {
    success: true,
    changes: {
      balance: agent.balance - totalCost,
      energy: agent.energy - shelterEnergyCost,
    },
    events: [
      {
        id: uuid(),
        type: 'agent_bought',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          itemType,
          quantity,
          basePrice,
          unitPrice: price,
          totalCost,
          newBalance: agent.balance - totalCost,
          trustDiscount: Math.round((1 - trustMultiplier) * 100),
        },
      },
      // Also emit balance_changed event
      {
        id: uuid(),
        type: 'balance_changed',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          previousBalance: agent.balance,
          newBalance: agent.balance - totalCost,
          change: -totalCost,
          reason: `Bought ${quantity}x ${itemType}`,
        },
      },
    ],
  };
}
