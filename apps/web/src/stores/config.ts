/**
 * World configuration overrides for the next new world.
 *
 * Only starting values and needs decay are edited in the interface. Other
 * sections may exist in storage (older builds, scripted fixtures); they are
 * still passed to the engine at start and listed in Advanced settings so they
 * never act unseen.
 */

import { create } from 'zustand';

export interface AgentConfig {
  startingBalance: number;
  startingHunger: number;
  startingEnergy: number;
  startingHealth: number;
}

export interface NeedsConfig {
  hungerDecay: number;
  energyDecay: number;
  lowHungerThreshold: number;
  criticalHungerThreshold: number;
  lowEnergyThreshold: number;
  criticalEnergyThreshold: number;
}

export type ConfigOverrides = { agent?: Partial<AgentConfig>; needs?: Partial<NeedsConfig> } & Record<string, Record<string, unknown> | undefined>;

const CONFIG_STORAGE_KEY = 'simagents_config_overrides';
const MAX_STORED_BYTES = 64 * 1024;

function load(): ConfigOverrides {
  try {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!saved || saved.length > MAX_STORED_BYTES) return {};
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))) as ConfigOverrides;
  } catch {
    return {};
  }
}

function save(pending: ConfigOverrides): void {
  try {
    if (Object.keys(pending).length === 0) localStorage.removeItem(CONFIG_STORAGE_KEY);
    else localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(pending));
  } catch (e) {
    console.warn('[ConfigStore] Failed to save to localStorage:', e);
  }
}

export interface ConfigState {
  pendingChanges: ConfigOverrides;
  updateAgent: (updates: Partial<AgentConfig>) => void;
  updateNeeds: (updates: Partial<NeedsConfig>) => void;
  /** Clears every saved override, including sections the interface does not edit. */
  discardChanges: () => void;
}

export const useConfigStore = create<ConfigState>((set, get) => {
  const update = (section: 'agent' | 'needs', updates: Record<string, unknown>) => {
    const pendingChanges = { ...get().pendingChanges, [section]: { ...get().pendingChanges[section], ...updates } } as ConfigOverrides;
    set({ pendingChanges });
    save(pendingChanges);
  };
  return {
    pendingChanges: load(),
    updateAgent: (updates) => update('agent', updates),
    updateNeeds: (updates) => update('needs', updates),
    discardChanges: () => { save({}); set({ pendingChanges: {} }); },
  };
});
