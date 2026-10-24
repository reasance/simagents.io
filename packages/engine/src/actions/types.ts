/**
 * Action type definitions
 */

import type { Agent } from '../db/schema';
import type { WorldEvent } from '../cache/pubsub';

// =============================================================================
// Action Types
// =============================================================================

export type ActionType =
  | 'move'
  | 'buy'
  | 'consume'
  | 'sleep'
  | 'work'
  | 'gather'
  | 'forage'
  | 'public_work'
  | 'trade'
  // Phase 1: Emergence Observation
  | 'claim'
  | 'name_location'
  // Phase 2: Conflict Actions
  | 'harm'
  | 'steal'
  | 'deceive'
  // Phase 2: Social Discovery
  | 'share_info'
  | 'signal' // Long-range communication
  | 'speak' // Free speech heard by everyone within earshot
  | 'give' // Hand items or currency to an agent within reach
  // Phase 4: Verifiable Credentials (§34)
  | 'issue_credential'
  | 'revoke_credential'
  // Phase 4: Gossip Protocol (§35)
  | 'spread_gossip'
  // Phase 4: Reproduction (§36)
  | 'spawn_offspring'
  // Employment System
  | 'offer_job'
  | 'accept_job'
  | 'pay_worker'
  | 'claim_escrow'
  | 'quit_job'
  | 'fire_worker'
  | 'cancel_job_offer'
  // Puzzle Game System (Fragment Chase)
  | 'join_puzzle'
  | 'leave_puzzle'
  | 'share_fragment'
  | 'form_team'
  | 'join_team'
  | 'submit_solution';

// =============================================================================
// Action Parameters
// =============================================================================

export interface MoveParams {
  toX: number;
  toY: number;
}

export interface BuyParams {
  itemType: string;
  quantity?: number;
  locationId?: string;
}

export interface ConsumeParams {
  itemType: string;
  quantity?: number;
}

export interface SleepParams {
  duration: number; // in ticks
}

export interface WorkParams {
  locationId?: string; // Optional - work can happen anywhere
  duration?: number; // in ticks
}

export interface GatherParams {
  resourceType?: string; // Optional - if not specified, gather any available
  quantity?: number; // How much to try to gather (default: 1)
}

export type ForageParams = Record<string, never>;

export interface PublicWorkParams {
  taskType?: 'road_maintenance' | 'resource_survey' | 'shelter_cleanup';
}

export interface TradeParams {
  targetAgentId: string; // Agent to trade with
  offeringItemType: string; // What we're offering
  offeringQuantity: number; // How much we're offering
  requestingItemType: string; // What we want in return
  requestingQuantity: number; // How much we want
}

// Phase 2: Conflict Action Parameters

export interface HarmParams {
  targetAgentId: string; // Agent to attack
  intensity: 'light' | 'moderate' | 'severe'; // Damage level
}

export interface StealParams {
  targetAgentId: string; // Agent to steal from
  targetItemType: string; // What to steal
  quantity: number; // How much to steal
}

export interface DeceiveParams {
  targetAgentId: string; // Agent to deceive
  claim: string; // The false information
  claimType: 'resource_location' | 'agent_reputation' | 'danger_warning' | 'trade_offer' | 'other';
}

// Phase 2: Social Discovery Parameters

export interface ShareInfoParams {
  targetAgentId: string; // Who we're talking to
  subjectAgentId: string; // Who we're talking about
  infoType: 'location' | 'reputation' | 'warning' | 'recommendation';
  claim?: string; // Optional description/claim
  sentiment?: number; // -100 to +100, opinion of the subject
  position?: { x: number; y: number }; // Optional last known position
}

// Phase 1: Emergence Observation Parameters

export interface ClaimParams {
  claimType: 'territory' | 'home' | 'resource' | 'danger' | 'meeting_point';
  description?: string; // Optional reason/description for the claim
  x?: number; // Position to claim (default: current position)
  y?: number;
}

export interface NameLocationParams {
  name: string; // The name to give
  x?: number; // Position to name (default: current position)
  y?: number;
}

// Phase 4: Verifiable Credentials Parameters (§34)

export interface IssueCredentialParams {
  subjectAgentId: string; // Agent receiving the credential
  claimType: 'skill' | 'experience' | 'membership' | 'character' | 'custom';
  description: string; // "Can cook Italian food", "Member of Builders Guild"
  evidence?: string; // "Worked at Restaurant X for 100 ticks"
  level?: number; // 1-10 proficiency (optional)
  expiresAtTick?: number; // Optional expiration
}

export interface RevokeCredentialParams {
  credentialId: string; // ID of credential to revoke
}

// Phase 4: Gossip Protocol Parameters (§35)

