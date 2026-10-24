import { z } from 'zod';
import { approvedRelayDestination } from './relay-policy';
import { BASELINE_PROVIDER_IDS, LLM_CATALOG, getModelCatalogEntry, getProviderCatalogEntry } from './llm-catalog';
import type { LLMType } from './types';

export const PROTOCOLS = ['openai-responses', 'chat-completions', 'anthropic-messages', 'gemini-generate-content'] as const;
export type TextProtocol = typeof PROTOCOLS[number];
export interface ProviderDefinition {
  id: LLMType; label: string; protocol: TextProtocol; endpoint: string; auth: 'bearer' | 'x-api-key' | 'google-key';
  cors: 'direct' | 'proxy'; variants: Array<{ label: string; endpoint: string; protocol?: TextProtocol }>;
}
const id = z.string().min(1).max(200).regex(/^[a-zA-Z0-9:_-]+$/).refine((value) => !['__proto__', 'constructor', 'prototype'].includes(value));
export const ModelCapabilitiesSchema = z.object({
  temperature: z.boolean(), output: z.enum(['text-json', 'json-object', 'json-schema']),
  tokenParameter: z.enum(['max_tokens', 'max_completion_tokens']),
  reasoning: z.enum(['none', 'effort', 'budget', 'gemini-level', 'thinking-toggle', 'enable-thinking']),
  maxOutputTokens: z.number().int().min(32).max(1000000),
}).strict();
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;
export const ConnectionProfileSchema = z.object({
  id, name: z.string().trim().min(1).max(100), providerId: z.string().min(1).max(100),
  protocol: z.enum(PROTOCOLS), endpoint: z.string().max(2048), credentialRef: id,
  transport: z.enum(['direct', 'user-relay', 'official-relay']), relayUrl: z.string().max(2048).optional(), relayCredentialRef: id.optional(),
}).strict();
export type ConnectionProfile = z.infer<typeof ConnectionProfileSchema>;
export function secureEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS endpoint without credentials, query or fragment');
  return url.href.replace(/\/+$/, '');
}
export function validateConnectionProfile(value: unknown): ConnectionProfile {
  const profile = ConnectionProfileSchema.parse(value);
  if (!getProviderCatalogEntry(profile.providerId as LLMType)) throw new Error('Unknown provider definition');
  profile.endpoint = secureEndpoint(profile.endpoint);
  if (profile.transport !== 'direct') profile.relayUrl = secureEndpoint(profile.relayUrl ?? '');
  if (profile.transport === 'official-relay') {
    if (new URL(profile.relayUrl!).pathname !== '/') throw new Error('Official relay URL must be an HTTPS origin without a path');
    if (!profile.relayCredentialRef || profile.relayCredentialRef === profile.credentialRef) throw new Error('A separate official relay access credential reference is required');
    if (!approvedRelayDestination(profile.providerId, profile.protocol, profile.endpoint)) throw new Error('This endpoint is not approved for the official relay; use direct access or your own relay');
  }
  return profile;
}
export const PROVIDER_DEFINITIONS: ProviderDefinition[] = LLM_CATALOG.map((p) => ({
  id: p.id, label: p.displayName, endpoint: p.id === 'codex' ? 'https://api.openai.com/v1/responses' : p.endpoint,
  protocol: p.id === 'codex' ? 'openai-responses' : p.id === 'claude' ? 'anthropic-messages' : p.id === 'gemini' ? 'gemini-generate-content' : 'chat-completions',
  auth: p.authStyle, cors: p.cors,
  variants: p.id === 'codex' ? [{ label: 'Chat Completions', endpoint: p.endpoint, protocol: 'chat-completions' }]
    : p.id === 'glm' ? [{ label: 'Coding Plan (requires a matching subscription)', endpoint: 'https://api.z.ai/api/coding/paas/v4/chat/completions' }]
    : p.id === 'qwen' ? [{ label: 'China (Beijing)', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' }] : [],
}));
export function defaultConnection(providerId: LLMType, relayUrl = ''): ConnectionProfile {
  const definition = PROVIDER_DEFINITIONS.find((p) => p.id === providerId)!;
  return { id: `provider:${providerId}`, name: definition.label, providerId, protocol: definition.protocol,
    endpoint: definition.endpoint, credentialRef: providerId, transport: definition.cors === 'direct' ? 'direct' : 'user-relay', relayUrl };
}
export function defaultCapabilities(provider: string, modelId: string, protocol: TextProtocol): ModelCapabilities {
  const known = getModelCatalogEntry(provider as LLMType, modelId);
  const kind = known?.reasoning.kind;
  return {
    temperature: !!known && kind === 'none', output: protocol === 'gemini-generate-content' ? 'json-object' : 'text-json',
    tokenParameter: ['codex', 'kimi', 'minimax'].includes(provider) ? 'max_completion_tokens' : 'max_tokens', maxOutputTokens: 32768,
    reasoning: !known || kind === 'none' || kind === 'model-swap' ? 'none'
      : protocol === 'gemini-generate-content' ? (modelId.startsWith('gemini-2.5') ? 'budget' : 'gemini-level')
      : kind === 'budget' ? 'budget' : kind === 'effort' ? 'effort' : provider === 'qwen' ? 'enable-thinking' : 'thinking-toggle',
  };
}

const rosterEntrySchema = z.object({
  id: z.string().min(1).max(200).optional(), name: z.string().min(1).max(100),
  provider: z.string().refine((value) => LLM_CATALOG.some((p) => p.id === value) || (BASELINE_PROVIDER_IDS as readonly string[]).includes(value)),
  modelId: z.string().min(1).max(500), color: z.string().min(1).max(100), personality: z.string().max(100).nullable().optional(),
  connectionId: id.or(z.literal('')).optional(), capabilities: ModelCapabilitiesSchema.optional(),
  reasoningLevel: z.union([z.string().max(100), z.number().finite(), z.boolean()]).optional(),
}).strict();
export function validateRoster(value: unknown): import('./llm-catalog').AgentRosterEntry[] {
  const entries = z.array(rosterEntrySchema).max(1000).parse(value);
  const ids = entries.map((entry) => entry.id ?? `legacy:${entry.name}`);
  if (new Set(ids).size !== ids.length) throw new Error('Roster entries require unique stable IDs');
  return entries as import('./llm-catalog').AgentRosterEntry[];
}
