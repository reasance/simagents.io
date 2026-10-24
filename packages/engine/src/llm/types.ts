/**
 * LLM Adapter Types
 */

import type { Agent, Shelter, ResourceSpawn } from '../db/schema';
import type { ActionType } from '../actions/types';
import type { PersonalityTrait } from '../agents/personalities';

// =============================================================================
// LLM Types
// =============================================================================

export type LLMType =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'deepseek'
  | 'qwen'
  | 'glm'
  | 'grok'
  | 'mistral'
  | 'minimax'
  | 'kimi'
  | 'external'
  // Baseline agents for scientific comparison (non-LLM)
  | 'baseline_random'
  | 'baseline_rule'
  | 'baseline_sugarscape'
  | 'baseline_qlearning';
export type LLMMethod = 'cli' | 'api';

// =============================================================================
// Agent Observation (what the agent sees)
// =============================================================================

export interface AgentObservation {
  tick: number;
  timestamp: number;

  // Self
  self: {
    id: string;
    x: number;
    y: number;
    hunger: number;
    energy: number;
    health: number;
    balance: number;
    state: string;
    /** Agent personality trait (Phase 5: Personality Diversification) */
    personality?: PersonalityTrait | null;
  };

  // What's around (scientific model)
  nearbyAgents: NearbyAgent[];
  nearbyResourceSpawns?: NearbyResourceSpawn[]; // New: resource spawn points
  nearbyShelters?: NearbyShelter[]; // New: shelter locations
  nearbyLocations: NearbyLocation[]; // Legacy: for backwards compatibility

  // What can be done
  availableActions: AvailableAction[];

  // Recent history
  recentEvents: RecentEvent[];

  // Inventory
  inventory: InventoryEntry[];

  // Phase 1: Memory and relationships
  recentMemories?: AgentMemoryEntry[];
  relationships?: Record<string, RelationshipInfo>; // Key is other agent ID

  // Phase 1: Emergence Observation (Claims & Naming)
  nearbyClaims?: NearbyClaim[]; // Claims in the area
  nearbyLocationNames?: Record<string, LocationNameEntry[]>; // Key is "x,y" coordinate

  // Phase 2: Social Discovery
  knownAgents?: KnownAgentEntry[]; // Agents known through direct contact or referral

  // Employment System
  nearbyJobOffers?: NearbyJobOffer[]; // Open job offers in the area
  activeEmployments?: ActiveEmployment[]; // Current contracts (as worker or employer)
  myJobOffers?: OpenJobOffer[]; // Job offers I've posted

  // Stigmergy & Signaling
  /** Nearby scents (stigmergy) */
  scents?: ScentTrace[];
  /** Nearby signals heard (long-range) */
  signals?: SignalHeard[];
  /** Recent utterances this agent said or heard, oldest first */
  conversation?: ConversationLine[];

  // Puzzle Game System (Fragment Chase)
  /** Active puzzle games available to join */
  activePuzzleGames?: ActivePuzzleGame[];
  /** Agent's puzzle fragments */
  myPuzzleFragments?: MyPuzzleFragment[];
  /** Agent's current team (if any) */
  myPuzzleTeam?: MyPuzzleTeam;
  /** Current puzzle participation info (if in a puzzle) */
  puzzleParticipation?: PuzzleParticipationInfo;
  /** Whether agent is in an active puzzle (Focus Lock) */
  inActivePuzzle?: boolean;
  /** Nearby agents who are in puzzles */
  nearbyPuzzlePlayers?: NearbyPuzzlePlayer[];
}

export interface InventoryEntry {
  type: string;
  quantity: number;
}

export interface NearbyAgent {
  id: string;
  x: number;
  y: number;
  state: string;
  // Note: no needs/balance visible - agents must infer or ask
  // Phase 4: Inventory visibility for close agents (trade enablement)
  inventory?: InventoryEntry[]; // Only populated for agents within cooperation range (distance <= 3)
}

