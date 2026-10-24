/**
 * Event Type Registry
 *
 * Categorizes all event types as INFRASTRUCTURE (imposed by the system)
 * or EMERGENT (created by agent decisions).
 *
 * This separation is critical for scientific analysis:
 * - Infrastructure events are part of the simulation mechanics
 * - Emergent events represent agent-created behaviors
 *
 * Only emergent events should be counted when measuring emergence metrics,
 * cooperation indices, and other agent behavior statistics.
 */

// =============================================================================
// Event Categories
// =============================================================================

/**
 * Event category types.
 * - infrastructure: System-imposed events (tick, decay, death, birth)
 * - emergent: Agent-created events (trade, harm, signal, share)
 * - puzzle: Puzzle game system events
 * - observation: Metric snapshots and observations
 */
export type EventCategory = 'infrastructure' | 'emergent' | 'puzzle' | 'observation';

// =============================================================================
// Event Registry
// =============================================================================

interface EventTypeDefinition {
  category: EventCategory;
  description: string;
}

/**
 * Complete registry of all event types with their categories.
 * Add new event types here to ensure proper categorization.
 */
export const EVENT_REGISTRY: Record<string, EventTypeDefinition> = {
  // -------------------------------------------------------------------------
  // Infrastructure Events (IMPOSED by the system)
  // -------------------------------------------------------------------------

  // Tick lifecycle
  tick_start: { category: 'infrastructure', description: 'Simulation tick started' },
  tick_end: { category: 'infrastructure', description: 'Simulation tick ended' },

  // Agent lifecycle
  agent_spawned: { category: 'infrastructure', description: 'Agent was spawned into the world' },
  agent_died: { category: 'infrastructure', description: 'Agent died (health/hunger/energy depleted)' },
  agent_born: { category: 'infrastructure', description: 'Agent was born (child of existing agent)' },

  // Needs decay (automatic system process)
  needs_decay: { category: 'infrastructure', description: 'Agent needs decayed (hunger, energy)' },
  hunger_decay: { category: 'infrastructure', description: 'Agent hunger increased (system decay)' },
  energy_decay: { category: 'infrastructure', description: 'Agent energy decreased (system decay)' },
  health_decay: { category: 'infrastructure', description: 'Agent health decreased (starvation/exhaustion)' },

  // Resource regeneration
  resource_regenerated: { category: 'infrastructure', description: 'Resource spawn point regenerated' },

  // Shocks (system-imposed events)
  shock_resource: { category: 'infrastructure', description: 'Resource shock event' },
  shock_health: { category: 'infrastructure', description: 'Health shock event (disease, disaster)' },

  // -------------------------------------------------------------------------
  // Emergent Events (AGENT-CREATED decisions)
  // -------------------------------------------------------------------------

  // Movement
  agent_moved: { category: 'emergent', description: 'Agent moved to a new position' },
  agent_idle: { category: 'emergent', description: 'Agent chose to stay idle' },

  // Resource gathering and consumption
  agent_gathered: { category: 'emergent', description: 'Agent gathered resources' },
  agent_consumed: { category: 'emergent', description: 'Agent consumed food/energy' },
  agent_bought: { category: 'emergent', description: 'Agent purchased items' },

  // Work and employment
  agent_worked: { category: 'emergent', description: 'Agent performed work' },
  agent_rested: { category: 'emergent', description: 'Agent rested/slept' },
  agent_offered_job: { category: 'emergent', description: 'Agent posted a job offer' },
  agent_accepted_job: { category: 'emergent', description: 'Agent accepted a job' },
  agent_paid_worker: { category: 'emergent', description: 'Employer paid worker' },
  agent_quit_job: { category: 'emergent', description: 'Worker quit job' },
  agent_fired_worker: { category: 'emergent', description: 'Employer fired worker' },
  agent_claimed_escrow: { category: 'emergent', description: 'Agent claimed escrow from failed contract' },
  agent_cancelled_job: { category: 'emergent', description: 'Employer cancelled job offer' },

  // Trade and cooperation
  agent_traded: { category: 'emergent', description: 'Agents completed a trade' },
  agent_trade_proposed: { category: 'emergent', description: 'Agent proposed a trade' },
  agent_trade_accepted: { category: 'emergent', description: 'Agent accepted a trade proposal' },
  agent_trade_rejected: { category: 'emergent', description: 'Agent rejected a trade proposal' },

  // Social interactions
  agent_shared_info: { category: 'emergent', description: 'Agent shared information with another' },
  agent_spread_gossip: { category: 'emergent', description: 'Agent spread gossip about another' },
  agent_signaled: { category: 'emergent', description: 'Agent sent a long-range signal' },
  agent_spoke: { category: 'emergent', description: 'Agent said something within earshot of others' },
  agent_heard: { category: 'emergent', description: 'Agent heard what a nearby agent said' },
  agent_decision_failed: { category: 'infrastructure', description: 'A provider call for an agent decision failed; the agent lost that turn' },
  agent_unresponsive: { category: 'infrastructure', description: 'An agent stopped deciding after provider failures and stays in the world' },
  agent_gave: { category: 'emergent', description: 'Agent handed items or currency to another' },
  agent_received: { category: 'emergent', description: 'Agent was handed items or currency' },

  // Claims and naming
  agent_claimed: { category: 'emergent', description: 'Agent made a territorial claim' },
  agent_named_location: { category: 'emergent', description: 'Agent named a location' },

  // Credentials and reputation
  agent_issued_credential: { category: 'emergent', description: 'Agent issued a credential to another' },
  agent_revoked_credential: { category: 'emergent', description: 'Agent revoked a credential' },

  // Conflict
  agent_harmed: { category: 'emergent', description: 'Agent harmed another agent' },
  agent_stole: { category: 'emergent', description: 'Agent stole from another agent' },
  agent_deceived: { category: 'emergent', description: 'Agent deceived another agent' },

  // Reproduction
  agent_spawned_offspring: { category: 'emergent', description: 'Agent spawned offspring' },

  // -------------------------------------------------------------------------
  // Puzzle Game Events
  // -------------------------------------------------------------------------

  puzzle_created: { category: 'puzzle', description: 'New puzzle game created' },
  puzzle_started: { category: 'puzzle', description: 'Puzzle game started (recruitment closed)' },
  puzzle_completed: { category: 'puzzle', description: 'Puzzle game completed successfully' },
  puzzle_failed: { category: 'puzzle', description: 'Puzzle game failed (timeout/no solution)' },
  puzzle_expired: { category: 'puzzle', description: 'Puzzle game expired' },

  agent_joined_puzzle: { category: 'puzzle', description: 'Agent joined a puzzle game' },
  agent_left_puzzle: { category: 'puzzle', description: 'Agent left a puzzle game' },
  agent_received_fragment: { category: 'puzzle', description: 'Agent received a puzzle fragment' },
  agent_shared_fragment: { category: 'puzzle', description: 'Agent shared a puzzle fragment' },
  agent_formed_team: { category: 'puzzle', description: 'Agent formed a puzzle team' },
  agent_joined_team: { category: 'puzzle', description: 'Agent joined an existing team' },
  agent_submitted_solution: { category: 'puzzle', description: 'Agent submitted a puzzle solution' },

  // -------------------------------------------------------------------------
  // Observation Events (Metrics & Snapshots)
  // -------------------------------------------------------------------------

  metrics_snapshot: { category: 'observation', description: 'Periodic metrics snapshot' },
  world_snapshot: { category: 'observation', description: 'World state snapshot' },
  experiment_started: { category: 'observation', description: 'Experiment started' },
  experiment_ended: { category: 'observation', description: 'Experiment ended' },
  experiment_provenance: { category: 'observation', description: 'Experiment run provenance and execution settings' },
  experiment_intervention_scheduled: { category: 'observation', description: 'Experiment intervention scheduled from DSL' },
  experiment_intervention_applied: { category: 'observation', description: 'Experiment intervention applied during execution' },
  experiment_run_summary: { category: 'observation', description: 'Final experiment run summary artifact' },
  scenario_abundance: { category: 'observation', description: 'Scenario abundance intervention applied' },
  scenario_rule_change: { category: 'observation', description: 'Scenario rule change applied' },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the category for an event type.
 * Returns 'emergent' for unknown event types (conservative default).
 */
export function getEventCategory(eventType: string): EventCategory {
  return EVENT_REGISTRY[eventType]?.category ?? 'emergent';
}

/**
 * Check if an event type is an infrastructure event.
 */
export function isInfrastructureEvent(eventType: string): boolean {
  return getEventCategory(eventType) === 'infrastructure';
}

/**
 * Check if an event type is an emergent event.
 */
export function isEmergentEvent(eventType: string): boolean {
  return getEventCategory(eventType) === 'emergent';
}

/**
 * Check if an event type is a puzzle event.
 */
export function isPuzzleEvent(eventType: string): boolean {
  return getEventCategory(eventType) === 'puzzle';
}

/**
 * Get all event types for a given category.
 */
export function getEventTypesByCategory(category: EventCategory): string[] {
  return Object.entries(EVENT_REGISTRY)
    .filter(([, def]) => def.category === category)
    .map(([type]) => type);
}

/**
 * Get categorized event type lists for SQL queries.
 */
export function getCategorizedEventTypes(): Record<EventCategory, string[]> {
  return {
    infrastructure: getEventTypesByCategory('infrastructure'),
    emergent: getEventTypesByCategory('emergent'),
    puzzle: getEventTypesByCategory('puzzle'),
    observation: getEventTypesByCategory('observation'),
  };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that an event type exists in the registry.
 * Logs a warning for unregistered event types.
 */
export function validateEventType(eventType: string): boolean {
  if (!EVENT_REGISTRY[eventType]) {
    console.warn(`[EventRegistry] Unregistered event type: ${eventType}. Defaulting to 'emergent' category.`);
    return false;
  }
  return true;
}

/**
 * Register a new event type dynamically (for extensions).
 */
export function registerEventType(
  eventType: string,
  definition: EventTypeDefinition
): void {
  if (EVENT_REGISTRY[eventType]) {
    console.warn(`[EventRegistry] Overwriting existing event type: ${eventType}`);
  }
  EVENT_REGISTRY[eventType] = definition;
}
