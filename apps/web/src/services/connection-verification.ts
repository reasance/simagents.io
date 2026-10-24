import { assertOfficialRelay } from './official-relay';
import { registerCredentialRequest } from './credential-requests';
import { defaultCapabilities, isDecisionProtocol, type ConnectionProfile, type ModelCapabilities, type LLMType, type ReasoningLevel } from '@simagents/shared';
import { LLMDecisionProvider } from '@simagents/engine/engine/llm/llm-provider';
import { DecisionModelProvider } from '@simagents/engine/engine/llm/decision-model-provider';
import { RequestBudget, DEFAULT_SESSION_LIMITS } from '@simagents/engine/engine/llm/request-budget';
export function verificationSignature(profile: ConnectionProfile, modelId: string, capabilities: ModelCapabilities | undefined, reasoning: ReasoningLevel | undefined, maxTokens: number, credentialRevision: number): string {
  return JSON.stringify([profile, modelId, capabilities, reasoning, maxTokens, credentialRevision]);
}
/** One explicitly requested inference, never called by mounting or editing controls. */
export async function verifyConnection(profile: ConnectionProfile, modelId: string, key: string, capabilities: ModelCapabilities | undefined, reasoningLevel: ReasoningLevel | undefined, maxTokens: number, relayAccessToken?: string): Promise<void> {
  assertOfficialRelay(profile);
  const controller = new AbortController();
  const unregister = registerCredentialRequest(controller);
  const timer = setTimeout(() => controller.abort(), 20000);
  const budget = new RequestBudget({ ...DEFAULT_SESSION_LIMITS, maxRequests: 1, maxDurationSeconds: 20, maxOutputTokens: maxTokens });
  try {
    if (isDecisionProtocol(profile.protocol)) {
      await new DecisionModelProvider({ provider: profile.providerId as LLMType, connection: profile, modelId, apiKey: key, budget }).probe(controller.signal);
      return;
    }
    const provider = new LLMDecisionProvider({ provider: profile.providerId as LLMType, modelId, apiKey: key, connection: profile,
      capabilities: capabilities ?? defaultCapabilities(profile.providerId, modelId, profile.protocol), reasoningLevel, maxTokens, budget, relayAccessToken });
    await provider.decideWithPrompt({ system: 'Return a simulation action as JSON only. Do not use tools.', user: 'Return exactly this action and parameters: {"action":"speak","params":{"message":"connection verified"},"reasoning":"connection test"}' }, controller.signal);
  } finally { unregister(); clearTimeout(timer); budget.dispose(); }
}