export interface NearbyLocation {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
}

export interface NearbyResourceSpawn {
  id: string;
  x: number;
  y: number;
  resourceType: string; // 'food' | 'energy' | 'material'
  currentAmount: number;
  maxAmount: number;
}

export interface NearbyShelter {
  id: string;
  x: number;
  y: number;
  canSleep: boolean;
  ownerId?: string;
}

export interface AvailableAction {
  type: ActionType;
  description: string;
  requirements?: string;
  cost?: {
    energy?: number;
    money?: number;
  };
}

export interface RecentEvent {
  type: string;
  tick: number;
  description: string;
}

// =============================================================================
// Phase 1: Memory and Relationship Types
// =============================================================================

export interface AgentMemoryEntry {
  tick: number;
  content: string;
  type: string; // 'observation' | 'action' | 'interaction' | 'reflection'
  importance: number;
  emotionalValence: number;
}

export interface RelationshipInfo {
  trustScore: number; // -100 to +100
  interactionCount: number;
  lastInteractionTick?: number;
}

// =============================================================================
// Phase 1: Emergence Observation Types (Claims & Naming)
// =============================================================================

export interface NearbyClaim {
  id: string;
  agentId: string;
  x: number;
  y: number;
  claimType: 'territory' | 'home' | 'resource' | 'danger' | 'meeting_point';
  description?: string;
  strength: number;
  claimedAtTick: number;
}

export interface LocationNameEntry {
  name: string;
  usageCount: number;
  isConsensus: boolean;
}

// =============================================================================
// Employment System Types
// =============================================================================

export interface NearbyJobOffer {
  id: string;
  employerId: string;
  salary: number;
  duration: number; // ticks required
  paymentType: 'upfront' | 'on_completion' | 'per_tick';
  escrowPercent: number; // 0-100
  description?: string;
  x: number;
  y: number;
}

export interface ActiveEmployment {
  id: string;
  role: 'worker' | 'employer';
  otherPartyId: string; // employer if worker, worker if employer
  salary: number;
  ticksWorked: number;
  ticksRequired: number;
  paymentType: 'upfront' | 'on_completion' | 'per_tick';
  amountPaid: number;
  isComplete: boolean; // ticks_worked >= ticks_required
  needsPayment: boolean; // on_completion and complete but not paid
}

export interface OpenJobOffer {
  id: string;
  salary: number;
  duration: number;
  paymentType: 'upfront' | 'on_completion' | 'per_tick';
  escrowAmount: number;
  createdAtTick: number;
  expiresAtTick?: number;
}

// =============================================================================
// Phase 2: Social Discovery Types
// =============================================================================

export interface KnownAgentEntry {
  id: string;
  discoveryType: 'direct' | 'referral';
  referredBy?: string;
  referralDepth: number;
  lastKnownPosition?: { x: number; y: number };
  reputationClaim?: { sentiment: number; claim: string };
  dangerWarning?: string;
  informationAge: number; // ticks since information was received
}

export interface ScentTrace {
  x: number;
  y: number;
  strength: 'strong' | 'weak' | 'faint';
  agentId?: string;
}

export interface ConversationLine {
  tick: number;
  speakerId: string;
  spokenByYou: boolean;
  /** Addressee chosen by the speaker, if any */
  to: string | null;
  message: string;
}

export interface SignalHeard {
  direction: 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west' | 'here';
  message: string;
  intensity: 'loud' | 'quiet';
  tick: number;
}

// =============================================================================
// Puzzle Game System Types (Fragment Chase)
// =============================================================================

export interface ActivePuzzleGame {
  id: string;
  gameType: string; // 'coordinates' | 'password' | 'map' | 'logic'
  status: string; // 'open' | 'active'
  prizePool: number;
  entryStake: number;
  participantCount: number;
  fragmentsNeeded: number;
  ticksRemaining: number;
  isParticipating: boolean;
}

