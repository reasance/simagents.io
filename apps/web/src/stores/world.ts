import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// Types
// =============================================================================

export interface Agent {
  id: string;
  name?: string;
  llmType: string;
  x: number;
  y: number;
  hunger: number;
  energy: number;
  health: number;
  balance: number;
  state: string;
  color: string;
  personality?: string | null;
  /** Roster entry the agent was spawned from (observer-only metadata). */
  rosterEntryId?: string;
  /** The agent's own private notes; shown to the observer, never to other agents. */
  privateNotes?: string;
}

/** Events that say something about how agents relate to each other or survive. */
export const NOTABLE_EVENT_TYPES = new Set([
  'agent_spoke', 'agent_gave', 'agent_harmed', 'agent_stole', 'agent_traded', 'agent_name_location',
  'agent_died', 'agent_undecided', 'agent_unresponsive',
]);
const NOTABLE_LIMIT = 300;
const DECISIONS_PER_AGENT = 20;
/** A decision is the present-tense action event (it carries reasoning), or a failed or undecided turn. */
export const isDecisionEvent = (event: WorldEvent) =>
  event.type === 'action_failed' || event.type === 'agent_undecided' || (typeof event.payload?.action === 'string' && event.type === `agent_${event.payload.action}`);

export interface Location {
  id: string;
  name: string;
  type: 'residential' | 'commercial' | 'industrial' | 'civic';
  x: number;
  y: number;
}

// Biome types
export type BiomeType = 'forest' | 'desert' | 'tundra' | 'plains';

export const BIOME_COLORS: Record<BiomeType, string> = {
  forest: '#22c55e',  // Green
  desert: '#f59e0b',  // Orange
  tundra: '#38bdf8',  // Light blue
  plains: '#a3e635',  // Lime
};

// Scientific model types
export interface ResourceSpawn {
  id: string;
  x: number;
  y: number;
  resourceType: 'food' | 'energy' | 'material';
  currentAmount: number;
  maxAmount: number;
  biome?: BiomeType; // Added for biome visualization
}

export interface Shelter {
  id: string;
  x: number;
  y: number;
  canSleep: boolean;
}

export interface WorldEvent {
  id: string;
  type: string;
  tick: number;
  timestamp: number;
  agentId?: string;
  payload: Record<string, unknown>;
}

export interface AgentBubble {
  agentId: string;
  text: string;
  emoji: string;
  timestamp: number;
}

// =============================================================================
// Store
// =============================================================================

interface WorldState {
  // World data
  tick: number;
  simTimeMs: number;
  agents: Agent[];
  locations: Location[]; // Legacy - for backwards compatibility
  resourceSpawns: ResourceSpawn[]; // Scientific model
  shelters: Shelter[]; // Scientific model
  events: WorldEvent[];
  /** Speech, gifts, force, deaths: kept longer than the raw event window. */
  notable: WorldEvent[];
  /** Latest decisions per agent, newest first. */
  decisions: Record<string, WorldEvent[]>;
  bubbles: AgentBubble[];

  // UI state
  selectedAgentId: string | null;
  selectedLocationId: string | null;
  selectedResourceId: string | null;
  cameraX: number;
  cameraY: number;
  zoom: number;

  // Actions
  setWorldState: (state: { tick: number; agents: Agent[]; locations?: Location[]; resourceSpawns?: ResourceSpawn[]; shelters?: Shelter[] }) => void;
  updateWorldState: (state: { tick: number; agents: Agent[]; locations?: Location[]; resourceSpawns?: ResourceSpawn[]; shelters?: Shelter[] }) => void;
  setTick: (tick: number) => void;
  setSimTime: (simTimeMs: number) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  updateResourceSpawn: (id: string, updates: Partial<ResourceSpawn>) => void;
  addEvent: (event: WorldEvent) => void;
  setEvents: (events: WorldEvent[]) => void;
  addBubble: (bubble: AgentBubble) => void;
  selectAgent: (id: string | null) => void;
  selectLocation: (id: string | null) => void;
  selectResource: (id: string | null) => void;
  setCamera: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
  // Editor integration
  setLocations: (locations: Location[]) => void;
  clearLocations: () => void;
  clearAgents: () => void;
  resetWorld: () => void;
}

// Bubble duration in ms
const BUBBLE_DURATION = 3000;

