import { ModelCapabilitiesSchema, validateConnectionProfile, type ConnectionProfile, type ModelCapabilities, type ReasoningLevel, type TextProtocol } from '@simagents/shared';
import type { ProviderPrompt, ProviderRequest } from './request-builder';

export const DECISION_SCHEMA = {
  type: 'object', properties: { action: { type: 'string' }, paramsJson: { type: 'string', description: 'A JSON object encoded as a string, containing action parameters.' }, reasoning: { type: 'string' } },
  required: ['action', 'paramsJson', 'reasoning'], additionalProperties: false,
};
export interface AdapterInput {
  relayAccessToken?: string;
  connection: ConnectionProfile; capabilities: ModelCapabilities; modelId: string; apiKey: string;
  prompt: ProviderPrompt; maxTokens: number; temperature?: number; reasoningLevel?: ReasoningLevel;
}
export function buildProtocolRequest(input: AdapterInput): ProviderRequest {
  const connection = validateConnectionProfile(input.connection);
  const capabilities = ModelCapabilitiesSchema.parse(input.capabilities);
  if (!input.apiKey.trim()) throw new Error('A credential is required');
  if (!input.modelId.trim() || input.modelId.length > 500) throw new Error('A model ID is required');
  if (!Number.isInteger(input.maxTokens) || input.maxTokens < 1 || input.maxTokens > capabilities.maxOutputTokens) throw new Error('Output token limit exceeds the configured model capability');
  if (input.temperature !== undefined && (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2)) throw new Error('Invalid temperature');
  if (connection.protocol === 'anthropic-messages' && capabilities.output === 'json-object') throw new Error('Anthropic supports text JSON or JSON schema, not JSON object mode');
  const opts = { ...input, connection, capabilities };
  const adapter = ADAPTERS[connection.protocol];
  const system = input.prompt.system + (capabilities.output === 'json-schema'
    ? '\nWire format: return action, paramsJson (the action params object encoded as a JSON string), and reasoning. Do not return a params field.' : '');
  const body = adapter({ ...opts, prompt: { ...input.prompt, system } });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (connection.protocol === 'anthropic-messages') Object.assign(headers, { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
  else if (connection.protocol === 'gemini-generate-content') headers['x-goog-api-key'] = input.apiKey;
  else headers.Authorization = `Bearer ${input.apiKey}`;
  let url = connection.endpoint;
  if (connection.protocol === 'gemini-generate-content') url += `/${encodeURIComponent(input.modelId)}:generateContent`;
  if (connection.transport === 'user-relay') url = `${connection.relayUrl}/${url.slice('https://'.length)}`;
  if (connection.providerId === 'openrouter') {
    if (input.modelId === 'openrouter/auto' || input.modelId.endsWith(':floor') || input.modelId.endsWith(':nitro')) throw new Error('Select an explicit OpenRouter model without routing aliases');
    body.provider = { allow_fallbacks: false, require_parameters: true };
  }
  if (connection.transport === 'official-relay') {
    if (!input.relayAccessToken?.trim()) throw new Error('Enter or unlock the official relay access token');
    return { url: `${connection.relayUrl}/v1/inference`, protocol: connection.protocol,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.relayAccessToken}`, 'X-Provider-Key': input.apiKey },
      body: { providerId: connection.providerId, protocol: connection.protocol, endpoint: connection.endpoint, modelId: input.modelId, body },
    };
  }
  return { url, headers, body, protocol: connection.protocol };
}
function sampling(input: AdapterInput): Record<string, unknown> {
  return input.capabilities.temperature && input.temperature !== undefined ? { temperature: input.temperature } : {};
}
function reasoning(input: AdapterInput): Record<string, unknown> {
  const value = input.reasoningLevel;
  if (value === undefined) return {};
  const kind = input.capabilities.reasoning;
  if (kind === 'none') {
    if (value === false || value === 'none' || value === 0) return {};
    throw new Error('Reasoning parameters are not configured for this model');
  }
  if (kind === 'budget') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= input.maxTokens) throw new Error('Thinking budget must be a nonnegative integer below the session output token limit');
    if (input.connection.protocol === 'gemini-generate-content') return { thinkingConfig: { thinkingBudget: value } };
    if (input.connection.protocol !== 'anthropic-messages') throw new Error('Budget reasoning requires Anthropic or Gemini protocol');
    if (value === 0) return { thinking: { type: 'disabled' } };
    if (value < 1024) throw new Error('Anthropic thinking budget must be at least 1024');
    return { thinking: { type: 'enabled', budget_tokens: value } };
  }
  if (kind === 'gemini-level') {
    if (input.connection.protocol !== 'gemini-generate-content' || typeof value !== 'string' || !['minimal', 'low', 'medium', 'high'].includes(value)) throw new Error('Invalid Gemini thinking level');
    return { thinkingConfig: { thinkingLevel: value } };
  }
  if (kind === 'effort') {
    if (typeof value !== 'string' || !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value)) throw new Error('Invalid reasoning effort');
    if (input.connection.protocol === 'openai-responses') return { reasoning: { effort: value } };
    // Claude 5.x replaced manual thinking budgets with adaptive thinking steered by effort.
    if (input.connection.protocol === 'anthropic-messages') {
      if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(value)) throw new Error('Invalid Anthropic effort');
      return { output_config: { effort: value } };
    }
    if (input.connection.protocol !== 'chat-completions') throw new Error('Effort reasoning requires an OpenAI-compatible or Anthropic protocol');
    return { reasoning_effort: value };
  }
  if (input.connection.protocol !== 'chat-completions' || typeof value !== 'boolean') throw new Error('This reasoning switch requires a boolean and Chat Completions');
  return kind === 'enable-thinking' ? { enable_thinking: value } : { thinking: { type: value ? 'enabled' : 'disabled' } };
}
const ADAPTERS: Record<TextProtocol, (input: AdapterInput) => Record<string, unknown>> = {
  'openai-responses': (i) => ({
    model: i.modelId, instructions: i.prompt.system, input: i.prompt.user, store: false,
    max_output_tokens: i.maxTokens, ...sampling(i), ...reasoning(i),
    ...(i.capabilities.output === 'json-object' ? { text: { format: { type: 'json_object' } } } :
      i.capabilities.output === 'json-schema' ? { text: { format: { type: 'json_schema', name: 'simulation_action', strict: true, schema: DECISION_SCHEMA } } } : {}),
  }),
  'chat-completions': (i) => ({
    model: i.modelId, messages: [{ role: 'system', content: i.prompt.system }, { role: 'user', content: i.prompt.user }],
    [i.capabilities.tokenParameter]: i.maxTokens, ...sampling(i), ...reasoning(i),
    ...(i.connection.providerId === 'codex' ? { store: false } : {}),
    ...(i.capabilities.output === 'json-object' ? { response_format: { type: 'json_object' } } :
      i.capabilities.output === 'json-schema' ? { response_format: { type: 'json_schema', json_schema: { name: 'simulation_action', strict: true, schema: DECISION_SCHEMA } } } : {}),
  }),
  'anthropic-messages': (i) => {
    const { output_config: effortConfig, ...thinking } = reasoning(i) as { output_config?: Record<string, unknown> };
    const outputConfig = { ...effortConfig, ...(i.capabilities.output === 'json-schema' ? { format: { type: 'json_schema', schema: DECISION_SCHEMA } } : {}) };
    return {
      model: i.modelId, system: i.prompt.system, messages: [{ role: 'user', content: i.prompt.user }],
      max_tokens: i.maxTokens, ...sampling(i), ...thinking,
      ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
    };
  },
  'gemini-generate-content': (i) => ({
    systemInstruction: { parts: [{ text: i.prompt.system }] }, contents: [{ role: 'user', parts: [{ text: i.prompt.user }] }],
    generationConfig: { maxOutputTokens: i.maxTokens, ...sampling(i), ...reasoning(i),
      ...(i.capabilities.output !== 'text-json' ? { responseMimeType: 'application/json' } : {}),
      ...(i.capabilities.output === 'json-schema' ? { responseJsonSchema: DECISION_SCHEMA } : {}),
    },
  }),
};
export function normalizeDecisionText(text: string, structured: boolean): string {
  if (!structured) return text;
  const value = JSON.parse(text);
  if (!value || typeof value.action !== 'string' || typeof value.paramsJson !== 'string' || typeof value.reasoning !== 'string') throw new Error('Invalid structured decision');
  return JSON.stringify({ action: value.action, params: JSON.parse(value.paramsJson), reasoning: value.reasoning });
}
