/**
 * Claim Escrow Action Handler
 *
 * Allows a worker to claim the escrow amount when an employer fails to pay
 * for a completed on_completion contract.
 *
 * Flow:
 * 1. Validate employment exists and caller is the worker
 * 2. Verify work is complete
 * 3. Check that payment is overdue (employer had chance to pay)
 * 4. Transfer escrow to worker
 * 5. Mark employment as unpaid
 * 6. Severely penalize employer's trust
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, ClaimEscrowParams } from '../types';
import type { Agent } from '../../db/schema';
import {
  getEmploymentById,
  updateEmploymentStatusAndPayment,
} from '../../db/queries/employment';
import { getAgentById, updateAgentBalance } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';

// How many ticks after work completion before worker can claim escrow
const PAYMENT_GRACE_PERIOD = 10;

export async function handleClaimEscrow(
  intent: ActionIntent<ClaimEscrowParams>,
  agent: Agent
): Promise<ActionResult> {
  const { employmentId } = intent.params;

  // Get the employment record
  const employment = await getEmploymentById(employmentId);
  if (!employment) {
    return {
      success: false,
      error: `Employment not found: ${employmentId}`,
    };
  }

  // Verify caller is the worker
  if (employment.workerId !== agent.id) {
    return {
      success: false,
      error: 'Only the worker can claim escrow for this contract',
    };
  }

  // Check if this is an on_completion contract with escrow
  if (employment.paymentType !== 'on_completion') {
    return {
      success: false,
      error: `This contract uses ${employment.paymentType} payment. Escrow claim not applicable.`,
    };
  }

  if (employment.escrowAmount <= 0) {
    return {
      success: false,
      error: 'No escrow was deposited for this contract',
    };
  }

  // Check if work is complete
  if (employment.ticksWorked < employment.ticksRequired) {
    return {
      success: false,
      error: `Work not complete: ${employment.ticksWorked}/${employment.ticksRequired} ticks done`,
    };
  }

  // Check if already resolved
  if (employment.status !== 'active') {
    return {
      success: false,
      error: `Contract already resolved with status: ${employment.status}`,
    };
  }

  // Calculate when work was completed (rough estimate)
  const workCompletedTick = (employment.endedAtTick ?? intent.tick);
  const ticksSinceCompletion = intent.tick - workCompletedTick;

  // Check grace period (employer had time to pay)
  if (ticksSinceCompletion < PAYMENT_GRACE_PERIOD) {
    return {
      success: false,
      error: `Must wait ${PAYMENT_GRACE_PERIOD - ticksSinceCompletion} more ticks before claiming escrow. Employer may still pay.`,
    };
  }

  // Get employer for trust update
  const employer = await getAgentById(employment.employerId);

  // Transfer escrow to worker
  const escrowAmount = employment.escrowAmount;
  const newWorkerBalance = agent.balance + escrowAmount;
  await updateAgentBalance(agent.id, newWorkerBalance);

  // Mark employment as unpaid
  await updateEmploymentStatusAndPayment(employmentId, 'unpaid', employment.amountPaid + escrowAmount, intent.tick);

  // Severe trust penalty for employer
  if (employer) {
    await updateRelationshipTrust(agent.id, employer.id, -30, intent.tick, 'Failed to pay for completed work');
    await updateRelationshipTrust(employer.id, agent.id, -10, intent.tick, 'Did not pay worker');

    // Store employer memory
    await storeMemory({
      agentId: employer.id,
      type: 'interaction',
      content: `${agent.id.slice(0, 8)} claimed ${escrowAmount.toFixed(1)} CITY escrow after I failed to pay.`,
      importance: 8,
      emotionalValence: -0.6,
      involvedAgentIds: [agent.id],
      x: employer.x,
      y: employer.y,
      tick: intent.tick,
    });
  }

  // Store worker memory
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Claimed ${escrowAmount.toFixed(1)} CITY escrow from ${employer?.id.slice(0, 8) || 'unknown'} who failed to pay. Lost ${(employment.salary - escrowAmount).toFixed(1)} CITY that was owed.`,
    importance: 7,
    emotionalValence: -0.3,
    involvedAgentIds: employer ? [employer.id] : [],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: { balance: newWorkerBalance },
    events: [
      {
        id: uuid(),
        type: 'escrow_claimed',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          employmentId,
          workerId: agent.id,
          employerId: employment.employerId,
          escrowAmount,
          salaryOwed: employment.salary,
          salaryReceived: employment.amountPaid + escrowAmount,
          salaryLost: employment.salary - employment.amountPaid - escrowAmount,
        },
      },
      {
        id: uuid(),
        type: 'balance_changed',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          previousBalance: agent.balance,
          newBalance: newWorkerBalance,
          change: escrowAmount,
          reason: `Escrow claim from ${employer?.id.slice(0, 8) || 'unknown'} (non-payment)`,
        },
      },
      {
        id: uuid(),
        type: 'employer_defaulted',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: employment.employerId,
        payload: {
          employmentId,
          employerId: employment.employerId,
          workerId: agent.id,
          salaryOwed: employment.salary,
          escrowLost: escrowAmount,
        },
      },
    ],
  };
}