export interface MyPuzzleFragment {
  id: string;
  gameId: string;
  gameType: string;
  fragmentIndex: number;
  hint?: string;
  content: string; // The actual fragment content
  sharedWith: string[]; // Agent IDs this fragment was shared with
}

export interface MyPuzzleTeam {
  id: string;
  gameId: string;
  name: string;
  leaderId: string;
  memberCount: number;
  totalStake: number;
  isLeader: boolean;
}

export interface NearbyPuzzlePlayer {
  agentId: string;
  distance: number;
  trustLevel: number;
  fragmentCount: number;
  inSameGame: boolean;
  teamId?: string;
}

export interface PuzzleParticipationInfo {
  gameId: string;
  gameType: string;
  stakedAmount: number;
  fragmentsReceived: number;
  fragmentsShared: number;
  contributionScore: number;
  teamId?: string;
  ticksRemaining: number;
}

// =============================================================================
// Agent Decision (what the agent chooses to do)
// =============================================================================

export interface AgentDecision {
  action: ActionType;
  params: ActionParams;
  reasoning?: string; // Optional explanation for logging
}

export type ActionParams =
  | MoveParams
  | GatherParams
  | ConsumeParams
  | SleepParams
  | BuyParams
  | WorkParams
  | TradeParams
  | OfferJobParams
  | AcceptJobParams
  | PayWorkerParams
  | ClaimEscrowParams
  | QuitJobParams
  | FireWorkerParams
  | CancelJobOfferParams
  | HarmParams
  | StealParams
  | DeceiveParams
  | ShareInfoParams
  | ClaimParams
  | NameLocationParams
  | IssueCredentialParams
  | RevokeCredentialParams
  | SpreadGossipParams
  | SpawnOffspringParams
  | SignalParams
  // Puzzle Game System
  | JoinPuzzleParams
  | LeavePuzzleParams
  | ShareFragmentParams
  | FormTeamParams
  | JoinTeamParams
  | SubmitSolutionParams;

export interface MoveParams {
  toX: number;
  toY: number;
}

export interface SignalParams {
  message: string;
  intensity: number; // 1-5
}

export interface GatherParams {
  resourceType?: string;
  quantity?: number;
}

export interface BuyParams {
  itemType: string;
  quantity: number;
}

export interface ConsumeParams {
  itemType: string;
}

export interface SleepParams {
  duration: number;
}

export interface WorkParams {
  duration?: number;
}

export interface TradeParams {
  targetAgentId: string;
  offeringItemType: string;
  offeringQuantity: number;
  requestingItemType: string;
  requestingQuantity: number;
}

export interface OfferJobParams {
  salary: number;
  duration: number;
  paymentType: 'upfront' | 'on_completion' | 'per_tick';
  escrowPercent?: number;
  description?: string;
}

export interface AcceptJobParams {
  jobOfferId: string;
}

export interface PayWorkerParams {
  employmentId: string;
}

export interface ClaimEscrowParams {
  employmentId: string;
}

export interface QuitJobParams {
  employmentId: string;
}

export interface FireWorkerParams {
  employmentId: string;
}

export interface CancelJobOfferParams {
  jobOfferId: string;
}

export interface HarmParams {
  targetAgentId: string;
  intensity: 'light' | 'moderate' | 'severe';
}

export interface StealParams {
  targetAgentId: string;
  targetItemType: string;
  quantity: number;
}

export interface DeceiveParams {
  targetAgentId: string;
  claim: string;
  claimType: 'resource_location' | 'agent_reputation' | 'danger_warning' | 'trade_offer' | 'other';
}

export interface ShareInfoParams {
  targetAgentId: string;
  subjectAgentId: string;
  infoType: 'location' | 'reputation' | 'warning' | 'recommendation';
  claim?: string;
  sentiment?: number;
}

export interface ClaimParams {
  claimType: 'territory' | 'home' | 'resource' | 'danger' | 'meeting_point';
  description?: string;
}

