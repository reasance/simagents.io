import { quotaNamespace } from './quota-fixture';
import { expect, test } from 'bun:test';
import { createRelay, MAX_REQUEST_BYTES, type RelayEnv } from '../worker';
import { issueRelayToken, verifyRelayToken } from '../access';
import { approvedRequest } from '../policy';
const origin = 'https://app.example.test';
const secret = 'synthetic-test-signing-secret-not-for-deployment';
const envelope = () => ({ providerId: 'codex', protocol: 'openai-responses', endpoint: 'https://api.openai.com/v1/responses', modelId: 'fixture-model',
  body: { model: 'fixture-model', instructions: 'private system', input: 'private prompt', store: false, max_output_tokens: 128 } });
const env = (): RelayEnv => ({ AUTH_SECRET: secret, ALLOWED_ORIGINS: origin,
  SUBJECT_QUOTAS: quotaNamespace().namespace, EDGE_LIMITER: { limit: async () => ({ success: true }) }, REQUEST_LIMITER: { limit: async () => ({ success: true }) } });
async function token(extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return issueRelayToken(secret, { v: 1, aud: 'simagents-relay', sub: 'test-user', origin, iat: now, exp: now + 900, ...extra });
}
async function request(body: unknown = envelope(), headers: Record<string, string> = {}, path = '/v1/inference') {
  return new Request(`https://relay.example.test${path}`, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${await token()}`, 'X-Provider-Key': 'private-provider-key', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
test('access tokens are signed, time-bounded and bound to the application origin', async () => {
  const access = await token();
  expect((await verifyRelayToken(access, secret, origin)).sub).toBe('test-user');
  await expect(verifyRelayToken(access, secret, 'https://other.test')).rejects.toThrow();
  await expect(verifyRelayToken(access, secret, origin, Math.floor(Date.now() / 1000) + 1000)).rejects.toThrow();
  await expect(verifyRelayToken(access.slice(0, -5) + 'abcde', secret, origin)).rejects.toThrow();
  await expect(token({ exp: Math.floor(Date.now() / 1000) + 7200 })).rejects.toThrow();
});
test('the relay forwards only provider credentials and approved payloads, never browser cookies or relay tokens', async () => {
  let count = 0;
  const relay = createRelay((async (url: unknown, init?: RequestInit) => {
    count++; expect(url).toBe('https://api.openai.com/v1/responses');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer private-provider-key');
    expect(headers.get('cookie')).toBeNull(); expect(headers.get('x-provider-key')).toBeNull();
    expect(init?.redirect).toBe('manual'); expect(init?.cache).toBe('no-store');
    expect(JSON.parse(init?.body as string).store).toBe(false);
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'private response' }] }] }, { headers: { 'Set-Cookie': 'upstream=secret', 'X-Internal': 'private' } });
  }) as unknown as typeof fetch);
  const result = await relay(await request(envelope(), { Cookie: 'browser=secret' }), env());
  expect(result.status).toBe(200); expect(count).toBe(1);
  expect(result.headers.get('cache-control')).toContain('no-store'); expect(result.headers.get('set-cookie')).toBeNull();
  expect(result.headers.get('x-internal')).toBeNull(); expect(result.headers.get('access-control-allow-origin')).toBe(origin);
});
test('CORS alone grants no access; missing token, hostile origins and limits never call a provider', async () => {
  let calls = 0;
  const relay = createRelay((async () => { calls++; return Response.json({}); }) as unknown as typeof fetch);
  expect((await relay(await request(envelope(), { Authorization: '' }), env())).status).toBe(401);
  expect((await relay(await request(envelope(), { Origin: 'https://evil.test' }), env())).status).toBe(403);
  const limited = env(); limited.REQUEST_LIMITER.limit = async () => ({ success: false });
  expect((await relay(await request(), limited)).status).toBe(429);
  expect((await relay(await request(), { ...env(), AUTH_SECRET: '' })).status).toBe(503);
  expect(calls).toBe(0);
});
test.each(['https://127.0.0.1/v1/responses', 'http://api.openai.com/v1/responses', 'https://api.openai.com.evil.test/v1/responses', 'https://secret@api.openai.com/v1/responses', 'https://api.openai.com/v1/responses?target=http://169.254.169.254', 'https://api.openai.com/v1/../v1/responses'])('unapproved URL %s fails closed', async (endpoint) => {
  let calls = 0;
  const relay = createRelay((async () => { calls++; return Response.json({}); }) as unknown as typeof fetch);
  expect((await relay(await request({ ...envelope(), endpoint }), env())).status).toBe(400);
  expect(calls).toBe(0);
});
test('tools, background jobs, remote inputs, streaming and changed billing limits are rejected', () => {
  for (const patch of [{ tools: [{ type: 'web_search' }] }, { background: true }, { input: [{ type: 'input_image', image_url: 'https://evil.test' }] }, { stream: true }, { store: true }, { max_output_tokens: 999999 }, { previous_response_id: 'somebody-elses-response' }]) {
    const current = envelope(); expect(() => approvedRequest({ ...current, body: { ...current.body, ...patch } }, 'inference')).toThrow();
  }
});
test('model listing has a fixed path and uses GET upstream', async () => {
  const { body: _body, modelId: _id, ...target } = envelope();
  const relay = createRelay((async (url: unknown, init?: RequestInit) => { expect(url).toBe('https://api.openai.com/v1/models'); expect(init?.method).toBe('GET'); expect(init?.body).toBeUndefined(); return Response.json({ data: [] }); }) as unknown as typeof fetch);
  expect((await relay(await request(target, {}, '/v1/models'), env())).status).toBe(200);
});
test('request/response limits, redirect refusal and hard timeouts do not retry', async () => {
  let calls = 0;
  const redirect = createRelay((async () => { calls++; return new Response('', { status: 302, headers: { Location: 'https://evil.test' } }); }) as unknown as typeof fetch);
  expect((await redirect(await request(), env())).status).toBe(502); expect(calls).toBe(1);
  const oversized = envelope(); oversized.body.input = 'x'.repeat(MAX_REQUEST_BYTES);
  expect((await redirect(await request(oversized), env())).status).toBe(413); expect(calls).toBe(1);
  const hugeResponse = createRelay((async () => new Response('x'.repeat(1024 * 1024 + 1))) as unknown as typeof fetch);
  expect((await hugeResponse(await request(), env())).status).toBe(413);
  const hanging = createRelay((() => new Promise(() => {})) as unknown as typeof fetch, 10);
  expect((await hanging(await request(), env())).status).toBe(504);
});
test('upstream errors are redacted, abuse keys contain no credentials, and preflight is bounded', async () => {
  const settings = env(); const identifiers: string[] = [];
  settings.EDGE_LIMITER.limit = settings.REQUEST_LIMITER.limit = async ({ key }) => { identifiers.push(key); return { success: true }; };
  const relay = createRelay((async () => Response.json({ error: { code: 'insufficient_quota', message: 'private-provider-key private prompt' } }, { status: 429 })) as unknown as typeof fetch);
  const result = await relay(await request(), settings);
  expect(await result.text()).toBe('{"error":{"code":"insufficient_quota"}}');
  expect(identifiers.join('')).not.toContain('private-provider-key'); expect(identifiers.join('')).not.toContain('test-user');
  const preflight = await relay(new Request('https://relay.example.test/v1/inference', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-provider-key' } }), settings);
  expect(preflight.status).toBe(204); expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  // Cacheable, so browsers do not preflight (and bill) every inference.
  expect(preflight.headers.get('Access-Control-Max-Age')).toBe('7200');
});

test('all official client protocol adapters interoperate with the relay policy', async () => {
  const { buildProtocolRequest } = await import('../../../../packages/engine/src/engine/llm/protocol-adapters');
  const { defaultConnection, defaultCapabilities } = await import('@simagents/shared');
  for (const providerId of ['codex', 'claude', 'gemini', 'openrouter'] as const) {
    const connection = { ...defaultConnection(providerId), transport: 'official-relay' as const, relayUrl: 'https://relay.example.test', relayCredentialRef: 'relay:access' };
    const capabilities = { ...defaultCapabilities(providerId, 'fixture-model', connection.protocol), output: 'json-schema' as const };
    const client = buildProtocolRequest({ connection, capabilities, modelId: 'fixture-model', apiKey: 'private-provider-key', relayAccessToken: await token(), maxTokens: 128, prompt: { system: 'Choose action JSON', user: 'fixture' } });
    expect(client.url).toBe('https://relay.example.test/v1/inference');
    expect(client.body).not.toHaveProperty('apiKey');
    expect(client.headers.Authorization).not.toBe('Bearer private-provider-key');
    const relay = createRelay((async () => Response.json({ ok: true })) as unknown as typeof fetch);
    const headers = { ...client.headers, Origin: origin };
    const result = await relay(new Request(client.url, { method: 'POST', headers, body: JSON.stringify(client.body) }), env());
    expect(result.status).toBe(200);
  }
});

test('upstream exceptions never reflect private details or write application logs', async () => {
  const { spyOn } = await import('bun:test');
  const spies = [spyOn(console, 'log'), spyOn(console, 'error'), spyOn(console, 'warn'), spyOn(console, 'debug')].map((spy) => spy.mockImplementation(() => {}));
  try {
    const relay = createRelay((async () => { throw new Error('private-provider-key private prompt'); }) as unknown as typeof fetch);
    const result = await relay(await request(), env());
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain('private');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally { for (const spy of spies) spy.mockRestore(); }
});

test('isolate admission bounds concurrent buffered responses and releases capacity', async () => {
  const { MAX_IN_FLIGHT } = await import('../worker');
  const releases: Array<(response: Response) => void> = [];
  const relay = createRelay((() => new Promise<Response>((resolve) => releases.push(resolve))) as unknown as typeof fetch);
  const pending = await Promise.all(Array.from({ length: MAX_IN_FLIGHT }, () => request()));
  const results = pending.map((req) => relay(req, env()));
  for (let i = 0; releases.length < MAX_IN_FLIGHT && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  expect(releases).toHaveLength(MAX_IN_FLIGHT);
  expect((await relay(await request(), env())).status).toBe(429);
  for (const release of releases) release(Response.json({ ok: true }));
  expect((await Promise.all(results)).every((response) => response.status === 200)).toBe(true);
});

test('health is provider-free and unrecognized operations cannot be used as a generic proxy', async () => {
  let calls = 0;
  const relay = createRelay((async () => { calls++; return Response.json({}); }) as unknown as typeof fetch);
  const health = await relay(new Request('https://relay.example.test/v1/health'), env());
  expect(health.status).toBe(200); expect(await health.json()).toEqual({ status: 'ok', version: 1 });
  expect((await relay(await request(envelope(), {}, '/proxy'), env())).status).toBe(404);
  expect((await relay(await request(envelope(), {}, '/v1/inference?target=private'), env())).status).toBe(404);
  expect(calls).toBe(0);
});

test('empty/non-JSON provider errors preserve status without exposing their body', async () => {
  const empty = createRelay((async () => new Response(null, { status: 401 })) as unknown as typeof fetch);
  const response = await empty(await request(), env());
  expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: { code: 'provider_error' } });
  const invalid = createRelay((async () => new Response(null, { status: 204 })) as unknown as typeof fetch);
  expect((await invalid(await request(), env())).status).toBe(502);
});

test('a slow request body is cancelled at the deadline before contacting a provider', async () => {
  let cancelled = false; let calls = 0;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const headers = (await request()).headers;
  const incoming = new Request('https://relay.example.test/v1/inference', { method: 'POST', headers, body: stream });
  const relay = createRelay((async () => { calls++; return Response.json({}); }) as unknown as typeof fetch, 10);
  expect((await relay(incoming, env())).status).toBe(504); expect(cancelled).toBe(true); expect(calls).toBe(0);
});
test('Claude effort requests pass the relay policy only with documented effort values', () => {
  const claude = (outputConfig: Record<string, unknown>) => ({ providerId: 'claude', protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com/v1/messages', modelId: 'claude-opus-5-5',
    body: { model: 'claude-opus-5-5', system: 'private system', messages: [{ role: 'user', content: 'private prompt' }], max_tokens: 128, output_config: outputConfig } });
  expect(approvedRequest(claude({ effort: 'max' }), 'inference').body?.output_config).toEqual({ effort: 'max' });
  expect(() => approvedRequest(claude({ effort: 'adaptive' }), 'inference')).toThrow();
  expect(() => approvedRequest(claude({ effort: 'low', budget: 10 }), 'inference')).toThrow();
});
