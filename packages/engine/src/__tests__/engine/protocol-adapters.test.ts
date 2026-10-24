import { expect, test } from 'bun:test';
import { defaultCapabilities, defaultConnection, validateConnectionProfile, type ConnectionProfile, type TextProtocol } from '@simagents/shared';
import { buildProtocolRequest, normalizeDecisionText } from '../../engine/llm/protocol-adapters';
import { extractProviderResponse } from '../../engine/llm/response-extractor';
import { createRosterProviderFactory } from '../../engine/llm/roster-factory';
import { createAgent } from '../../engine-memory/queries/agents';
import { resetStore } from '../../engine-memory/store';
const protocols: TextProtocol[] = ['openai-responses', 'chat-completions', 'anthropic-messages', 'gemini-generate-content'];
function input(protocol: TextProtocol) {
  const connection: ConnectionProfile = { ...defaultConnection('codex'), protocol, transport: 'direct' as const, endpoint: 'https://fixture.example/v1/models' };
  return { connection, capabilities: defaultCapabilities('codex', 'custom-model', protocol), modelId: 'custom-model', apiKey: 'fixture', maxTokens: 256, prompt: { system: 'Return JSON', user: 'Choose an action' } };
}
test.each(protocols)('%s honors explicit model, tokens and structured output without external tools', (protocol) => {
  const opts = input(protocol);
  opts.capabilities.output = 'json-schema';
  const request = buildProtocolRequest(opts);
  const body = JSON.stringify(request.body);
  expect(body).toContain('paramsJson');
  expect(body).toContain('256');
  expect(request.body.tools).toBeUndefined();
  expect(request.headers).not.toHaveProperty('Cookie');
  if (protocol !== 'gemini-generate-content') expect(request.body.model).toBe('custom-model');
  else expect(request.url).toEndWith('/custom-model:generateContent');
  if (protocol === 'openai-responses') expect(request.body.store).toBe(false);
});
test('Gemini levels and budgets use distinct fields; thought text never becomes an action', () => {
  const opts = input('gemini-generate-content');
  opts.capabilities.reasoning = 'gemini-level';
  expect(JSON.stringify(buildProtocolRequest({ ...opts, reasoningLevel: 'low' }).body)).toContain('thinkingLevel');
  expect(() => buildProtocolRequest({ ...opts, reasoningLevel: 100 })).toThrow();
  opts.capabilities.reasoning = 'budget';
  expect(JSON.stringify(buildProtocolRequest({ ...opts, reasoningLevel: 100 }).body)).toContain('thinkingBudget');
  const response = extractProviderResponse('gemini', { candidates: [{ content: { parts: [{ thought: true, text: 'internal' }, { text: 'final' }] } }] });
  expect(response.text).toBe('final');
});
test('Responses reads output_text blocks, not reasoning or function calls', () => {
  const response = extractProviderResponse('codex', { output: [{ type: 'reasoning', content: 'ignore' }, { type: 'function_call', arguments: '{}' }, { type: 'message', content: [{ type: 'output_text', text: 'answer' }] }], usage: { input_tokens: 3, output_tokens: 2 } }, 'openai-responses');
  expect(response.text).toBe('answer'); expect(response.usage?.outputTokens).toBe(2);
  expect(normalizeDecisionText('{"action":"sleep","paramsJson":"{\\"duration\\":1}","reasoning":"test"}', true)).toContain('"params":{"duration":1}');
  expect(() => normalizeDecisionText('{"action":"sleep","paramsJson":"not JSON"}', true)).toThrow();
});
test('OpenRouter sends one exact model and disables fallbacks', () => {
  const opts = input('chat-completions'); opts.connection = { ...defaultConnection('openrouter'), transport: 'direct' };
  const request = buildProtocolRequest(opts);
  expect(request.body.provider).toEqual({ allow_fallbacks: false, require_parameters: true });
  expect(request.body.models).toBeUndefined();
  expect(() => buildProtocolRequest({ ...opts, modelId: 'openrouter/auto' })).toThrow();
});
test('profile validation excludes secrets and insecure endpoints', () => {
  const profile = { ...defaultConnection('claude'), transport: 'direct' as const };
  expect(() => validateConnectionProfile({ ...profile, apiKey: 'secret' })).toThrow();
  expect(() => validateConnectionProfile({ ...profile, endpoint: 'http://provider.test' })).toThrow();
  expect(() => validateConnectionProfile({ ...profile, endpoint: 'https://secret@provider.test' })).toThrow();
  expect(() => validateConnectionProfile({ ...profile, credentialRef: '__proto__' })).toThrow();
});
test('stable roster identity resolves a separate profile and credential after renaming', async () => {
  resetStore();
  const connection = { ...defaultConnection('claude'), id: 'profile-a', credentialRef: 'credential-a' };
  const agent = await createAgent({ llmType: 'claude', name: 'old name', rosterEntryId: 'roster-a', connectionId: 'profile-a' });
  let requested: string | undefined;
  const factory = createRosterProviderFactory([{ id: 'roster-a', name: 'new name', connectionId: 'profile-a', provider: 'claude', modelId: 'exact-model', color: '#000000' }], { getKey: (ref) => { requested = ref; return 'fixture'; } }, { connections: [connection] });
  expect(factory(agent, { sleepWall: async () => {} }).kind).toBe('claude');
  expect(requested).toBe('credential-a');
  resetStore();
});

