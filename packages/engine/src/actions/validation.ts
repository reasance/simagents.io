import { z } from 'zod';
import { getRuntimeConfig } from '../config';
import type { ActionType } from './types';

const text = z.string().trim().min(1).max(4000);
const id = z.string().min(1).max(256);
const positive = z.number().finite().positive().max(1_000_000);
const ticks = positive.int();
const coordinate = z.number().finite().int().nonnegative();
const sentiment = z.number().finite().min(-100).max(100);
const employment = z.object({ employmentId: id });
const game = z.object({ gameId: id });
const schemas: Record<ActionType, z.ZodObject> = {
  move: z.object({ toX: coordinate, toY: coordinate }),
  buy: z.object({ itemType: text, quantity: positive.optional(), locationId: id.optional() }),
  consume: z.object({ itemType: text, quantity: positive.optional() }),
  sleep: z.object({ duration: ticks.max(10) }),
  work: z.object({ locationId: id.optional(), duration: z.literal(1).optional() }),
  gather: z.object({ resourceType: text.optional(), quantity: positive.optional() }),
  forage: z.object({}),
  public_work: z.object({ taskType: z.enum(['road_maintenance', 'resource_survey', 'shelter_cleanup']).optional() }),
  trade: z.object({ targetAgentId: id, offeringItemType: text, offeringQuantity: positive, requestingItemType: text, requestingQuantity: positive }),
  claim: z.object({ claimType: z.enum(['territory', 'home', 'resource', 'danger', 'meeting_point']), description: text.optional(), x: coordinate.optional(), y: coordinate.optional() }),
  name_location: z.object({ name: text, x: coordinate.optional(), y: coordinate.optional() }),
  harm: z.object({ targetAgentId: id, intensity: z.enum(['light', 'moderate', 'severe']) }),
  steal: z.object({ targetAgentId: id, targetItemType: text, quantity: positive }),
  deceive: z.object({ targetAgentId: id, claim: text, claimType: z.enum(['resource_location', 'agent_reputation', 'danger_warning', 'trade_offer', 'other']) }),
  share_info: z.object({ targetAgentId: id, subjectAgentId: id, infoType: z.enum(['location', 'reputation', 'warning', 'recommendation']), claim: text.optional(), sentiment: sentiment.optional(), position: z.object({ x: coordinate, y: coordinate }).optional() }),
  signal: z.object({ message: text, intensity: z.number().finite().int().min(1).max(5) }),
  give: z.object({ targetAgentId: id, itemType: text.max(100), quantity: positive.int() }),
  speak: z.object({ message: z.string().trim().min(1).max(getRuntimeConfig().actions.speak.maxLength), to: id.optional() }),
  issue_credential: z.object({ subjectAgentId: id, claimType: z.enum(['skill', 'experience', 'membership', 'character', 'custom']), description: text, evidence: text.optional(), level: ticks.max(10).optional(), expiresAtTick: ticks.optional() }),
  revoke_credential: z.object({ credentialId: id }),
  spread_gossip: z.object({ targetAgentId: id, subjectAgentId: id, topic: z.enum(['skill', 'behavior', 'transaction', 'warning', 'recommendation']), claim: text, sentiment, evidenceEventId: ticks.optional() }),
  spawn_offspring: z.object({ partnerId: id.optional(), inheritSystemPrompt: z.boolean().optional(), mutationIntensity: z.number().finite().min(0).max(1).optional() }),
  offer_job: z.object({ salary: positive, duration: ticks, paymentType: z.enum(['upfront', 'on_completion', 'per_tick']), escrowPercent: z.number().finite().min(0).max(100).optional(), expiresInTicks: ticks.optional(), description: text.optional() }),
  accept_job: z.object({ jobOfferId: id }),
  pay_worker: employment,
  claim_escrow: employment,
  quit_job: employment,
  fire_worker: employment,
  cancel_job_offer: z.object({ jobOfferId: id }),
  join_puzzle: game.extend({ stakeAmount: z.number().finite().nonnegative().max(1_000_000).optional() }),
  leave_puzzle: game,
  share_fragment: z.object({ fragmentId: id, targetAgentId: id }),
  form_team: game.extend({ teamName: text.optional() }),
  join_team: z.object({ teamId: id }),
  submit_solution: game.extend({ solution: text }),
};

/** Validate before any handler can mutate inventory, money or relationships. */
export function validateActionParams(type: ActionType, params: unknown): string | undefined {
  const schema = schemas[type];
  if (!schema) return 'Unknown action type';
  const result = schema.strict().safeParse(params);
  if (!result.success) return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  const values = result.data as Record<string, unknown> & { position?: { x: number; y: number } };
  const size = getRuntimeConfig().simulation.gridSize;
  for (const [key, limit] of [['toX', size], ['x', size], ['toY', size], ['y', size]] as const) {
    const value = values[key];
    if (typeof value === 'number' && value >= limit) return `${key} is outside the world`;
  }
  if (values.position && (values.position.x >= size || values.position.y >= size)) return 'Position is outside the world';
  return undefined;
}