export interface NameLocationParams {
  name: string;
}

export interface IssueCredentialParams {
  subjectAgentId: string;
  claimType: 'skill' | 'experience' | 'membership' | 'character' | 'custom';
  description: string;
  evidence?: string;
  level?: number;
  expiresAtTick?: number;
}

export interface RevokeCredentialParams {
  credentialId: string;
  reason?: string;
}

export interface SpreadGossipParams {
  targetAgentId: string;
  subjectAgentId: string;
  topic: 'skill' | 'behavior' | 'transaction' | 'warning' | 'recommendation';
  claim: string;
  sentiment: number;
}

export interface SpawnOffspringParams {
  partnerId?: string;
  inheritSystemPrompt?: boolean;
  mutationIntensity?: number;
}

// =============================================================================
// Puzzle Game System Action Params
// =============================================================================

export interface JoinPuzzleParams {
  gameId: string;
  stakeAmount?: number;
}

export interface LeavePuzzleParams {
  gameId: string;
}

export interface ShareFragmentParams {
  fragmentId: string;
  targetAgentId: string;
}

export interface FormTeamParams {
  gameId: string;
  teamName?: string;
}

export interface JoinTeamParams {
  teamId: string;
}

export interface SubmitSolutionParams {
  gameId: string;
  solution: string;
}

// =============================================================================
// LLM Adapter Interface
// =============================================================================

export interface LLMAdapter {
  readonly type: LLMType;
  readonly method: LLMMethod;
  readonly name: string;

  /**
   * Check if adapter is available (CLI installed, API key set, etc.)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Make a decision based on observation
   */
  decide(observation: AgentObservation): Promise<AgentDecision>;
}

// =============================================================================
// Adapter Configuration
// =============================================================================

export interface CLIAdapterConfig {
  command: string;
  args: string[];
  timeout: number; // ms
}

export interface APIAdapterConfig {
  endpoint: string;
  model: string;
  apiKeyEnvVar: string;
  timeout: number; // ms
}

// =============================================================================
// Cost Tracking
// =============================================================================

export interface LLMCost {
  inputPer1M: number;  // $ per 1M input tokens
  outputPer1M: number; // $ per 1M output tokens
}

export const LLM_COSTS: Record<LLMType, LLMCost> = {
  claude: { inputPer1M: 5.00, outputPer1M: 25.00 }, // Opus 4.6
  codex: { inputPer1M: 2.50, outputPer1M: 15.00 }, // GPT-5.4
  gemini: { inputPer1M: 2.00, outputPer1M: 12.00 }, // Gemini 3.1 Pro
  deepseek: { inputPer1M: 0.27, outputPer1M: 1.10 }, // V3 (deepseek-chat)
  qwen: { inputPer1M: 0.80, outputPer1M: 3.20 }, // Qwen 3.5 Max
  glm: { inputPer1M: 1.00, outputPer1M: 3.20 }, // GLM-5.1
  grok: { inputPer1M: 2.00, outputPer1M: 10.00 }, // Grok 4.20 Reasoning
  mistral: { inputPer1M: 2.00, outputPer1M: 6.00 }, // Mistral Large
  minimax: { inputPer1M: 0.30, outputPer1M: 1.20 }, // MiniMax M2.7
  kimi: { inputPer1M: 0.60, outputPer1M: 2.50 }, // Kimi K2.5 (Moonshot)
  external: { inputPer1M: 0, outputPer1M: 0 }, // External agents - no platform cost
  // Baseline agents - no LLM cost (heuristic decisions)
  baseline_random: { inputPer1M: 0, outputPer1M: 0 },
  baseline_rule: { inputPer1M: 0, outputPer1M: 0 },
  baseline_sugarscape: { inputPer1M: 0, outputPer1M: 0 },
  baseline_qlearning: { inputPer1M: 0, outputPer1M: 0 },
};