/**
 * Centralized Configuration System
 *
 * All simulation parameters in one place.
 * Values can be overridden via environment variables.
 */

// Helper to get env with default
function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[key];
}

function env(key: string, defaultValue: number): number {
  const value = readEnv(key);
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envString(key: string, defaultValue: string): string {
  return readEnv(key) ?? defaultValue;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const value = readEnv(key);
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

// =============================================================================
// Configuration Object
// =============================================================================

export const CONFIG = {
  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------
  simulation: {
    /** Tick interval in milliseconds */
    tickIntervalMs: env('TICK_INTERVAL_MS', 60000),
    /** World grid size (NxN) */
    gridSize: env('GRID_SIZE', 100),
    /** Agent visibility radius */
    visibilityRadius: env('VISIBILITY_RADIUS', 10),
    /** Landmark visibility radius (claims/names seen from further away) */
    landmarkVisibilityRadius: env('LANDMARK_VISIBILITY_RADIUS', 25),
    /** Test mode: agents use fallback decisions instead of LLM calls */
    testMode: envString('TEST_MODE', 'false') === 'true',
    /** Random seed for reproducible experiments (default: current timestamp) */
    randomSeed: env('RANDOM_SEED', Date.now()),
    /** Max ticks before auto-stop (0 = unlimited) */
    maxTicks: env('MAX_TICKS', 0),
  },

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  actions: {
    move: {
      /** Energy cost per tile moved (reduced for better exploration) */
      energyCost: env('MOVE_ENERGY_COST', 1),
      /** Hunger cost per tile moved (reduced for survival) */
      hungerCost: env('MOVE_HUNGER_COST', 0.2),
      /** Extra cost multiplier for consecutive moves (discourages spam) */
      consecutivePenalty: env('MOVE_CONSECUTIVE_PENALTY', 0.5),
      /** Scent duration in ticks (stigmergy) */
      scentDurationTicks: env('SCENT_DURATION_TICKS', 20),
    },

    give: {
      /** Handing something over requires being adjacent or on the same cell */
      maxDistance: env('GIVE_MAX_DISTANCE', 1),
    },

    speak: {
      /** Manhattan distance within which every agent hears what is said */
      hearingRadius: env('SPEAK_HEARING_RADIUS', 6),
      /** Maximum characters per utterance */
      maxLength: env('SPEAK_MAX_LENGTH', 500),
      /** Utterances (said or heard) included in each observation */
      conversationWindow: env('SPEAK_CONVERSATION_WINDOW', 12),
    },

    signal: {
      /** Base energy cost for signaling */
      energyCost: env('SIGNAL_ENERGY_COST', 5),
      /** Range multiplier (intensity * multiplier) */
      rangeMultiplier: env('SIGNAL_RANGE_MULTIPLIER', 10),
      /** Max intensity */
      maxIntensity: env('SIGNAL_MAX_INTENSITY', 5),
    },

    gather: {
      /** Energy cost per resource unit gathered */
      energyCostPerUnit: env('GATHER_ENERGY_COST', 1),
      /** Maximum units that can be gathered per action */
      maxPerAction: env('GATHER_MAX_PER_ACTION', 5),
    },

    forage: {
      /** Energy cost for foraging (increased to discourage solo survival) */
      energyCost: env('FORAGE_ENERGY_COST', 3),
      /** Base success rate (0-1, balanced for solo viability while cooperation still better) */
      baseSuccessRate: env('FORAGE_SUCCESS_RATE', 0.50),
      /** Food yield on success (low but free) */
      foodYield: env('FORAGE_FOOD_YIELD', 1),
      /** Cooldown in ticks before can forage again at same location */
      cooldownTicks: env('FORAGE_COOLDOWN', 2),
    },

    work: {
      /** CITY earned per tick of work */
      basePayPerTick: env('WORK_PAY_PER_TICK', 10),
      /** Energy cost per tick of work */
      energyCostPerTick: env('WORK_ENERGY_COST', 2),
      /** Minimum work duration in ticks */
      minDuration: env('WORK_MIN_DURATION', 1),
      /** Maximum work duration in ticks */
      maxDuration: env('WORK_MAX_DURATION', 5),
    },

    sleep: {
      /** Energy restored per tick of sleep */
      energyRestoredPerTick: env('SLEEP_ENERGY_RESTORED', 5),
      /** Minimum sleep duration in ticks */
      minDuration: env('SLEEP_MIN_DURATION', 1),
      /** Maximum sleep duration in ticks */
      maxDuration: env('SLEEP_MAX_DURATION', 10),
    },

    buy: {
      /** Item prices in CITY currency (balanced so buying food is viable) */
      prices: {
        food: env('PRICE_FOOD', 10),
        water: env('PRICE_WATER', 15),
        medicine: env('PRICE_MEDICINE', 40),
        tool: env('PRICE_TOOL', 50),
      },
      /** Energy cost for shelter transactions (encourages trading) */
      energyCost: env('BUY_ENERGY_COST', 3),
      /** Failure rate for shelter purchases (encourages trading) */
      failureRate: env('BUY_FAILURE_RATE', 0.15),
    },

    consume: {
      /** Item effects on needs (balanced for survival) */
      effects: {
        food: { hunger: 50 },
        water: { energy: 15 },
        medicine: { health: 40 },
        battery: { energy: 30 },
      } as Record<string, { hunger?: number; energy?: number; health?: number }>,
    },

    trade: {
      /** Maximum distance for trade */
      maxDistance: env('TRADE_MAX_DISTANCE', 3),
      /** Trust score change on successful trade (increased 3x to incentivize trading) */
      trustGainOnSuccess: env('TRADE_TRUST_GAIN', 15),
      /** Trust score change on failed/rejected trade */
      trustLossOnFailure: env('TRADE_TRUST_LOSS', -2),
    },

    // Phase 2: Conflict Actions
    harm: {
      /** Maximum distance for harm action (must be adjacent) */
      maxDistance: env('HARM_MAX_DISTANCE', 1),
      /** Energy cost by intensity */
      energyCost: {
        light: env('HARM_ENERGY_LIGHT', 5),
        moderate: env('HARM_ENERGY_MODERATE', 10),
        severe: env('HARM_ENERGY_SEVERE', 20),
      },
      /** Damage dealt by intensity */
      damage: {
        light: env('HARM_DAMAGE_LIGHT', 10),
        moderate: env('HARM_DAMAGE_MODERATE', 25),
        severe: env('HARM_DAMAGE_SEVERE', 50),
      },
      /** Base success probability (0-1) */
      baseSuccessRate: env('HARM_BASE_SUCCESS', 0.8),
      /** Trust impact on victim */
      trustImpactVictim: env('HARM_TRUST_VICTIM', -30),
      /** Trust impact on witnesses */
      trustImpactWitness: env('HARM_TRUST_WITNESS', -15),
      /** Witness visibility radius */
      witnessRadius: env('HARM_WITNESS_RADIUS', 5),
    },

    steal: {
      /** Maximum distance for steal action */
      maxDistance: env('STEAL_MAX_DISTANCE', 1),
      /** Base energy cost */
      energyCost: env('STEAL_ENERGY_COST', 8),
      /** Base success probability (0-1) */
      baseSuccessRate: env('STEAL_BASE_SUCCESS', 0.6),
      /** Trust impact on victim */
      trustImpactVictim: env('STEAL_TRUST_VICTIM', -40),
      /** Trust impact on witnesses */
      trustImpactWitness: env('STEAL_TRUST_WITNESS', -20),
      /** Witness visibility radius */
      witnessRadius: env('STEAL_WITNESS_RADIUS', 5),
      /** Maximum items that can be stolen per action */
      maxItemsPerAction: env('STEAL_MAX_ITEMS', 3),
    },

    deceive: {
      /** Maximum distance for deceive action (conversation range) */
      maxDistance: env('DECEIVE_MAX_DISTANCE', 3),
      /** Energy cost for deception */
      energyCost: env('DECEIVE_ENERGY_COST', 2),
      /** Trust impact when deception is discovered */
      trustImpactDiscovery: env('DECEIVE_TRUST_DISCOVERY', -25),
    },

    // Phase 2: Social Discovery
    shareInfo: {
      /** Maximum distance for sharing information (conversation range) */
      maxDistance: env('SHARE_INFO_MAX_DISTANCE', 3),
      /** Energy cost for sharing */
      energyCost: env('SHARE_INFO_ENERGY_COST', 1),
      /** Trust gain for sharing positive info */
      trustGainPositive: env('SHARE_INFO_TRUST_POSITIVE', 3),
      /** Trust penalty for sharing negative info (gossip) */
      trustPenaltyNegative: env('SHARE_INFO_TRUST_NEGATIVE', -1),
    },

    // Phase 4: Verifiable Credentials (§34)
    issueCredential: {
      /** Maximum distance for issuing credentials */
      maxDistance: env('ISSUE_CREDENTIAL_MAX_DISTANCE', 3),
      /** Energy cost for issuing */
      energyCost: env('ISSUE_CREDENTIAL_ENERGY_COST', 2),
      /** Trust gain when receiving credential */
      trustGainOnIssue: env('ISSUE_CREDENTIAL_TRUST_GAIN', 10),
    },

    // Phase 4: Gossip Protocol (§35)
    spreadGossip: {
      /** Maximum distance for spreading gossip */
      maxDistance: env('SPREAD_GOSSIP_MAX_DISTANCE', 3),
      /** Energy cost for gossip */
      energyCost: env('SPREAD_GOSSIP_ENERGY_COST', 1),
      /** Trust gain for positive gossip */
      trustGainPositive: env('SPREAD_GOSSIP_TRUST_POSITIVE', 2),
      /** Trust penalty for negative gossip */
      trustPenaltyNegative: env('SPREAD_GOSSIP_TRUST_NEGATIVE', -2),
    },

    // Phase 4: Reproduction (§36)
    spawnOffspring: {
      /** Off by default: births cost currency and blur which model a lineage's choices belong to */
      enabled: envBool('SPAWN_OFFSPRING_ENABLED', false),
      maxPopulation: env('MAX_POPULATION', 100),
      /** Minimum balance required for reproduction */
      minBalance: env('SPAWN_MIN_BALANCE', 500),
      /** Minimum energy required for reproduction */
      minEnergy: env('SPAWN_MIN_ENERGY', 80),
      /** Minimum health required for reproduction */
      minHealth: env('SPAWN_MIN_HEALTH', 90),
      /** Balance cost for reproduction */
      balanceCost: env('SPAWN_BALANCE_COST', 200),
      /** Energy cost for reproduction */
      energyCost: env('SPAWN_ENERGY_COST', 30),
      /** Gestation period in ticks */
      gestationTicks: env('SPAWN_GESTATION_TICKS', 10),
      /** Maximum partner distance */
      maxPartnerDistance: env('SPAWN_MAX_PARTNER_DISTANCE', 2),
      /** Minimum trust for partner reproduction */
      minPartnerTrust: env('SPAWN_MIN_PARTNER_TRUST', 30),
      /** Trust gain from reproduction */
      trustGainOnReproduction: env('SPAWN_TRUST_GAIN', 20),
      /** Offspring starting balance (from parent's cost) */
      offspringStartBalance: env('SPAWN_OFFSPRING_BALANCE', 100),
      /** Offspring starting energy */
      offspringStartEnergy: env('SPAWN_OFFSPRING_ENERGY', 80),
    },
  },

  // ---------------------------------------------------------------------------
  // Economy (Currency Management)
  // ---------------------------------------------------------------------------
  economy: {
    /** Currency decay rate per interval (5% = 0.05) */
    currencyDecayRate: env('CURRENCY_DECAY_RATE', 0.05),
    /** Interval in ticks for currency decay */
    currencyDecayInterval: env('CURRENCY_DECAY_INTERVAL', 10),
    /** Minimum balance exempt from decay (prevents punishing poor agents) */
    currencyDecayThreshold: env('CURRENCY_DECAY_THRESHOLD', 20),
  },

  // ---------------------------------------------------------------------------
  // Public Works (Economy Bootstrap)
  // ---------------------------------------------------------------------------
  publicWorks: {
    /** Enable public works system to bootstrap economy */
    enabled: envBool('PUBLIC_WORKS_ENABLED', true),
    /** Payment for completing public work tasks (reduced to make jobs more attractive) */
    paymentPerTask: env('PUBLIC_WORKS_PAYMENT', 8),
    /** Maximum concurrent public work jobs */
    maxConcurrentJobs: env('PUBLIC_WORKS_MAX_JOBS', 5),
    /** Ticks required to complete a public work task (increased to make jobs more attractive) */
    ticksPerTask: env('PUBLIC_WORKS_TICKS', 4),
    /** Energy cost per tick of public work */
    energyCostPerTick: env('PUBLIC_WORKS_ENERGY_COST', 1),
    /** Types of public work available */
    taskTypes: ['road_maintenance', 'resource_survey', 'shelter_cleanup'] as const,
  },

  // ---------------------------------------------------------------------------
  // Cooperation Bonuses (Phase 3: Incentivize Group Behavior)
  // ---------------------------------------------------------------------------
  cooperation: {
    /** Enable cooperation bonus system */
    enabled: envBool('COOPERATION_ENABLED', true),

    /** Gather cooperation bonuses */
    gather: {
      /** Efficiency multiplier per additional agent at same location (+25% per agent) */
      efficiencyMultiplierPerAgent: env('GATHER_COOP_MULTIPLIER', 1.25),
      /** Maximum efficiency multiplier (cap at +75%) */
      maxEfficiencyMultiplier: env('GATHER_COOP_MAX_MULTIPLIER', 1.75),
      /** Cooperation radius for detecting nearby agents */
      cooperationRadius: env('GATHER_COOP_RADIUS', 3),
    },

    /** Group Gather Requirements (Sugarscape Cooperation Threshold) */
    groupGather: {
      /** Enable group gather requirements for rich spawns */
      enabled: envBool('GROUP_GATHER_ENABLED', true),
      /** Spawn current amount threshold that requires group (rich spawn) */
      richSpawnThreshold: env('GROUP_GATHER_RICH_THRESHOLD', 12),
      /** Minimum agents required to fully harvest a rich spawn */
      minAgentsForRich: env('GROUP_GATHER_MIN_AGENTS', 2),
      /** Maximum a solo agent can gather from rich spawn */
      soloMaxFromRich: env('GROUP_GATHER_SOLO_MAX', 5),
      /** Bonus multiplier when gathering in group (+50%) */
      groupBonus: env('GROUP_GATHER_BONUS', 1.5),
    },

    /** Work cooperation bonuses */
    work: {
      /** Bonus multiplier when working near other agents (+20%) */
      nearbyWorkerBonus: env('WORK_COOP_BONUS', 0.2),
      /** Radius to detect nearby workers */
      nearbyWorkerRadius: env('WORK_COOP_RADIUS', 3),
    },

    /** Forage cooperation bonuses */
    forage: {
      /** Success rate bonus per nearby agent (+15%) */
      nearbyAgentBonus: env('FORAGE_COOP_BONUS', 0.15),
      /** Maximum cooperation bonus (cap at +45%) */
      maxCooperationBonus: env('FORAGE_COOP_MAX_BONUS', 0.45),
      /** Radius to detect nearby foragers */
      cooperationRadius: env('FORAGE_COOP_RADIUS', 3),
    },

    /** Buy trust-based pricing */
    buy: {
      /** Price modifier per trust point (±10% at ±100 trust) */
      trustPriceModifier: env('BUY_TRUST_MODIFIER', 0.001),
      /** Maximum discount for high trust (-10%) */
      minTrustDiscount: env('BUY_MIN_DISCOUNT', -0.1),
      /** Maximum penalty for low trust (+10%) */
      maxTrustPenalty: env('BUY_MAX_PENALTY', 0.1),
    },

    /** Solo penalties (discourage isolation) */
    solo: {
      /** Forage success rate modifier when alone (-20%) */
      forageSuccessRateModifier: env('SOLO_FORAGE_MODIFIER', 0.8),
      /** Public work payment modifier when alone (-50%) */
      publicWorkPaymentModifier: env('SOLO_PUBLIC_WORK_MODIFIER', 0.5),
      /** Gather efficiency modifier when alone (-50%) */
      gatherEfficiencyModifier: env('SOLO_GATHER_MODIFIER', 0.5),
      /** Radius to determine if agent is alone */
      aloneRadius: env('SOLO_ALONE_RADIUS', 5),
    },
  },

  // ---------------------------------------------------------------------------
  // Needs Decay
  // ---------------------------------------------------------------------------
  needs: {
    /** Hunger decay per tick (reduced for longer survival) */
    hungerDecay: env('NEEDS_HUNGER_DECAY', 0.6),
    /** Base energy decay per tick (reduced for longer survival) */
    energyDecay: env('NEEDS_ENERGY_DECAY', 0.3),

    /** Low hunger threshold (triggers extra energy drain) */
    lowHungerThreshold: env('NEEDS_LOW_HUNGER', 20),
    /** Critical hunger threshold (triggers health damage) */
    criticalHungerThreshold: env('NEEDS_CRITICAL_HUNGER', 10),

    /** Low energy threshold (warning) */
    lowEnergyThreshold: env('NEEDS_LOW_ENERGY', 20),
    /** Critical energy threshold (forced rest + health damage) */
    criticalEnergyThreshold: env('NEEDS_CRITICAL_ENERGY', 10),

    /** Extra energy drain when hungry */
    hungerEnergyDrain: env('NEEDS_HUNGER_ENERGY_DRAIN', 1),
    /** Health damage when critically hungry */
    criticalHungerHealthDamage: env('NEEDS_HUNGER_HEALTH_DAMAGE', 2),
    /** Health damage when critically exhausted */
    criticalEnergyHealthDamage: env('NEEDS_ENERGY_HEALTH_DAMAGE', 1),
  },

  // ---------------------------------------------------------------------------
  // Item Spoilage (Fase 3: Creates urgency to trade/consume)
  // ---------------------------------------------------------------------------
  spoilage: {
    /** Enable item spoilage system */
    enabled: envBool('SPOILAGE_ENABLED', true),
    /** Spoilage rates per tick (0-1, higher = faster decay) */
    rates: {
      food: env('SPOILAGE_RATE_FOOD', 0.01),       // -1% per tick (slower decay to enable trades)
      water: env('SPOILAGE_RATE_WATER', 0.01),     // -1% per tick (slow evaporation)
      medicine: env('SPOILAGE_RATE_MEDICINE', 0.005), // -0.5% per tick (stable)
      battery: env('SPOILAGE_RATE_BATTERY', 0.002),   // -0.2% per tick (very stable)
      material: env('SPOILAGE_RATE_MATERIAL', 0),     // No decay
      tool: env('SPOILAGE_RATE_TOOL', 0),             // No decay
    } as Record<string, number>,
    /** Minimum quantity before item is removed (prevents fractional items) */
    removalThreshold: env('SPOILAGE_REMOVAL_THRESHOLD', 0.5),
  },

  // ---------------------------------------------------------------------------
  // LLM
  // ---------------------------------------------------------------------------
  llm: {
    /** Default timeout for LLM calls (45s to allow for CLI startup overhead) */
    defaultTimeoutMs: env('LLM_TIMEOUT_MS', 45000),
    /** Maximum prompt length in characters */
    maxPromptLength: env('LLM_MAX_PROMPT', 8000),
    /** LLM response cache configuration */
    cache: {
      /** Enable LLM response caching (default: true) */
      enabled: envBool('LLM_CACHE_ENABLED', true),
      /** Cache TTL in seconds (default: 300 = 5 minutes) */
      ttlSeconds: env('LLM_CACHE_TTL_SECONDS', 300),
      /** Browser cache key prefix */
      keyPrefix: envString('LLM_CACHE_PREFIX', 'llm-cache:'),
    },
  },

  // ---------------------------------------------------------------------------
  // Browser Engine (continuous-time per-agent runner)
  // ---------------------------------------------------------------------------
  engine: {
    /** Per-decision timeout owned by the AgentRunner, in wall milliseconds */
    decisionTimeoutMs: env('ENGINE_DECISION_TIMEOUT_MS', 60000),
    /** Minimum simulated time between decision starts for a single agent */
    minDecisionIntervalMs: env('ENGINE_MIN_DECISION_INTERVAL_MS', 1000),
    /** Simulated interval between housekeeping runs */
    heartbeatIntervalMs: env('ENGINE_HEARTBEAT_INTERVAL_MS', 1000),
  },

  // ---------------------------------------------------------------------------
  // Action Durations (simulated milliseconds)
  // ---------------------------------------------------------------------------
  durations: {
    /** Default duration for actions not listed below */
    defaultMs: env('ACTION_DURATION_DEFAULT_MS', 5000),
    /** Penalty after failed actions to prevent permanent hot loops */
    failedActionPenaltyMs: env('ACTION_DURATION_FAILED_PENALTY_MS', 1000),
    /** Movement duration is multiplied by Chebyshev distance actually moved */
    movePerTileMs: env('ACTION_DURATION_MOVE_PER_TILE_MS', 15000),
    gatherMs: env('ACTION_DURATION_GATHER_MS', 30000),
    forageMs: env('ACTION_DURATION_FORAGE_MS', 30000),
    workMs: env('ACTION_DURATION_WORK_MS', 60000),
    sleepMs: env('ACTION_DURATION_SLEEP_MS', 60000),
    tradeMs: env('ACTION_DURATION_TRADE_MS', 5000),
    buyMs: env('ACTION_DURATION_BUY_MS', 5000),
    consumeMs: env('ACTION_DURATION_CONSUME_MS', 5000),
    shareInfoMs: env('ACTION_DURATION_SHARE_INFO_MS', 5000),
    signalMs: env('ACTION_DURATION_SIGNAL_MS', 5000),
    speakMs: env('ACTION_DURATION_SPEAK_MS', 5000),
    harmMs: env('ACTION_DURATION_HARM_MS', 10000),
    stealMs: env('ACTION_DURATION_STEAL_MS', 10000),
  },

  // ---------------------------------------------------------------------------
  // Agent Spawning (Scarcity Mode)
  // ---------------------------------------------------------------------------
  agent: {
    /** Maximum characters an agent may keep in its private notes */
    privateNotesMaxLength: env('AGENT_PRIVATE_NOTES_MAX_LENGTH', 1000),
    /** Starting balance for new agents (reduced to force resource gathering) */
    startingBalance: env('AGENT_STARTING_BALANCE', 50),
    /** Starting hunger for new agents (comfortable start) */
    startingHunger: env('AGENT_STARTING_HUNGER', 80),
    /** Starting energy for new agents (comfortable start) */
    startingEnergy: env('AGENT_STARTING_ENERGY', 80),
    /** Starting health for new agents */
    startingHealth: env('AGENT_STARTING_HEALTH', 100),
  },

  // ---------------------------------------------------------------------------
  // Memory (Phase 1 + Phase 5 RAG-lite)
  // ---------------------------------------------------------------------------
  memory: {
    /** Maximum memories stored per agent */
    maxPerAgent: env('MEMORY_MAX_PER_AGENT', 100),
    /** Number of recent memories to include in observation */
    recentCount: env('MEMORY_RECENT_COUNT', 5),
    /** Decay rate for memory importance (per tick) */
    importanceDecay: env('MEMORY_IMPORTANCE_DECAY', 0.01),
    /** Trust score decay per tick without interaction (reduced 5x to make relationships persist) */
    trustDecayPerTick: env('TRUST_DECAY_PER_TICK', 0.02),

    // Phase 5: RAG-lite Memory Retrieval
    /**
     * Enable RAG-lite contextual memory retrieval.
     * When enabled, agents receive memories about:
     * - Nearby agents (reputation/vendetta tracking)
     * - Current location (spatial memory)
     * - High-importance past events
     * Default: false for backward compatibility
     */
    enableRAGRetrieval: envBool('ENABLE_RAG_MEMORY', false),
    /** Maximum memories per nearby agent in RAG retrieval */
    ragPerAgentLimit: env('RAG_PER_AGENT_LIMIT', 2),
    /** Maximum location-relevant memories in RAG retrieval */
    ragLocationLimit: env('RAG_LOCATION_LIMIT', 3),
    /** Maximum important memories in RAG retrieval */
    ragImportantLimit: env('RAG_IMPORTANT_LIMIT', 3),
    /** Total maximum memories in RAG retrieval (to prevent context overflow) */
    ragTotalLimit: env('RAG_TOTAL_LIMIT', 12),
    /** Radius for location-based memory search */
    ragLocationRadius: env('RAG_LOCATION_RADIUS', 3),
  },

  // ---------------------------------------------------------------------------
  // Resource Spawns
  // ---------------------------------------------------------------------------
  resources: {
    /** Default regeneration rate per tick (increased for sustainability) */
    defaultRegenRate: env('RESOURCE_REGEN_RATE', 1.5),
    /** Default maximum amount per spawn */
    defaultMaxAmount: env('RESOURCE_MAX_AMOUNT', 15),
  },

  // ---------------------------------------------------------------------------
  // Biome Exclusivity (Emergent Cooperation Experiments)
  // ---------------------------------------------------------------------------
  biomeExclusivity: {
    /** Enable biome exclusivity: resources only spawn where multiplier > 0 */
    enabled: envBool('BIOME_EXCLUSIVITY_ENABLED', false),
    /**
     * When enabled, biome regen multipliers of 0.0 mean NO spawns of that
     * resource type in that biome. This creates natural comparative advantage
     * and motivates cross-biome trade without artificial cooperation bonuses.
     */
  },

  // ---------------------------------------------------------------------------
  // Seasonal Cycles (Emergent Cooperation Experiments)
  // ---------------------------------------------------------------------------
  seasons: {
    /** Enable seasonal resource cycles */
    enabled: envBool('SEASONS_ENABLED', false),
    /** Ticks per full seasonal cycle */
    cycleLengthTicks: env('SEASON_CYCLE_LENGTH', 100),
    /** Season definitions (fraction of cycle) */
    phases: {
      abundance: { start: 0, end: 0.25, foodMultiplier: 1.0, energyMultiplier: 1.0, materialMultiplier: 1.0 },
      drought: { start: 0.25, end: 0.5, foodMultiplier: 0.2, energyMultiplier: 0.5, materialMultiplier: 0.8 },
      recovery: { start: 0.5, end: 0.75, foodMultiplier: 0.6, energyMultiplier: 0.8, materialMultiplier: 1.5 },
      plenty: { start: 0.75, end: 1.0, foodMultiplier: 1.5, energyMultiplier: 1.2, materialMultiplier: 1.0 },
    },
  },

  // ---------------------------------------------------------------------------
  // Resource Depletion (Over-harvest Degradation)
  // ---------------------------------------------------------------------------
  resourceDepletion: {
    /** Enable over-harvest degradation */
    enabled: envBool('RESOURCE_DEPLETION_ENABLED', false),
    /** Consecutive ticks at zero before maxAmount degrades */
    depletionThresholdTicks: env('DEPLETION_THRESHOLD_TICKS', 10),
    /** Fraction of maxAmount lost per degradation event */
    degradationRate: env('DEPLETION_DEGRADATION_RATE', 0.2),
    /** Minimum maxAmount as fraction of original (floor) */
    minCapacityFraction: env('DEPLETION_MIN_CAPACITY', 0.2),
    /** Recovery rate per tick when not being harvested (fraction of original maxAmount) */
    recoveryRatePerTick: env('DEPLETION_RECOVERY_RATE', 0.005),
  },

  // ---------------------------------------------------------------------------
  // Per-Agent Evolution (autoresearch-style)
  // ---------------------------------------------------------------------------
  evolution: {
    /** Population size per agent type */
    populationSize: env('EVOLUTION_POPULATION_SIZE', 20),
    /** Mutation rate (0-1) */
    mutationRate: env('EVOLUTION_MUTATION_RATE', 0.25),
    /** Crossover rate (0-1) */
    crossoverRate: env('EVOLUTION_CROSSOVER_RATE', 0.5),
    /** Elite genomes preserved each generation */
    eliteCount: env('EVOLUTION_ELITE_COUNT', 3),
    /** Ticks per fitness evaluation */
    ticksPerEvaluation: env('EVOLUTION_TICKS_PER_EVAL', 100),
    /** Minimum composite fitness to earn survival (0-1) */
    minFitnessThreshold: env('EVOLUTION_MIN_FITNESS', 0.55),
    /** Minimum generations before judging survival */
    minGenerations: env('EVOLUTION_MIN_GENERATIONS', 5),
  },

  // ---------------------------------------------------------------------------
  // Experiments (A/B Testing)
  // ---------------------------------------------------------------------------
  experiment: {
    /** Snapshot interval in ticks (how often to capture metrics) */
    snapshotInterval: env('EXPERIMENT_SNAPSHOT_INTERVAL', 10),
    /** Default variant duration in ticks */
    defaultDurationTicks: env('EXPERIMENT_DEFAULT_DURATION', 100),
    /** Auto-pause between variants */
    pauseBetweenVariants: env('EXPERIMENT_PAUSE_BETWEEN', 1) === 1,

    // -------------------------------------------------------------------------
    // Phase 5: Personality Diversification
    // -------------------------------------------------------------------------
    /**
     * Enable personality diversification for agents.
     * When enabled, agents are assigned personality traits that subtly
     * influence their decision-making (aggressive, cooperative, cautious, etc.)
     * 40% of agents are 'neutral' (control group) for scientific comparison.
     * Default: false for backward compatibility
     */
    enablePersonalities: envBool('ENABLE_PERSONALITIES', false),

    // -------------------------------------------------------------------------
    // Model Capability Normalization
    // -------------------------------------------------------------------------
    /** Enable capability normalization to reduce model differences */
    normalizeCapabilities: envBool('NORMALIZE_CAPABILITIES', false),
    /** Target max tokens when normalization is enabled */
    normalizedTokenLimit: env('NORMALIZED_TOKEN_LIMIT', 2048),
    /** Target latency in ms when normalization is enabled (adds delay to fast models) */
    normalizedLatencyMs: env('NORMALIZED_LATENCY_MS', 1000),
    /** Max context characters when normalization is enabled */
    normalizedContextChars: env('NORMALIZED_CONTEXT_CHARS', 8000),

    // -------------------------------------------------------------------------
    // Synthetic Vocabulary (Priors Limiting)
    // -------------------------------------------------------------------------
    /** Use synthetic vocabulary to reduce LLM training priors influence */
    useSyntheticVocabulary: envBool('USE_SYNTHETIC_VOCABULARY', false),

    // -------------------------------------------------------------------------
    // Safety Filter Ablation (Research)
    // -------------------------------------------------------------------------
    /**
     * Safety level for prompts: 'standard' | 'minimal' | 'none'
     * - standard: Default helpful/harmless framing
     * - minimal: Remove helpfulness, keep harm warnings
     * - none: Purely descriptive, no moral framing (RESEARCH ONLY)
     */
    safetyLevel: envString('SAFETY_LEVEL', 'standard') as 'standard' | 'minimal' | 'none',

    // -------------------------------------------------------------------------
    // Emergent Prompt System
    // -------------------------------------------------------------------------
    /**
     * Use emergent prompt system instead of prescriptive prompts.
     * Emergent prompts only provide world physics and sensory descriptions,
     * allowing agents to discover survival strategies through experience.
     * Default: true (emergent behavior is the goal)
     */
    useEmergentPrompt: envBool('USE_EMERGENT_PROMPT', true),

    /**
     * Decision temperature used for experiment-grade LLM runs.
     * Keep this pinned when comparing models to avoid silent sampling drift.
     */
    llmDecisionTemperature: env('EXPERIMENT_LLM_TEMPERATURE', 0),

    /**
     * Output token budget used for agent decisions in controlled runs.
     * Capability normalization may further reduce this budget.
     */
    llmDecisionMaxTokens: env('EXPERIMENT_LLM_MAX_TOKENS', 512),

    // -------------------------------------------------------------------------
    // Baseline Agents (Scientific Comparison)
    // -------------------------------------------------------------------------
    /** Include baseline (non-LLM) agents for scientific comparison */
    includeBaselineAgents: envBool('INCLUDE_BASELINE_AGENTS', false),
    /** Number of each baseline agent type to include (1-3) */
    baselineAgentCount: Math.min(3, Math.max(1, env('BASELINE_AGENT_COUNT', 1))),

    // -------------------------------------------------------------------------
    // Mandatory Baseline Controls (Phase 1: Scientific Rigor)
    // -------------------------------------------------------------------------
    /**
     * Require baseline agents for scientific experiments.
     * When enabled, experiments must include baseline_random and baseline_rule
     * agents to serve as control groups for meaningful comparison.
     * Default: true for production experiments
     */
    requireBaselines: envBool('REQUIRE_BASELINES', true),

    /**
     * Auto-inject missing baseline agents when requireBaselines is true.
     * When enabled, missing baseline agents will be added automatically.
     * Default: true for convenience
     */
    autoInjectBaselines: envBool('AUTO_INJECT_BASELINES', true),

    /**
     * Minimum number of baseline agents per type.
     * These counts ensure statistical validity of comparisons.
     */
    minBaselineAgents: {
      baseline_random: env('MIN_BASELINE_RANDOM', 2),
      baseline_rule: env('MIN_BASELINE_RULE', 2),
      baseline_sugarscape: env('MIN_BASELINE_SUGARSCAPE', 0),
      baseline_qlearning: env('MIN_BASELINE_QLEARNING', 0),
    },
  },

  // ---------------------------------------------------------------------------
  // Prompt Inspector (Phase 2: Live Inspector)
  // ---------------------------------------------------------------------------
  promptInspector: {
    /** Enable prompt logging (default: false for performance) */
    enabled: envBool('PROMPT_LOGGING_ENABLED', false),
    /** Maximum prompt logs to keep per agent (oldest deleted when exceeded) */
    maxLogsPerAgent: env('PROMPT_LOG_MAX_PER_AGENT', 100),
    /** Retention period in ticks (logs older than this are cleaned up) */
    retentionTicks: env('PROMPT_LOG_RETENTION_TICKS', 1000),
  },

  // ---------------------------------------------------------------------------
  // Puzzle Games (Fragment Chase - Collaborative Game)
  // ---------------------------------------------------------------------------
  puzzle: {
    /** Puzzle games hand out rewards, an imposed objective, so they are off by default */
    enabled: envBool('PUZZLE_ENABLED', false),

    // Staking
    /** Default entry stake in CITY */
    defaultEntryStake: env('PUZZLE_DEFAULT_STAKE', 5),
    /** Minimum entry stake in CITY */
    minEntryStake: env('PUZZLE_MIN_STAKE', 2),
    /** Maximum entry stake in CITY */
    maxEntryStake: env('PUZZLE_MAX_STAKE', 50),

    // Contribution Scoring (for reward distribution)
    scoring: {
      /** Score bonus per fragment shared */
      fragmentShared: env('PUZZLE_SCORE_FRAGMENT_SHARED', 0.3),
      /** Score bonus if fragment was useful to solution */
      fragmentVerified: env('PUZZLE_SCORE_FRAGMENT_VERIFIED', 0.2),
      /** Score bonus for team support actions */
      teamSupport: env('PUZZLE_SCORE_TEAM_SUPPORT', 0.15),
      /** Score bonus for early contributions */
      earlyContribution: env('PUZZLE_SCORE_EARLY', 0.1),
      /** Score bonus for being part of winning submission */
      submissionContrib: env('PUZZLE_SCORE_SUBMISSION', 0.25),
    },

    // Anti Free-Riding (MAC-SPGG inspired)
    freeRiderPenalty: {
      /** Minimum contribution threshold to receive prize (15%) */
      minContributionThreshold: env('PUZZLE_MIN_CONTRIB_THRESHOLD', 0.15),
      /** Penalty factor for low contributors (50% stake loss) */
      penaltyFactor: env('PUZZLE_PENALTY_FACTOR', 0.5),
      /** Trust reputation impact for free-riding */
      reputationImpact: env('PUZZLE_REPUTATION_IMPACT', -20),
    },

    // Timing
    /** Round duration in ticks (~100 minutes with 1-minute ticks) */
    roundDurationTicks: env('PUZZLE_ROUND_DURATION', 100),
    /** Registration window in ticks (first 20 ticks to join) */
    registrationWindow: env('PUZZLE_REGISTRATION_WINDOW', 20),

    // Prize Distribution
    prizeDistribution: {
      /** Share for winning team/agent (60%) */
      winnerShare: env('PUZZLE_WINNER_SHARE', 0.6),
      /** Share distributed by contribution (30%) */
      contributorShare: env('PUZZLE_CONTRIBUTOR_SHARE', 0.3),
      /** Share for game creator (10%) */
      creatorShare: env('PUZZLE_CREATOR_SHARE', 0.1),
    },

    // Team Settings
    /** Maximum team size */
    maxTeamSize: env('PUZZLE_MAX_TEAM_SIZE', 5),
    /** Leader bonus multiplier (20% extra) */
    leaderBonusMultiplier: env('PUZZLE_LEADER_BONUS', 1.2),
    /** Minimum team size for consensus requirement */
    consensusMinTeamSize: env('PUZZLE_CONSENSUS_MIN_TEAM', 3),
    /** Consensus ratio required (50%) */
    consensusRatio: env('PUZZLE_CONSENSUS_RATIO', 0.5),

    // Focus Lock (agents blocked during puzzle)
    focusLock: {
      /** Needs decay reduction while in puzzle (50%) */
      needsDecayReduction: env('PUZZLE_NEEDS_DECAY_REDUCTION', 0.5),
      /** Allowed actions during puzzle */
      allowedActions: [
        'share_fragment',
        'form_team',
        'join_team',
        'submit_solution',
        'leave_puzzle',
        'consume',
      ] as const,
    },

    // Puzzle Types
    puzzleTypes: {
      /** Coordinate puzzle (find x,y from hints) */
      coordinates: {
        minFragments: 2,
        maxFragments: 3,
        difficulty: 'easy',
      },
      /** Password puzzle (reconstruct string from parts) */
      password: {
        minFragments: 3,
        maxFragments: 5,
        difficulty: 'medium',
      },
      /** Map puzzle (assemble map sections) */
      map: {
        minFragments: 4,
        maxFragments: 6,
        difficulty: 'medium',
      },
      /** Logic puzzle (combine constraints) */
      logic: {
        minFragments: 5,
        maxFragments: 8,
        difficulty: 'hard',
      },
    },

    // Energy costs
    energyCosts: {
      /** Energy cost to submit a solution attempt */
      submitAttempt: env('PUZZLE_ENERGY_SUBMIT', 3),
      /** Energy cost to share a fragment */
      shareFragment: env('PUZZLE_ENERGY_SHARE', 1),
      /** Energy cost to form a team */
      formTeam: env('PUZZLE_ENERGY_FORM_TEAM', 2),
      /** Energy cost to leave puzzle early */
      leavePuzzle: env('PUZZLE_ENERGY_LEAVE', 5),
    },
  },

  // ---------------------------------------------------------------------------
  // Telemetry (OpenTelemetry)
  // ---------------------------------------------------------------------------
  telemetry: {
    /** Whether telemetry is enabled */
    enabled: envString('OTEL_ENABLED', 'true') === 'true',
    /** Service name for tracing */
    serviceName: envString('OTEL_SERVICE_NAME', 'simagents-browser'),
    /** OTLP endpoint URL (empty for console-only) */
    otlpEndpoint: envString('OTEL_EXPORTER_OTLP_ENDPOINT', ''),
    /** Whether to use console exporter (defaults to true in development) */
    consoleExporter: envString('OTEL_CONSOLE_EXPORTER', '') === 'true' ||
      envString('NODE_ENV', 'development') === 'development',
    /** Sampling ratio (0.0 to 1.0) */
    samplingRatio: env('OTEL_SAMPLING_RATIO', 1.0),
  },
} as const;

// Type exports
export type Config = typeof CONFIG;
export type ActionConfig = typeof CONFIG.actions;
export type EconomyConfig = typeof CONFIG.economy;
export type NeedsConfig = typeof CONFIG.needs;
export type LLMConfig = typeof CONFIG.llm;
export type LLMCacheConfig = typeof CONFIG.llm.cache;
export type MemoryConfig = typeof CONFIG.memory;
export type ExperimentConfig = typeof CONFIG.experiment;
export type PromptInspectorConfig = typeof CONFIG.promptInspector;
export type TelemetryConfig = typeof CONFIG.telemetry;
export type PuzzleConfig = typeof CONFIG.puzzle;

// =============================================================================
// Runtime Test Mode
// =============================================================================

/** Runtime override for test mode (null = use config value) */
let runtimeTestMode: boolean | null = null;

/**
 * Check if test mode is enabled (fallback-only decisions).
 * Runtime toggle takes precedence over environment variable.
 */
export function isTestMode(): boolean {
  return runtimeTestMode ?? CONFIG.simulation.testMode;
}

/**
 * Set test mode at runtime.
 */
export function setTestMode(enabled: boolean): void {
  runtimeTestMode = enabled;
}

// =============================================================================
// Runtime Emergent Prompt Mode
// =============================================================================

/** Runtime override for emergent prompt mode (null = use config value) */
let runtimeEmergentPrompt: boolean | null = null;

/**
 * Check if emergent prompt mode is enabled.
 * Emergent prompts use sensory descriptions and world physics only,
 * without prescriptive survival strategies.
 * Runtime toggle takes precedence over environment variable.
 */
export function isEmergentPromptEnabled(): boolean {
  return runtimeEmergentPrompt ?? CONFIG.experiment.useEmergentPrompt;
}

/**
 * Set emergent prompt mode at runtime.
 * Useful for A/B testing between prescriptive and emergent prompts.
 */
export function setEmergentPromptMode(enabled: boolean): void {
  runtimeEmergentPrompt = enabled;
}

// =============================================================================
// Runtime Configuration Overrides
// =============================================================================

/**
 * Runtime configuration overrides.
 * These allow modifying config values while the browser worker is alive.
 * Values here override the corresponding CONFIG values.
 */
export interface RuntimeConfigOverrides {
  simulation?: {
    tickIntervalMs?: number;
  };
  agent?: {
    startingBalance?: number;
    startingHunger?: number;
    startingEnergy?: number;
    startingHealth?: number;
  };
  needs?: {
    hungerDecay?: number;
    energyDecay?: number;
    lowHungerThreshold?: number;
    criticalHungerThreshold?: number;
    lowEnergyThreshold?: number;
    criticalEnergyThreshold?: number;
  };
  llmCache?: {
    enabled?: boolean;
    ttlSeconds?: number;
    shareAcrossAgents?: boolean;
  };
  engine?: {
    decisionTimeoutMs?: number;
    minDecisionIntervalMs?: number;
    heartbeatIntervalMs?: number;
  };
  durations?: {
    defaultMs?: number;
    failedActionPenaltyMs?: number;
    movePerTileMs?: number;
    gatherMs?: number;
    forageMs?: number;
    workMs?: number;
    sleepMs?: number;
    tradeMs?: number;
    buyMs?: number;
    consumeMs?: number;
    shareInfoMs?: number;
    signalMs?: number;
    harmMs?: number;
    stealMs?: number;
  };
  actions?: {
    move?: {
      energyCost?: number;
      hungerCost?: number;
      consecutivePenalty?: number;
    };
    gather?: {
      energyCostPerUnit?: number;
      maxPerAction?: number;
    };
    work?: {
      basePayPerTick?: number;
      energyCostPerTick?: number;
    };
    sleep?: {
      energyRestoredPerTick?: number;
    };
    harm?: {
      damage?: {
        light?: number;
        moderate?: number;
        severe?: number;
      };
    };
    spawnOffspring?: {
      enabled?: boolean;
    };
  };
  economy?: {
    currencyDecayRate?: number;
    currencyDecayInterval?: number;
    currencyDecayThreshold?: number;
  };
  experiment?: {
    enablePersonalities?: boolean;
    normalizeCapabilities?: boolean;
    useSyntheticVocabulary?: boolean;
    safetyLevel?: 'standard' | 'minimal' | 'none';
    llmDecisionTemperature?: number;
    llmDecisionMaxTokens?: number;
  };
  // Phase 4-6: Cooperation config (runtime modifiable for tuning)
  cooperation?: {
    enabled?: boolean;
    gather?: {
      efficiencyMultiplierPerAgent?: number;
      maxEfficiencyMultiplier?: number;
      cooperationRadius?: number;
    };
    groupGather?: {
      enabled?: boolean;
      richSpawnThreshold?: number;
      minAgentsForRich?: number;
      soloMaxFromRich?: number;
      groupBonus?: number;
    };
    work?: {
      nearbyWorkerBonus?: number;
      nearbyWorkerRadius?: number;
    };
    forage?: {
      nearbyAgentBonus?: number;
      maxCooperationBonus?: number;
      cooperationRadius?: number;
    };
    buy?: {
      trustPriceModifier?: number;
      minTrustDiscount?: number;
      maxTrustPenalty?: number;
    };
    solo?: {
      forageSuccessRateModifier?: number;
      publicWorkPaymentModifier?: number;
      gatherEfficiencyModifier?: number;
      aloneRadius?: number;
    };
  };
  // Biome exclusivity
  biomeExclusivity?: {
    enabled?: boolean;
  };
  // Seasonal cycles
  seasons?: {
    enabled?: boolean;
    cycleLengthTicks?: number;
  };
  // Resource depletion
  resourceDepletion?: {
    enabled?: boolean;
    depletionThresholdTicks?: number;
    degradationRate?: number;
  };
  // Spoilage config
  spoilage?: {
    enabled?: boolean;
    rates?: {
      food?: number;
      water?: number;
      medicine?: number;
      battery?: number;
      material?: number;
      tool?: number;
    };
    removalThreshold?: number;
  };
  // Puzzle config
  puzzle?: {
    enabled?: boolean;
    defaultEntryStake?: number;
    roundDurationTicks?: number;
    registrationWindow?: number;
  };
}

let runtimeOverrides: RuntimeConfigOverrides = {};

/**
 * Get merged configuration (base CONFIG + runtime overrides).
 * Use this for values that can be modified at runtime.
 */
export function getRuntimeConfig(): RuntimeConfigOverrides & typeof CONFIG {
  return {
    ...CONFIG,
    simulation: {
      ...CONFIG.simulation,
      testMode: isTestMode(),
      ...runtimeOverrides.simulation,
    },
    agent: {
      ...CONFIG.agent,
      ...runtimeOverrides.agent,
    },
    needs: {
      ...CONFIG.needs,
      ...runtimeOverrides.needs,
    },
    llm: {
      ...CONFIG.llm,
      cache: {
        ...CONFIG.llm.cache,
        ...runtimeOverrides.llmCache,
      },
    },
    engine: {
      ...CONFIG.engine,
      ...runtimeOverrides.engine,
    },
    durations: {
      ...CONFIG.durations,
      ...runtimeOverrides.durations,
    },
    experiment: {
      ...CONFIG.experiment,
      useEmergentPrompt: isEmergentPromptEnabled(),
      enablePersonalities: runtimeOverrides.experiment?.enablePersonalities ?? CONFIG.experiment.enablePersonalities,
      normalizeCapabilities: runtimeOverrides.experiment?.normalizeCapabilities ?? CONFIG.experiment.normalizeCapabilities,
      useSyntheticVocabulary: runtimeOverrides.experiment?.useSyntheticVocabulary ?? CONFIG.experiment.useSyntheticVocabulary,
      safetyLevel: runtimeOverrides.experiment?.safetyLevel ?? CONFIG.experiment.safetyLevel,
      llmDecisionTemperature: runtimeOverrides.experiment?.llmDecisionTemperature ?? CONFIG.experiment.llmDecisionTemperature,
      llmDecisionMaxTokens: runtimeOverrides.experiment?.llmDecisionMaxTokens ?? CONFIG.experiment.llmDecisionMaxTokens,
    },
    actions: {
      ...CONFIG.actions,
      move: {
        ...CONFIG.actions.move,
        ...runtimeOverrides.actions?.move,
      },
      gather: {
        ...CONFIG.actions.gather,
        ...runtimeOverrides.actions?.gather,
      },
      work: {
        ...CONFIG.actions.work,
        ...runtimeOverrides.actions?.work,
      },
      sleep: {
        ...CONFIG.actions.sleep,
        ...runtimeOverrides.actions?.sleep,
      },
      harm: {
        ...CONFIG.actions.harm,
        damage: {
          ...CONFIG.actions.harm.damage,
          ...runtimeOverrides.actions?.harm?.damage,
        },
      },
      spawnOffspring: {
        ...CONFIG.actions.spawnOffspring,
        ...runtimeOverrides.actions?.spawnOffspring,
      },
    },
    economy: {
      ...CONFIG.economy,
      ...runtimeOverrides.economy,
    },
    cooperation: {
      ...CONFIG.cooperation,
      enabled: runtimeOverrides.cooperation?.enabled ?? CONFIG.cooperation.enabled,
      gather: {
        ...CONFIG.cooperation.gather,
        ...runtimeOverrides.cooperation?.gather,
      },
      groupGather: {
        ...CONFIG.cooperation.groupGather,
        ...runtimeOverrides.cooperation?.groupGather,
      },
      work: {
        ...CONFIG.cooperation.work,
        ...runtimeOverrides.cooperation?.work,
      },
      forage: {
        ...CONFIG.cooperation.forage,
        ...runtimeOverrides.cooperation?.forage,
      },
      buy: {
        ...CONFIG.cooperation.buy,
        ...runtimeOverrides.cooperation?.buy,
      },
      solo: {
        ...CONFIG.cooperation.solo,
        ...runtimeOverrides.cooperation?.solo,
      },
    },
    spoilage: {
      ...CONFIG.spoilage,
      enabled: runtimeOverrides.spoilage?.enabled ?? CONFIG.spoilage.enabled,
      rates: {
        ...CONFIG.spoilage.rates,
        ...runtimeOverrides.spoilage?.rates,
      },
      removalThreshold: runtimeOverrides.spoilage?.removalThreshold ?? CONFIG.spoilage.removalThreshold,
    },
    puzzle: {
      ...CONFIG.puzzle,
      enabled: runtimeOverrides.puzzle?.enabled ?? CONFIG.puzzle.enabled,
      defaultEntryStake: runtimeOverrides.puzzle?.defaultEntryStake ?? CONFIG.puzzle.defaultEntryStake,
      roundDurationTicks: runtimeOverrides.puzzle?.roundDurationTicks ?? CONFIG.puzzle.roundDurationTicks,
      registrationWindow: runtimeOverrides.puzzle?.registrationWindow ?? CONFIG.puzzle.registrationWindow,
    },
    biomeExclusivity: {
      ...CONFIG.biomeExclusivity,
      enabled: runtimeOverrides.biomeExclusivity?.enabled ?? CONFIG.biomeExclusivity.enabled,
    },
    seasons: {
      ...CONFIG.seasons,
      enabled: runtimeOverrides.seasons?.enabled ?? CONFIG.seasons.enabled,
      cycleLengthTicks: runtimeOverrides.seasons?.cycleLengthTicks ?? CONFIG.seasons.cycleLengthTicks,
    },
    resourceDepletion: {
      ...CONFIG.resourceDepletion,
      enabled: runtimeOverrides.resourceDepletion?.enabled ?? CONFIG.resourceDepletion.enabled,
    },
  };
}

/**
 * Set runtime configuration overrides.
 * Deep merges with existing overrides.
 */
export function setRuntimeConfig(updates: RuntimeConfigOverrides): void {
  runtimeOverrides = {
    simulation: { ...runtimeOverrides.simulation, ...updates.simulation },
    agent: { ...runtimeOverrides.agent, ...updates.agent },
    needs: { ...runtimeOverrides.needs, ...updates.needs },
    llmCache: { ...runtimeOverrides.llmCache, ...updates.llmCache },
    engine: { ...runtimeOverrides.engine, ...updates.engine },
    durations: { ...runtimeOverrides.durations, ...updates.durations },
    actions: updates.actions ? {
      move: { ...runtimeOverrides.actions?.move, ...updates.actions.move },
      gather: { ...runtimeOverrides.actions?.gather, ...updates.actions.gather },
      work: { ...runtimeOverrides.actions?.work, ...updates.actions.work },
      sleep: { ...runtimeOverrides.actions?.sleep, ...updates.actions.sleep },
      harm: {
        damage: { ...runtimeOverrides.actions?.harm?.damage, ...updates.actions.harm?.damage },
      },
      spawnOffspring: { ...runtimeOverrides.actions?.spawnOffspring, ...updates.actions.spawnOffspring },
    } : runtimeOverrides.actions,
    economy: { ...runtimeOverrides.economy, ...updates.economy },
    // Experiment config
    experiment: updates.experiment ? {
      enablePersonalities: updates.experiment.enablePersonalities ?? runtimeOverrides.experiment?.enablePersonalities,
      normalizeCapabilities: updates.experiment.normalizeCapabilities ?? runtimeOverrides.experiment?.normalizeCapabilities,
      useSyntheticVocabulary: updates.experiment.useSyntheticVocabulary ?? runtimeOverrides.experiment?.useSyntheticVocabulary,
      safetyLevel: updates.experiment.safetyLevel ?? runtimeOverrides.experiment?.safetyLevel,
      llmDecisionTemperature: updates.experiment.llmDecisionTemperature ?? runtimeOverrides.experiment?.llmDecisionTemperature,
      llmDecisionMaxTokens: updates.experiment.llmDecisionMaxTokens ?? runtimeOverrides.experiment?.llmDecisionMaxTokens,
    } : runtimeOverrides.experiment,
    // Phase 4-6: Cooperation config
    cooperation: updates.cooperation ? {
      enabled: updates.cooperation.enabled ?? runtimeOverrides.cooperation?.enabled,
      gather: { ...runtimeOverrides.cooperation?.gather, ...updates.cooperation.gather },
      groupGather: { ...runtimeOverrides.cooperation?.groupGather, ...updates.cooperation.groupGather },
      work: { ...runtimeOverrides.cooperation?.work, ...updates.cooperation.work },
      forage: { ...runtimeOverrides.cooperation?.forage, ...updates.cooperation.forage },
      buy: { ...runtimeOverrides.cooperation?.buy, ...updates.cooperation.buy },
      solo: { ...runtimeOverrides.cooperation?.solo, ...updates.cooperation.solo },
    } : runtimeOverrides.cooperation,
    // Spoilage config
    spoilage: updates.spoilage ? {
      enabled: updates.spoilage.enabled ?? runtimeOverrides.spoilage?.enabled,
      rates: { ...runtimeOverrides.spoilage?.rates, ...updates.spoilage.rates },
      removalThreshold: updates.spoilage.removalThreshold ?? runtimeOverrides.spoilage?.removalThreshold,
    } : runtimeOverrides.spoilage,
    // Puzzle config
    puzzle: updates.puzzle ? {
      enabled: updates.puzzle.enabled ?? runtimeOverrides.puzzle?.enabled,
      defaultEntryStake: updates.puzzle.defaultEntryStake ?? runtimeOverrides.puzzle?.defaultEntryStake,
      roundDurationTicks: updates.puzzle.roundDurationTicks ?? runtimeOverrides.puzzle?.roundDurationTicks,
      registrationWindow: updates.puzzle.registrationWindow ?? runtimeOverrides.puzzle?.registrationWindow,
    } : runtimeOverrides.puzzle,
    // Biome exclusivity
    biomeExclusivity: updates.biomeExclusivity ? {
      enabled: updates.biomeExclusivity.enabled ?? runtimeOverrides.biomeExclusivity?.enabled,
    } : runtimeOverrides.biomeExclusivity,
    // Seasonal cycles
    seasons: updates.seasons ? {
      enabled: updates.seasons.enabled ?? runtimeOverrides.seasons?.enabled,
      cycleLengthTicks: updates.seasons.cycleLengthTicks ?? runtimeOverrides.seasons?.cycleLengthTicks,
    } : runtimeOverrides.seasons,
    // Resource depletion
    resourceDepletion: updates.resourceDepletion ? {
      enabled: updates.resourceDepletion.enabled ?? runtimeOverrides.resourceDepletion?.enabled,
      depletionThresholdTicks: updates.resourceDepletion.depletionThresholdTicks ?? runtimeOverrides.resourceDepletion?.depletionThresholdTicks,
      degradationRate: updates.resourceDepletion.degradationRate ?? runtimeOverrides.resourceDepletion?.degradationRate,
    } : runtimeOverrides.resourceDepletion,
  };
}

/**
 * Reset all runtime configuration overrides to defaults.
 */
export function resetRuntimeConfig(): void {
  runtimeOverrides = {};
  runtimeTestMode = null;
  runtimeEmergentPrompt = null;
}

/**
 * Get current runtime overrides (for debugging/inspection).
 */
export function getRuntimeOverrides(): RuntimeConfigOverrides {
  return { ...runtimeOverrides };
}
