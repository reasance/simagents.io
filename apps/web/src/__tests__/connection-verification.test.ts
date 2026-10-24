import { afterEach, expect, test } from 'bun:test';
import { defaultConnection, defaultCapabilities } from '@simagents/shared';
import { verifyConnection, verificationSignature } from '../services/connection-verification';
import { listConnectionModels } from '../services/connection-models';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const profile = { ...defaultConnection('codex'), transport: 'direct' as const };
test('verification sends exactly one Responses request, validates it, and never executes a world action', async () => {
  let calls = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('fixture-model'); expect(body.max_output_tokens).toBe(128); expect(body.store).toBe(false);
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"action":"sleep","params":{"duration":1}}' }] }] });
  }) as unknown as typeof fetch;
  await verifyConnection(profile, 'fixture-model', 'fixture-key', undefined, undefined, 128);
  expect(calls).toBe(1);
});
test('verification never retries invalid output', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ output: [] }); }) as unknown as typeof fetch;
  await expect(verifyConnection(profile, 'fixture-model', 'fixture-key', undefined, undefined, 128)).rejects.toThrow('incompatible');
  expect(calls).toBe(1);
});
test('verification signatures invalidate on route, model, parameters, token cap or credential changes without storing secrets', () => {
  const caps = defaultCapabilities('codex', 'fixture', 'openai-responses');
  const before = verificationSignature(profile, 'fixture', caps, undefined, 128, 0);
  for (const after of [verificationSignature({ ...profile, endpoint: 'https://changed.test/v1/responses' }, 'fixture', caps, undefined, 128, 0), verificationSignature(profile, 'different', caps, undefined, 128, 0), verificationSignature(profile, 'fixture', { ...caps, temperature: true }, undefined, 128, 0), verificationSignature(profile, 'fixture', caps, undefined, 256, 0), verificationSignature(profile, 'fixture', caps, undefined, 128, 1)]) expect(after).not.toBe(before);
});
test('model listing sends GET to the selected connection and does not infer verification', async () => {
  globalThis.fetch = (async (url: unknown, options?: RequestInit) => {
    expect(url).toBe('https://api.openai.com/v1/models'); expect(options?.body).toBeUndefined();
    return Response.json({ data: [{ id: 'custom-a' }, { id: 'custom-a' }, { id: 'custom-b' }, { id: 123 }] });
  }) as unknown as typeof fetch;
  expect(await listConnectionModels(profile, 'fixture')).toEqual(['custom-a', 'custom-b']);
});

test('credential locking cancels in-flight main-thread verification without retry', async () => {
  const { abortCredentialRequests } = await import('../services/credential-requests');
  let calls = 0;
  globalThis.fetch = ((_url: unknown, options?: RequestInit) => {
    calls++;
    return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  }) as unknown as typeof fetch;
  const verification = verifyConnection(profile, 'fixture-model', 'fixture-key', undefined, undefined, 128);
  await new Promise((resolve) => setTimeout(resolve, 0));
  abortCredentialRequests();
  await expect(verification).rejects.toThrow('Aborted');
  expect(calls).toBe(1);
});
test('a model that returns exactly the requested probe action passes verification', async () => {
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const prompt = String(JSON.parse(init!.body as string).input);
    const requested = prompt.slice(prompt.indexOf('{'));
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: requested }] }] });
  }) as unknown as typeof fetch;
  await verifyConnection(profile, 'fixture-model', 'fixture-key', undefined, undefined, 128);
});
test('decision-model connections are verified with one closed question', async () => {
  let calls = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls++;
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(init!.body as string);
    expect(Object.keys(body.questions.next_action.criteria)).toEqual(['works', 'fails']);
    return Response.json({ model: 'jev-1.14.0', answers: { next_action: { choice: 'works' } } });
  }) as unknown as typeof fetch;
  await verifyConnection({ ...defaultConnection('typesafe'), transport: 'direct' }, 'jev-1.14.0', 'fixture-key', undefined, undefined, 128);
  expect(calls).toBe(1);
});
