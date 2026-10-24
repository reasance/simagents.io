export type Nullable<T> = T | null;

export interface WorldState {
  id: number;
  currentTick: number;
  startedAt: Date;
  lastTickAt: Date | null;
  isPaused: boolean;
}

export interface Agent {
  connectionId?: string;
  rosterEntryId?: string;
  id: string;
  tenantId: string | null;
  llmType: string;
  name?: string | null;
  x: number;
  y: number;
  hunger: number;
  energy: number;
  health: number;
  balance: number;
  state: string;
  color: string;
  personality: string | null;
  /** Notes only this agent writes and reads, carried between its decisions */
  privateNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  diedAt: Date | null;
}

export type NewAgent = Partial<Agent> & Pick<Agent, 'llmType'>;

export interface Shelter {
  id: string;
  tenantId: string | null;
  x: number;
  y: number;
  canSleep: boolean;
  ownerAgentId: string | null;
  createdAt: Date | null;
}

export type Location = Shelter;
export type NewShelter = Partial<Shelter> & Pick<Shelter, 'x' | 'y'>;
export type NewLocation = NewShelter;

export interface ResourceSpawn {
  id: string;
  tenantId: string | null;
  x: number;
  y: number;
  biome: string;
  resourceType: string;
  maxAmount: number;
  currentAmount: number;
  regenRate: number;
  discovered: boolean;
  createdAt: Date | null;
}

export type NewResourceSpawn = Partial<ResourceSpawn> &
  Pick<ResourceSpawn, 'x' | 'y' | 'resourceType'>;

export interface InventoryItem {
  id: string;
  tenantId: string | null;
  agentId: string;
  itemType: string;
  quantity: number;
  properties: Record<string, unknown> | null;
  createdAt: Date | null;
}

export type NewInventoryItem = Partial<InventoryItem> &
  Pick<InventoryItem, 'agentId' | 'itemType' | 'quantity'>;

export type EventCategory = 'infrastructure' | 'emergent' | 'puzzle' | 'observation';

export interface Event {
  id: number;
  tenantId: string | null;
  tick: number;
  agentId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  category: EventCategory;
  version: number;
  createdAt: Date;
}

export type NewEvent = Partial<Event> & Pick<Event, 'tick' | 'eventType' | 'payload'>;

export interface AgentMemory {
  id: string;
  tenantId: string | null;
  agentId: string;
  type: string;
  content: string;
  importance: number;
  emotionalValence: number;
  involvedAgentIds: string[];
  x: number | null;
  y: number | null;
  tick: number;
  createdAt: Date;
}

export type NewAgentMemory = Partial<AgentMemory> &
  Pick<AgentMemory, 'agentId' | 'type' | 'content' | 'tick'>;

