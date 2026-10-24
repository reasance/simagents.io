/**
 * Give Action Handler (Unilateral Transfer)
 *
 * Hands items or CITY the actor holds to an agent within reach. Nothing is
 * asked in return and the recipient does not have to accept; any exchange
 * that follows is up to the agents themselves.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, GiveParams } from '../types';
import type { Agent } from '../../db/schema';
import { getAgentById, updateAgentBalance } from '../../db/queries/agents';
import { addToInventory, removeFromInventoryIfAtLeast } from '../../db/queries/inventory';
import { getDistance } from '../../world/grid';
import { getRuntimeConfig } from '../../config';

export const CURRENCY_ITEM = 'CITY';

export async function handleGive(
  intent: ActionIntent<GiveParams>,
  agent: Agent
): Promise<ActionResult> {
  const { targetAgentId, itemType, quantity } = intent.params;
  if (!Number.isInteger(quantity) || quantity < 1) return { success: false, error: 'Quantity must be a whole number of at least 1' };
  if (targetAgentId === agent.id) return { success: false, error: 'Cannot give to yourself' };

  const target = await getAgentById(targetAgentId);
  if (!target || target.state === 'dead') return { success: false, error: 'Nobody alive by that id' };
  const maxDistance = getRuntimeConfig().actions.give.maxDistance;
  if (getDistance({ x: agent.x, y: agent.y }, { x: target.x, y: target.y }) > maxDistance) {
    return { success: false, error: `Too far to hand anything over (max ${maxDistance} cell)` };
  }

  let changes: ActionResult['changes'];
  if (itemType === CURRENCY_ITEM) {
    if (agent.balance < quantity) return { success: false, error: `You hold only ${agent.balance} ${CURRENCY_ITEM}` };
    await updateAgentBalance(target.id, target.balance + quantity);
    changes = { balance: agent.balance - quantity };
  } else {
    if (!(await removeFromInventoryIfAtLeast(agent.id, itemType, quantity))) return { success: false, error: `You do not carry ${quantity} ${itemType}` };
    await addToInventory(target.id, itemType, quantity);
  }

  const timestamp = Date.now();
  const payload = { giverId: agent.id, recipientId: target.id, itemType, quantity };
  return {
    success: true,
    changes,
    events: [
      { id: uuid(), type: 'agent_gave', tick: intent.tick, timestamp, agentId: agent.id, payload },
      { id: uuid(), type: 'agent_received', tick: intent.tick, timestamp, agentId: target.id, payload },
    ],
  };
}
