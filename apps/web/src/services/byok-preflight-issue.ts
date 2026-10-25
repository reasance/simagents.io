import type { AppIssue } from '@simagents/shared';
import { assertOfficialRelay } from './official-relay';
import { getProviderCatalogEntry, isLLMProviderId, type AgentRosterEntry, type LLMType, type ConnectionProfile, validateConnectionProfile, ModelCapabilitiesSchema } from '@simagents/shared';

/** Internal fixtures must be enabled at build time and never ship in production. */
export function internalFixturesEnabled(): boolean {
  return import.meta.env?.DEV === true && import.meta.env?.VITE_INTERNAL_TESTS === 'true';
}
/** A dry run needs only participants with a model: no keys, connections or verification. */
export function dryRunPreflightIssue(roster: AgentRosterEntry[], internal = false): AppIssue | undefined {
  if (!roster.length) return { code: 'BYOK_AGENT_REQUIRED' };
  for (const entry of roster) {
    if (!isLLMProviderId(entry.provider)) {
      if (internal) continue;
      return { code: 'BYOK_INTERNAL', parameters: { agent: entry.name } };
    }
    if (!entry.modelId.trim()) return { code: 'BYOK_MODEL', parameters: { agent: entry.name } };
  }
  return undefined;
}
export function byokPreflightIssue(roster: AgentRosterEntry[], keys: Partial<Record<string, string>>, proxyUrl: string, internal = false, connections: ConnectionProfile[] = []): AppIssue | undefined {
  if (!roster.length) return { code: 'BYOK_AGENT_REQUIRED' };
  for (const entry of roster) {
    if (!isLLMProviderId(entry.provider)) {
      if (internal) continue;
      return { code: 'BYOK_INTERNAL', parameters: { agent: entry.name } };
    }
    if (entry.connectionId) {
      const found = connections.find((p) => p.id === entry.connectionId);
      if (!found) return { code: 'BYOK_CONNECTION', parameters: { agent: entry.name } };
      try {
        const profile = validateConnectionProfile(found);
        assertOfficialRelay(profile);
        if (profile.transport === 'official-relay' && !keys[profile.relayCredentialRef!]?.trim()) return { code: 'BYOK_RELAY_TOKEN', parameters: { agent: entry.name } };
        if (profile.providerId !== entry.provider) return { code: 'BYOK_PROVIDER_MISMATCH', parameters: { agent: entry.name } };
        if (!keys[profile.credentialRef]?.trim()) return { code: 'BYOK_KEY', parameters: { agent: entry.name } };
        if (!entry.modelId.trim()) return { code: 'BYOK_MODEL', parameters: { agent: entry.name } };
        if (entry.capabilities) ModelCapabilitiesSchema.parse(entry.capabilities);
      } catch { return { code: 'BYOK_CONFIGURATION', parameters: { agent: entry.name } }; }
      continue;
    }
    if (!internal) return { code: 'BYOK_MIGRATION', parameters: { agent: entry.name } };
    if (!entry.modelId.trim()) return { code: 'BYOK_MODEL', parameters: { agent: entry.name } };
    if (!keys[entry.provider]?.trim()) return { code: 'BYOK_PROVIDER_KEY', parameters: { agent: entry.name, provider: getProviderCatalogEntry(entry.provider)?.displayName ?? entry.provider } };
    if (getProviderCatalogEntry(entry.provider)?.cors === 'proxy') {
      try {
        const url = new URL(proxyUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
      } catch { return { code: 'BYOK_RELAY_URL', parameters: { agent: entry.name } }; }
    }
  }
  return undefined;
}

