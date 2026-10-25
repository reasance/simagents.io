import {
  DEFAULT_AGENT_ROSTER,
  getDefaultModelId,
  getModelCatalogEntry,
  isLLMProviderId,
  isRosterProvider,
  reconcileReasoning,
  type AgentRosterEntry,
  type AgentRosterProvider,
} from '@simagents/shared';
import { internalFixturesEnabled } from '../services/byok-preflight';
import { create } from 'zustand';

const ROSTER_STORAGE_KEY = 'simagents_agent_roster';
const DEFAULT_COLOR = '#6b7280';

type AddRosterEntry = Partial<AgentRosterEntry> & { provider: AgentRosterProvider };

interface RosterState {
  roster: AgentRosterEntry[];
  addEntry: (entry: AddRosterEntry) => void;
  removeEntry: (index: number) => void;
  /** Copy an entry as a new agent, preferring an effort level no other copy of that model uses. */
  duplicateEntry: (index: number) => void;
  updateEntry: (index: number, patch: Partial<AgentRosterEntry>) => void;
  setRoster: (roster: AgentRosterEntry[]) => void;
  resetRoster: () => void;
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function cloneDefaultRoster(): AgentRosterEntry[] {
  const defaults = internalFixturesEnabled() ? DEFAULT_AGENT_ROSTER : [{ name: 'Agent 1', provider: 'claude' as const, modelId: getDefaultModelId('claude'), color: '#8fb8de' }];
  return defaults.map((entry) => ({ ...entry, id: 'id' in entry && entry.id ? entry.id : `legacy:${entry.name}` }));
}

function defaultName(provider: AgentRosterProvider, index: number): string {
  const label = provider.replace(/^baseline_/, '').replace(/_/g, '-');
  return `${label}-${index + 1}`;
}

function nextUnusedReasoningLevel(roster: AgentRosterEntry[], source: AgentRosterEntry): AgentRosterEntry['reasoningLevel'] {
  const reasoning = isLLMProviderId(source.provider) ? getModelCatalogEntry(source.provider, source.modelId)?.reasoning : undefined;
  if (reasoning?.kind !== 'effort') return source.reasoningLevel;
  const used = new Set(roster
    .filter((entry) => entry.provider === source.provider && entry.modelId === source.modelId)
    .map((entry) => entry.reasoningLevel ?? reasoning.default));
  return reasoning.levels.find((level) => !used.has(level)) ?? source.reasoningLevel;
}

function defaultModelId(provider: AgentRosterProvider): string {
  return isLLMProviderId(provider) ? getDefaultModelId(provider) : provider;
}

function normalizeEntry(
  entry: Partial<AgentRosterEntry> & { provider?: string },
  index: number
): AgentRosterEntry | null {
  if (!entry.provider || !isRosterProvider(entry.provider)) return null;

  const provider = entry.provider;
  const modelId = entry.modelId?.trim() || defaultModelId(provider);
  const name = entry.name?.trim() || defaultName(provider, index);
  const color = entry.color?.trim() || DEFAULT_COLOR;
  const { reasoningLevel, capabilities } = reconcileReasoning(provider, modelId, entry.reasoningLevel, entry.capabilities);

  return {
    connectionId: entry.connectionId,
    capabilities,
    id: entry.id ?? `legacy:${name}`,
    name,
    provider,
    modelId,
    ...(reasoningLevel !== undefined ? { reasoningLevel } : {}),
    color,
    personality: entry.personality ?? null,
  };
}

/** Names are display labels; connection identity is retained by entry.id. */
function dedupeNames(entries: AgentRosterEntry[]): AgentRosterEntry[] {
  const taken = new Set<string>();
  return entries.map((entry) => {
    let name = entry.name;
    for (let suffix = 2; taken.has(name); suffix += 1) name = `${entry.name} (${suffix})`;
    taken.add(name);
    return name === entry.name ? entry : { ...entry, name };
  });
}

function normalizeRoster(value: unknown): AgentRosterEntry[] {
  if (!Array.isArray(value)) return cloneDefaultRoster();

  const normalized = value
    .map((entry, index) => normalizeEntry(entry as Partial<AgentRosterEntry>, index))
    .filter((entry): entry is AgentRosterEntry => entry !== null);

  return normalized.length > 0 ? dedupeNames(normalized) : cloneDefaultRoster();
}

function loadRosterFromStorage(): AgentRosterEntry[] {
  if (!canUseLocalStorage()) return cloneDefaultRoster();

  try {
    const saved = localStorage.getItem(ROSTER_STORAGE_KEY);
    return saved ? normalizeRoster(JSON.parse(saved)) : cloneDefaultRoster();
  } catch (e) {
    console.warn('[RosterStore] Failed to load roster from localStorage:', e);
    return cloneDefaultRoster();
  }
}

function saveRosterToStorage(roster: AgentRosterEntry[]): void {
  if (!canUseLocalStorage()) return;

  try {
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
  } catch (e) {
    console.warn('[RosterStore] Failed to save roster to localStorage:', e);
  }
}

export const useRosterStore = create<RosterState>((set, get) => ({
  roster: loadRosterFromStorage(),

  addEntry: (entry) => {
    const roster = get().roster;
    const normalized = normalizeEntry({ ...entry, id: crypto.randomUUID() }, roster.length);
    if (!normalized) return;

    const nextRoster = dedupeNames([...roster, normalized]);
    saveRosterToStorage(nextRoster);
    set({ roster: nextRoster });
  },

  duplicateEntry: (index) => {
    const roster = get().roster;
    const source = roster[index];
    if (!source) return;
    const copy = normalizeEntry({ ...source, id: crypto.randomUUID(), reasoningLevel: nextUnusedReasoningLevel(roster, source) }, roster.length);
    if (!copy) return;

    const nextRoster = dedupeNames([...roster, copy]);
    saveRosterToStorage(nextRoster);
    set({ roster: nextRoster });
  },

  removeEntry: (index) => {
    const nextRoster = get().roster.filter((_, currentIndex) => currentIndex !== index);
    saveRosterToStorage(nextRoster);
    set({ roster: nextRoster });
  },

  updateEntry: (index, patch) => {
    const roster = get().roster;
    const current = roster[index];
    if (!current) return;

    const providerChanged = patch.provider !== undefined && patch.provider !== current.provider;
    const identityChanged = providerChanged || (patch.connectionId !== undefined && patch.connectionId !== current.connectionId) || (patch.modelId !== undefined && patch.modelId !== current.modelId);
    const merged = {
      ...current,
      ...patch,
      capabilities: Object.hasOwn(patch, 'capabilities') ? patch.capabilities : identityChanged ? undefined : current.capabilities,
      connectionId: providerChanged && patch.connectionId === undefined ? undefined : patch.connectionId ?? current.connectionId,
      modelId: providerChanged && patch.modelId === undefined
        ? undefined
        : patch.modelId ?? current.modelId,
      // A reasoning level only makes sense for the provider it was chosen for:
      // reset it on provider change so a stale value never leaks across kinds.
      reasoningLevel: Object.hasOwn(patch, 'reasoningLevel') ? patch.reasoningLevel : identityChanged ? undefined : current.reasoningLevel,
    };
    const normalized = normalizeEntry(merged, index);
    if (!normalized) return;

    const nextRoster = dedupeNames(
      roster.map((entry, currentIndex) => (currentIndex === index ? normalized : entry))
    );
    saveRosterToStorage(nextRoster);
    set({ roster: nextRoster });
  },

  setRoster: (roster) => {
    const normalized = normalizeRoster(roster);
    saveRosterToStorage(normalized);
    set({ roster: normalized });
  },

  resetRoster: () => {
    const roster = cloneDefaultRoster();
    saveRosterToStorage(roster);
    set({ roster });
  },
}));

export const useAgentRoster = () => useRosterStore((state) => state.roster);