export interface SpreadGossipParams {
  targetAgentId: string; // Who to tell
  subjectAgentId: string; // Who gossip is about
  topic: 'skill' | 'behavior' | 'transaction' | 'warning' | 'recommendation';
  claim: string; // The gossip content
  sentiment: number; // -100 to +100
  evidenceEventId?: number; // Link to verifiable event
}

// Phase 4: Reproduction Parameters (§36)

export interface SpawnOffspringParams {
  partnerId?: string; // Optional second parent
  inheritSystemPrompt?: boolean; // Default: true
  mutationIntensity?: number; // 0.0 (no mutations) to 1.0 (heavy mutations)
}

// Signal Parameters (Long-range communication)

export interface SignalParams {
  message: string; // The signal message
  intensity: number; // 1-5, affects range
}

// Speech Parameters (local, free text)

export interface SpeakParams {
  message: string; // Free text, heard by every agent within earshot
  to?: string; // Optional addressee; must be within earshot
}

export interface GiveParams {
  targetAgentId: string;
  itemType: string; // An inventory item type, or 'CITY' for currency
  quantity: number;
}

// Employment System Parameters

export interface OfferJobParams {
  salary: number; // Total CITY offered
  duration: number; // Ticks of work required
  paymentType: 'upfront' | 'on_completion' | 'per_tick';
  escrowPercent?: number; // 0-100, % of salary locked as guarantee
  expiresInTicks?: number; // null = never expires
  description?: string; // Optional job description (emergent)
}

export interface AcceptJobParams {
  jobOfferId: string; // ID of the job offer to accept
}

export interface PayWorkerParams {
  employmentId: string; // ID of the employment to pay
}

export interface ClaimEscrowParams {
  employmentId: string; // ID of the employment to claim escrow from
}

export interface QuitJobParams {
  employmentId: string; // ID of the employment to quit
}

export interface FireWorkerParams {
  employmentId: string; // ID of the employment to terminate
}

export interface CancelJobOfferParams {
  jobOfferId: string; // ID of the job offer to cancel
}

// Puzzle Game System Parameters (Fragment Chase)

export interface JoinPuzzleParams {
  gameId: string; // ID of the puzzle game to join
  stakeAmount?: number; // Optional custom stake (default: game's entry stake)
}

export interface LeavePuzzleParams {
  gameId: string; // ID of the puzzle game to leave
}

export interface ShareFragmentParams {
  fragmentId: string; // ID of the fragment to share
  targetAgentId: string; // Agent to share with
}

export interface FormTeamParams {
  gameId: string; // ID of the puzzle game
  teamName?: string; // Optional team name
}

export interface JoinTeamParams {
  teamId: string; // ID of the team to join
}

export interface SubmitSolutionParams {
  gameId: string; // ID of the puzzle game
  solution: string; // The proposed solution
}

export type ActionParams =
  | MoveParams
  | BuyParams
  | ConsumeParams
  | SleepParams
  | WorkParams
  | GatherParams
  | ForageParams
  | PublicWorkParams
  | TradeParams
  | ClaimParams
  | NameLocationParams
  | HarmParams
  | StealParams
  | DeceiveParams
  | ShareInfoParams
  | SignalParams
  | SpeakParams
  | GiveParams
  // Phase 4
  | IssueCredentialParams
  | RevokeCredentialParams
  | SpreadGossipParams
  | SpawnOffspringParams
  // Employment System
  | OfferJobParams
  | AcceptJobParams
  | PayWorkerParams
  | ClaimEscrowParams
  | QuitJobParams
  | FireWorkerParams
  | CancelJobOfferParams
  // Puzzle Game System
  | JoinPuzzleParams
  | LeavePuzzleParams
  | ShareFragmentParams
  | FormTeamParams
  | JoinTeamParams
  | SubmitSolutionParams;

// =============================================================================
// Action Intent
// =============================================================================

export interface ActionIntent<T extends ActionParams = ActionParams> {
  agentId: string;
  type: ActionType;
  params: T;
  tick: number;
  timestamp: number;
}

// =============================================================================
// Validation
// =============================================================================

export interface ActionValidation {
  valid: boolean;
  reason?: string;
  estimatedCost?: {
    energy: number;
    money: number;
    time: number; // ticks
  };
}

// =============================================================================
// Execution Result
// =============================================================================

export interface ActionResult {
  durationMs?: number;
  success: boolean;
  changes?: Partial<Agent>;
  events?: WorldEvent[];
  error?: string;
}

// =============================================================================
// Action Handler
// =============================================================================

export type ActionHandler<T extends ActionParams = ActionParams> = (
  intent: ActionIntent<T>,
  agent: Agent
) => Promise<ActionResult>;
