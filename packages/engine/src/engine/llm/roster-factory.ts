import type { RequestTrace } from './request-trace';
import {
  getDefaultModelId,
  isBaselineProviderId,
  isDecisionProtocol,
  isLLMProviderId,
  reconcileReasoning,
  type AgentRosterEntry,
  type LLMType,
  type ConnectionProfile,
  validateConnectionProfile,
} from '@simagents/shared';
import type { Agent } from '../../db/schema';
import { store } from '../../engine-memory/store';
import {
  BaselineDecisionProvider,
  type DecisionProvider,
} from '../decision';
// Keep the provider in the Worker entry bundle. A lazy chunk can import the
// entry back and reinstall onmessage with an empty session in WebKit.
import { LLMDecisionProvider } from './llm-provider';
import { DecisionModelProvider } from './decision-model-provider';
import { ProviderUnavailableError } from './request-builder';
import type { RequestBudget } from './request-budget';
import type { KeySource } from './keys';

export interface RosterProviderFactoryOptions {
  onTrace?: (trace: RequestTrace) => void;
  traceSecrets?: string[];
  budget?: RequestBudget;
  connections?: ConnectionProfile[];
  getRelayAccessToken?: (profile: ConnectionProfile) => string | undefined;
  proxyUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderFactoryTools {
  sleepWall(wallMs: number, signal: AbortSignal): Promise<void>;
}

export type RosterProviderFactory = (
  agent: Agent,
  tools: ProviderFactoryTools
) => DecisionProvider;

export function createRosterProviderFactory(
  roster: AgentRosterEntry[],
  keySource: KeySource,
  options: RosterProviderFactoryOptions = {}
): RosterProviderFactory {
  const connections = new Map((options.connections ?? []).map((profile) => [profile.id, validateConnectionProfile(profile)]));
  const entriesById = new Map(roster.map((entry) => [entry.id ?? `legacy:${entry.name}`, entry]));
  const entriesByName = new Map(roster.map((entry) => [entry.name, entry]));
  const entryForAgent = (agent: Agent, visited = new Set<string>()): AgentRosterEntry | undefined => {
    if (visited.has(agent.id)) return undefined;
    visited.add(agent.id);
    if (agent.rosterEntryId) return entriesById.get(agent.rosterEntryId);
    if (agent.connectionId && entriesById.has(agent.connectionId)) return entriesById.get(agent.connectionId);
    // Legacy snapshot migration only; new agents carry connectionId.
    const entry = agent.name ? entriesByName.get(agent.name) : undefined;
    if (entry) { agent.rosterEntryId = entry.id ?? `legacy:${entry.name}`; return entry; }
    const lineage = [...store.agentLineages.values()].find((row) => row.agentId === agent.id);
    const parentId = lineage?.parentIds?.[0] ?? lineage?.spawnedByParentId;
    const parent = parentId ? store.agents.get(parentId) : undefined;
    const inherited = parent ? entryForAgent(parent, visited) : undefined;
    if (inherited) agent.rosterEntryId = inherited.id ?? `legacy:${inherited.name}`;
    return inherited;
  };

  return (agent) => {
    const entry = entryForAgent(agent);

    if (!entry) {
      throw new Error(`No configured connection for agent ${agent.id}`);
    }
    if (isBaselineProviderId(entry.provider)) {
      return new BaselineDecisionProvider(entry.provider);
    }
    if (!isLLMProviderId(entry.provider)) {
      throw new Error(`No configured connection for agent ${agent.id}`);
    }

    const connection = entry.connectionId ? connections.get(entry.connectionId) : undefined;
    if (entry.connectionId && !connection) throw new Error(`Connection profile not found: ${entry.connectionId}`);
    // Upgrade old snapshots without relying on a display name on later resumes.
    if (entry.connectionId) {
      agent.rosterEntryId = entry.id ?? `legacy:${entry.name}`;
      agent.connectionId = entry.connectionId;
    }
    const provider = (connection?.providerId ?? entry.provider) as LLMType;
    const apiKey = keySource.getKey(connection?.credentialRef ?? provider);
    if (!apiKey) {
      return new UnavailableDecisionProvider(provider, 'no-key');
    }

    if (connection && isDecisionProtocol(connection.protocol)) {
      return new DecisionModelProvider({
        provider,
        connection,
        connectionId: connection.id,
        modelId: entry.modelId || getDefaultModelId(provider),
        apiKey,
        budget: options.budget,
      });
    }

    // Saved worlds may predate a model's move from thinking budgets to effort levels.
    const modelId = entry.modelId || getDefaultModelId(provider);
    const { reasoningLevel, capabilities } = reconcileReasoning(provider, modelId, entry.reasoningLevel, entry.capabilities);
    return new LLMDecisionProvider({
      provider,
      budget: options.budget,
      onTrace: options.onTrace,
      traceSecrets: options.traceSecrets,
      connectionId: connection?.id ?? provider,
      connection,
      relayAccessToken: connection?.relayCredentialRef ? keySource.getKey(connection.relayCredentialRef) : undefined,
      getRelayAccessToken: connection?.transport === 'official-relay' && options.getRelayAccessToken
        ? () => options.getRelayAccessToken!(connection) : undefined,
      capabilities,
      modelId,
      reasoningLevel,
      apiKey,
      proxyUrl: options.proxyUrl,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
  };
}

class UnavailableDecisionProvider implements DecisionProvider {
  readonly kind: string;

  constructor(
    private readonly provider: LLMType,
    private readonly reason: 'no-key' | 'needs-proxy'
  ) {
    this.kind = provider;
  }

  async decide(): Promise<never> {
    throw new ProviderUnavailableError(this.provider, this.reason);
  }
}