test('roster metadata rejects duplicate identities, secrets and nonfinite model parameters', async () => {
  const { validateRoster } = await import('@simagents/shared');
  const entry = { id: 'stable-a', provider: 'codex', modelId: 'custom-model', name: 'A', color: '#000000' };
  expect(() => validateRoster([entry, { ...entry, name: 'B' }])).toThrow('unique stable');
  expect(() => validateRoster([{ ...entry, apiKey: 'secret' }])).toThrow();
  expect(() => validateRoster([{ ...entry, reasoningLevel: Infinity }])).toThrow();
});

test('resuming a converted legacy roster upgrades stored agent connection identity', async () => {
  resetStore();
  const agent = await createAgent({ llmType: 'claude', name: 'old display name', connectionId: 'old-roster-id' });
  const connection = { ...defaultConnection('claude'), id: 'new-profile', credentialRef: 'claude' };
  const factory = createRosterProviderFactory([{ id: 'old-roster-id', name: 'renamed', provider: 'claude', modelId: 'exact-model', connectionId: 'new-profile', color: '#000000' }], { getKey: () => 'fixture' }, { connections: [connection] });
  factory(agent, { sleepWall: async () => {} });
  expect(agent.rosterEntryId).toBe('old-roster-id'); expect(agent.connectionId).toBe('new-profile');
  resetStore();
});
test('Claude 5.x effort travels in output_config and merges with structured output', () => {
  const connection = defaultConnection('claude');
  const capabilities = defaultCapabilities('claude', 'claude-opus-5-5', connection.protocol);
  expect(capabilities.reasoning).toBe('effort');
  const plain = buildProtocolRequest({ connection, capabilities, modelId: 'claude-opus-5-5', apiKey: 'fixture', maxTokens: 256, prompt: { system: 's', user: 'u' }, reasoningLevel: 'max' });
  expect(plain.body.output_config).toEqual({ effort: 'max' });
  expect(plain.body.thinking).toBeUndefined();
  const structured = buildProtocolRequest({ connection, capabilities: { ...capabilities, output: 'json-schema' }, modelId: 'claude-opus-5-5', apiKey: 'fixture', maxTokens: 256, prompt: { system: 's', user: 'u' }, reasoningLevel: 'low' });
  expect(structured.body.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
  expect(() => buildProtocolRequest({ connection, capabilities, modelId: 'claude-opus-5-5', apiKey: 'fixture', maxTokens: 256, prompt: { system: 's', user: 'u' }, reasoningLevel: 'none' })).toThrow('Anthropic effort');
});
test('Kimi and MiniMax use max_completion_tokens with a top-level reasoning effort', () => {
  for (const [provider, modelId] of [['kimi', 'kimi-k3.1-pro'], ['minimax', 'MiniMax-M3.1-Flash']] as const) {
    const connection = defaultConnection(provider, 'https://relay.example.test');
    const request = buildProtocolRequest({ connection, capabilities: defaultCapabilities(provider, modelId, connection.protocol), modelId, apiKey: 'fixture', maxTokens: 256, prompt: { system: 's', user: 'u' }, reasoningLevel: 'max' });
    expect(request.body.max_completion_tokens).toBe(256);
    expect(request.body.max_tokens).toBeUndefined();
    expect(request.body.reasoning_effort).toBe('max');
  }
});
test('Mistral thinking chunks are kept out of the decision text', () => {
  const response = extractProviderResponse('mistral', { choices: [{ message: { content: [{ type: 'thinking', thinking: [{ type: 'text', text: 'private reasoning' }] }, { type: 'text', text: '{"action":"sleep"}' }] } }] }, 'chat-completions');
  expect(response.text).toBe('{"action":"sleep"}');
  expect(response.thinkingText).toBe('private reasoning');
});
