import { expect, test } from 'bun:test';
import { buildProviderRequest, type ProviderRequestOptions } from '../../engine/llm/request-builder';
const base: ProviderRequestOptions = { provider: 'codex', modelId: 'fixture-custom', apiKey: 'fixture', proxyUrl: 'https://relay.example.test', maxTokens: 1024, prompt: { system: 'fixture', user: 'fixture' } };
test('requested model and token limit are never silently substituted or raised', () => {
  const request = buildProviderRequest(base);
  expect(request.body.model).toBe('fixture-custom');
  expect(request.body.max_completion_tokens).toBe(1024);
  expect(() => buildProviderRequest({ ...base, provider: 'deepseek', modelId: 'deepseek-chat', reasoningLevel: true })).toThrow();
  expect(() => buildProviderRequest({ ...base, provider: 'claude', modelId: 'claude-haiku-4-5', reasoningLevel: 4096 })).toThrow('token limit');
  expect(() => buildProviderRequest({ ...base, reasoningLevel: 'high' })).toThrow('not configured');
  expect(() => buildProviderRequest({ ...base, maxTokens: Infinity })).toThrow('token limit');
});