export const useWorldStore = create<WorldState>((set) => ({
  // Initial state
  tick: 0,
  simTimeMs: 0,
  agents: [],
  locations: [],
  resourceSpawns: [],
  shelters: [],
  events: [],
  notable: [],
  decisions: {},
  bubbles: [],
  selectedAgentId: null,
  selectedLocationId: null,
  selectedResourceId: null,
  cameraX: 0,
  cameraY: 0,
  zoom: 1,

  // Actions
  setWorldState: (state) =>
    set({
      tick: state.tick,
      agents: state.agents,
      locations: state.locations ?? [],
      resourceSpawns: state.resourceSpawns ?? [],
      shelters: state.shelters ?? [],
      events: [], // Clear events on new world state
      notable: [],
      decisions: {},
      bubbles: [], // Clear bubbles on new world state
    }),

  // Update world state WITHOUT clearing events (periodic worker state sync)
  updateWorldState: (state) =>
    set({
      tick: state.tick,
      agents: state.agents,
      locations: state.locations ?? [],
      resourceSpawns: state.resourceSpawns ?? [],
      shelters: state.shelters ?? [],
      // Preserve events and bubbles!
    }),

  setTick: (tick) => set({ tick }),
  setSimTime: (simTimeMs) => set({ simTimeMs }),

  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  updateResourceSpawn: (id, updates) =>
    set((state) => ({
      resourceSpawns: state.resourceSpawns.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 100), // Keep last 100 events
      ...(NOTABLE_EVENT_TYPES.has(event.type) && { notable: [event, ...state.notable].slice(0, NOTABLE_LIMIT) }),
      ...(event.agentId && isDecisionEvent(event) && { decisions: { ...state.decisions, [event.agentId]: [event, ...(state.decisions[event.agentId] ?? [])].slice(0, DECISIONS_PER_AGENT) } }),
    })),

  setEvents: (events) => {
    const decisions: Record<string, WorldEvent[]> = {};
    for (const event of events) {
      if (!event.agentId || !isDecisionEvent(event)) continue;
      const list = (decisions[event.agentId] ??= []);
      if (list.length < DECISIONS_PER_AGENT) list.push(event);
    }
    set({ events, decisions, notable: events.filter((event) => NOTABLE_EVENT_TYPES.has(event.type)).slice(0, NOTABLE_LIMIT) });
  },

  addBubble: (bubble) =>
    set((state) => {
      const now = Date.now();
      // Remove old bubbles (older than BUBBLE_DURATION) and update/add new one
      const filteredBubbles = state.bubbles.filter(
        (b) => b.agentId !== bubble.agentId && now - b.timestamp < BUBBLE_DURATION
      );
      return { bubbles: [...filteredBubbles, bubble] };
    }),

  selectAgent: (id) => set({ selectedAgentId: id, selectedLocationId: null, selectedResourceId: null }),

  selectLocation: (id) =>
    set((state) => ({
      selectedLocationId: state.selectedLocationId === id ? null : id,
      selectedAgentId: null,
      selectedResourceId: null,
    })),

  selectResource: (id) =>
    set((state) => ({
      selectedResourceId: state.selectedResourceId === id ? null : id,
      selectedAgentId: null,
      selectedLocationId: null,
    })),

  setCamera: (x, y) => set({ cameraX: x, cameraY: y }),

  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(2, zoom)) }),

  // Editor integration actions
  setLocations: (locations) => set({ locations }),

  clearLocations: () => set({ locations: [] }),

  clearAgents: () => set({ agents: [], bubbles: [] }),

  resetWorld: () =>
    set({
      tick: 0,
      simTimeMs: 0,
      agents: [],
      locations: [],
      resourceSpawns: [],
      shelters: [],
      events: [],
      notable: [],
      decisions: {},
      bubbles: [],
      selectedAgentId: null,
      selectedLocationId: null,
      selectedResourceId: null,
    }),
}));

// =============================================================================
// Selectors (using useShallow to prevent infinite loops in React 19)
// =============================================================================

export const useAgent = (id: string) =>
  useWorldStore((state) => state.agents.find((a) => a.id === id));

export const useSelectedAgent = () =>
  useWorldStore((state) =>
    state.selectedAgentId
      ? state.agents.find((a) => a.id === state.selectedAgentId)
      : null
  );

export const useSelectedLocation = () =>
  useWorldStore((state) =>
    state.selectedLocationId
      ? state.locations.find((l) => l.id === state.selectedLocationId)
      : null
  );

export const useSelectedResource = () =>
  useWorldStore((state) =>
    state.selectedResourceId
      ? state.resourceSpawns.find((r) => r.id === state.selectedResourceId)
      : null
  );

export const useAgents = () =>
  useWorldStore(useShallow((state) => state.agents));

export const useLocations = () =>
  useWorldStore(useShallow((state) => state.locations));

export const useEvents = () =>
  useWorldStore(useShallow((state) => state.events));

export const useAliveAgents = () => {
  const agents = useWorldStore(useShallow((state) => state.agents));
  // Check state field for death, not health (dead agents may have health > 0)
  return agents.filter((a) => a.state !== 'dead');
};

export const useRecentEvents = (limit = 20) => {
  const events = useWorldStore(useShallow((state) => state.events));
  return events.slice(0, limit);
};

export const useBubbles = () =>
  useWorldStore(useShallow((state) => state.bubbles));

// Scientific model selectors
export const useResourceSpawns = () =>
  useWorldStore(useShallow((state) => state.resourceSpawns));

export const useShelters = () =>
  useWorldStore(useShallow((state) => state.shelters));

export const useNotableEvents = () => useWorldStore((state) => state.notable);
const NO_DECISIONS: WorldEvent[] = [];
export const useAgentDecisions = (agentId: string) => useWorldStore((state) => state.decisions[agentId] ?? NO_DECISIONS);
export const useSimTime = () => useWorldStore((state) => state.simTimeMs);