export interface AgentRelationship {
  id: string;
  tenantId: string | null;
  agentId: string;
  otherAgentId: string;
  trustScore: number;
  interactionCount: number;
  lastInteractionTick: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAgentRelationship = Partial<AgentRelationship> &
  Pick<AgentRelationship, 'agentId' | 'otherAgentId'>;

export interface AgentKnowledge {
  id: string;
  tenantId: string | null;
  agentId: string;
  knownAgentId: string;
  discoveryType: string;
  referredById: string | null;
  referralDepth: number;
  sharedInfo: unknown;
  informationAge: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAgentKnowledge = Partial<AgentKnowledge> &
  Pick<AgentKnowledge, 'agentId' | 'knownAgentId' | 'discoveryType' | 'informationAge'>;

export interface AgentClaim {
  id: string;
  tenantId: string | null;
  agentId: string;
  x: number;
  y: number;
  claimType: string;
  description: string | null;
  strength: number;
  claimedAtTick: number;
  lastReinforcedTick: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAgentClaim = Partial<AgentClaim> &
  Pick<AgentClaim, 'agentId' | 'x' | 'y' | 'claimType' | 'claimedAtTick'>;

export interface LocationName {
  id: string;
  tenantId: string | null;
  x: number;
  y: number;
  name: string;
  namedByAgentId: string;
  usageCount: number;
  namedAtTick: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewLocationName = Partial<LocationName> &
  Pick<LocationName, 'x' | 'y' | 'name' | 'namedByAgentId' | 'namedAtTick'>;

export interface AgentRole {
  id: string;
  tenantId: string | null;
  agentId: string;
  role: string;
  confidence: number;
  detectedAtTick: number;
  updatedAt: Date;
}

export type NewAgentRole = Partial<AgentRole> &
  Pick<AgentRole, 'agentId' | 'role' | 'detectedAtTick'>;

export interface RetaliationChain {
  id: string;
  tenantId: string | null;
  chainId: string;
  attackerId: string;
  victimId: string;
  actionType: string;
  depth: number;
  tick: number;
  createdAt: Date;
}

export type NewRetaliationChain = Partial<RetaliationChain> &
  Pick<RetaliationChain, 'chainId' | 'attackerId' | 'victimId' | 'actionType' | 'tick'>;

export interface AgentCredential {
  id: string;
  tenantId: string | null;
  tick: number;
  issuerId: string;
  issuerSignature: string;
  subjectId: string;
  claimType: string;
  claimDescription: string;
  claimEvidence: string | null;
  claimLevel: number | null;
  expiresAtTick: number | null;
  revoked: boolean;
  revokedAtTick: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAgentCredential = Partial<AgentCredential> &
  Pick<AgentCredential, 'tick' | 'issuerId' | 'issuerSignature' | 'subjectId' | 'claimType' | 'claimDescription'>;

export interface GossipEvent {
  id: number;
  tenantId: string | null;
  tick: number;
  sourceAgentId: string;
  targetAgentId: string;
  subjectAgentId: string;
  topic: string;
  claim: string;
  sentiment: number;
  evidenceEventId: number | null;
  createdAt: Date;
}

export type NewGossipEvent = Partial<GossipEvent> &
  Pick<GossipEvent, 'tick' | 'sourceAgentId' | 'targetAgentId' | 'subjectAgentId' | 'topic' | 'claim' | 'sentiment'>;

export interface InformationBelief {
  id: string;
  tenantId: string | null;
  agentId: string;
  infoHash: string;
  claimType: string;
  claimContent: Record<string, unknown>;
  isTrue: boolean | null;
  sourceAgentId: string | null;
  receivedTick: number;
  actedOnTick: number | null;
  correctedTick: number | null;
  correctionSourceId: string | null;
  spreadCount: number;
  createdAt: Date;
}

export type NewInformationBelief = Partial<InformationBelief> &
  Pick<InformationBelief, 'agentId' | 'infoHash' | 'claimType' | 'claimContent' | 'receivedTick'>;

export interface JobOffer {
  id: string;
  tenantId: string | null;
  employerId: string;
  salary: number;
  duration: number;
  paymentType: string;
  escrowAmount: number;
  description: string | null;
  status: string;
  x: number;
  y: number;
  createdAtTick: number;
  expiresAtTick: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewJobOffer = Partial<JobOffer> &
  Pick<JobOffer, 'employerId' | 'salary' | 'duration' | 'paymentType' | 'x' | 'y' | 'createdAtTick'>;

export interface Employment {
  id: string;
  tenantId: string | null;
  jobOfferId: string;
  employerId: string;
  workerId: string;
  salary: number;
  paymentType: string;
  escrowAmount: number;
  ticksRequired: number;
  ticksWorked: number;
  amountPaid: number;
  status: string;
  startedAtTick: number;
  endedAtTick: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewEmployment = Partial<Employment> &
  Pick<Employment, 'jobOfferId' | 'employerId' | 'workerId' | 'salary' | 'paymentType' | 'ticksRequired' | 'startedAtTick'>;

export interface AgentLineage {
  id: string;
  tenantId: string | null;
  agentId: string;
  generation: number;
  parentIds: string[];
  spawnedAtTick: number;
  spawnedByParentId: string | null;
  systemPromptBase: string | null;
  mutations: unknown[];
  initialBalance: number | null;
  initialEnergy: number | null;
  initialSpawnX: number | null;
  initialSpawnY: number | null;
  inheritedRelationships: unknown[];
  createdAt: Date;
}

export type NewAgentLineage = Partial<AgentLineage> &
  Pick<AgentLineage, 'agentId' | 'spawnedAtTick'>;

export interface ReproductionState {
  mutationIntensity?: number;
  id: string;
  tenantId: string | null;
  parentAgentId: string;
  partnerAgentId: string | null;
  gestationStartTick: number;
  gestationDurationTicks: number;
  offspringAgentId: string | null;
  status: string;
  failureReason: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export type NewReproductionState = Partial<ReproductionState> &
  Pick<ReproductionState, 'parentAgentId' | 'gestationStartTick' | 'gestationDurationTicks' | 'status'>;

export interface PuzzleGame {
  prizeDistribution?: Array<{ agentId: string; amount: number; type: string }>;
  id: string;
  tenantId: string | null;
  gameType: string;
  status: string;
  solution: string;
  solutionHash: string | null;
  prizePool: number;
  entryStake: number;
  maxParticipants: number;
  minParticipants: number;
  fragmentCount: number;
  createdAtTick: number;
  startsAtTick: number | null;
  endsAtTick: number | null;
  winnerId: string | null;
  createdAt: Date | null;
}

export type NewPuzzleGame = Partial<PuzzleGame> &
  Pick<PuzzleGame, 'gameType' | 'solution' | 'createdAtTick'>;

export interface PuzzleTeam {
  id: string;
  gameId: string;
  leaderId: string;
  name: string | null;
  totalStake: number;
  status: string;
  createdAtTick: number;
  createdAt: Date | null;
}

export type NewPuzzleTeam = Partial<PuzzleTeam> &
  Pick<PuzzleTeam, 'gameId' | 'leaderId' | 'createdAtTick'>;

export interface PuzzleFragment {
  id: string;
  gameId: string;
  fragmentIndex: number;
  content: string;
  hint: string | null;
  ownerId: string | null;
  originalOwnerId: string | null;
  sharedWith: string[];
  createdAt: Date | null;
}

export type NewPuzzleFragment = Partial<PuzzleFragment> &
  Pick<PuzzleFragment, 'gameId' | 'fragmentIndex' | 'content'>;

export interface PuzzleParticipant {
  id: string;
  gameId: string;
  agentId: string;
  teamId: string | null;
  stakedAmount: number;
  contributionScore: number;
  fragmentsReceived: number;
  fragmentsShared: number;
  attemptsMade: number;
  joinedAtTick: number;
  status: string;
  createdAt: Date | null;
}

export type NewPuzzleParticipant = Partial<PuzzleParticipant> &
  Pick<PuzzleParticipant, 'gameId' | 'agentId' | 'joinedAtTick'>;

export interface PuzzleAttempt {
  id: string;
  gameId: string;
  submitterId: string;
  teamId: string | null;
  attemptedSolution: string;
  isCorrect: boolean;
  submittedAtTick: number;
  createdAt: Date | null;
}

export type NewPuzzleAttempt = Partial<PuzzleAttempt> &
  Pick<PuzzleAttempt, 'gameId' | 'submitterId' | 'attemptedSolution' | 'submittedAtTick'>;

export interface LedgerEntry {
  id: string;
  tenantId: string | null;
  txId: string;
  tick: number;
  fromAgentId: string | null;
  toAgentId: string | null;
  amount: number;
  category: string;
  description: string | null;
  createdAt: Date;
}

export type NewLedgerEntry = Partial<LedgerEntry> &
  Pick<LedgerEntry, 'txId' | 'tick' | 'amount' | 'category'>;

export interface PromptLog {
  id: number;
  tenantId: string | null;
  agentId: string;
  tick: number;
  systemPrompt: string;
  observationPrompt: string;
  fullPrompt: string;
  decision: { action: string; params?: Record<string, unknown>; reasoning?: string } | null;
  rawResponse: string | null;
  llmType: string;
  personality: string | null;
  promptMode: string;
  safetyLevel: string;
  inputTokens: number | null;
  outputTokens: number | null;
  processingTimeMs: number | null;
  usedFallback: boolean;
  usedCache: boolean;
  createdAt: Date;
}

export type NewPromptLog = Partial<PromptLog> &
  Pick<PromptLog, 'agentId' | 'tick' | 'systemPrompt' | 'observationPrompt' | 'fullPrompt' | 'llmType' | 'promptMode' | 'safetyLevel'>;
