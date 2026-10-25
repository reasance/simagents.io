import { getDefaultModelId, getModelCatalogEntry, getProviderCatalogEntry, isLLMProviderId, type AgentRosterEntry } from '@simagents/shared';
import { translateLabel } from '../i18n';
import type { Agent } from '../stores/world';

/** The roster entry an agent was spawned from: by stable id, or by name for older worlds. */
export function rosterEntryFor(agent: Pick<Agent, 'rosterEntryId' | 'name'>, roster: AgentRosterEntry[]): AgentRosterEntry | undefined {
  return roster.find((entry) => (entry.id ?? `legacy:${entry.name}`) === agent.rosterEntryId) ?? roster.find((entry) => entry.name === agent.name);
}

export function modelLabel(entry: Pick<AgentRosterEntry, 'provider' | 'modelId'>): string {
  if (!isLLMProviderId(entry.provider)) return translateLabel(entry.provider.replace(/^baseline_/, '').replace(/_/g, ' '));
  return getModelCatalogEntry(entry.provider, entry.modelId)?.label ?? entry.modelId;
}

export function providerLabel(entry: Pick<AgentRosterEntry, 'provider'>): string {
  return isLLMProviderId(entry.provider) ? getProviderCatalogEntry(entry.provider)?.displayName ?? entry.provider : translateLabel('Baseline');
}

/** Reasoning setting as the observer reads it, or undefined for the provider default. */
export function effortLabel(entry: Pick<AgentRosterEntry, 'reasoningLevel'>): string | undefined {
  const value = entry.reasoningLevel;
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return translateLabel(value ? 'Thinking on' : 'Thinking off');
  if (typeof value === 'number') return `${value} tok`;
  return translateLabel(value);
}

/** "Claude Opus 5.5 · max" */
export function participantSummary(entry: AgentRosterEntry): string {
  return [modelLabel(entry), effortLabel(entry)].filter(Boolean).join(' · ');
}

/** Participants a first dry run starts with: one model at two efforts and two other providers. */
export const DRY_RUN_SAMPLES: Array<Pick<AgentRosterEntry, 'name' | 'provider' | 'modelId' | 'reasoningLevel' | 'color'>> = [
  { name: 'Agent 1', provider: 'claude', modelId: getDefaultModelId('claude'), reasoningLevel: 'low', color: '#5ec8ff' },
  { name: 'Agent 2', provider: 'claude', modelId: getDefaultModelId('claude'), reasoningLevel: 'max', color: '#ff8a4c' },
  { name: 'Agent 3', provider: 'codex', modelId: getDefaultModelId('codex'), color: '#7ee05a' },
  { name: 'Agent 4', provider: 'gemini', modelId: getDefaultModelId('gemini'), reasoningLevel: 'low', color: '#d58cff' },
];
