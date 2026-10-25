import { z } from 'zod';
import { abuseKey, issueRelayToken, verifyRelayToken } from '../../relay/src/access';
import { quotaOperation, metricsOperation, type QuotaNamespace } from '../../relay/src/quota';
import { authorizedMonitor, type TechnicalSample } from '../../relay/src/technical-metrics';
import type { MetricsContext } from '../../relay/src/worker';

export interface AdmissionEnv {
  AUTH_SECRET: string;
  TURNSTILE_SECRET: string;
  ALLOWED_ORIGINS: string;
  TURNSTILE_HOSTNAMES: string;
  SUBJECT_QUOTAS: QuotaNamespace;
  ADMISSION_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
  METRICS_SECRET?: string;
}
export const ACCESS_TTL_SECONDS = 900;
export const TURNSTILE_ACTION = 'simagents-session';
/** Browsers reuse a preflight answer this long (Chromium caps at 7200 s) instead of preflighting every renewal. */
const PREFLIGHT_MAX_AGE_SECONDS = 7200;
const requestSchema = z.object({ proof: z.string().min(1).max(2048), previousToken: z.string().max(4096).optional() }).strict();
class AdmissionFailure extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
function headers(origin?: string) {
  const value = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' });
  if (origin) {
    value.set('Access-Control-Allow-Origin', origin);
    value.set('Access-Control-Allow-Methods', 'GET, POST');
    value.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return value;
}
const reply = (status: number, code: string, origin?: string) => { const value = headers(origin); value.set('X-Simagents-Admission-Error', code); return Response.json({ error: { code } }, { status, headers: value }); };
/** Transport and time injection are for offline verification only. No inference is retried here. */
export function createAdmission(siteverify: typeof fetch = fetch, nowSeconds = () => Math.floor(Date.now() / 1000), timeoutMs = 15000, nowMs = () => performance.now()) {
  const handle = async (request: Request, env: AdmissionEnv, measurement: { renewal?: boolean }): Promise<Response> => {
    let origin: string | undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const cancel = () => controller.abort();
    request.signal.addEventListener('abort', cancel, { once: true });
    if (request.signal.aborted) controller.abort();
    try {
      const allowed = env.ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
      const hostnames = env.TURNSTILE_HOSTNAMES?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
      if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || !env.TURNSTILE_SECRET || !env.SUBJECT_QUOTAS || !env.ADMISSION_LIMITER || !allowed.length || !hostnames.length) throw new AdmissionFailure('not-configured', 503);
      if (allowed.some(value => { try { const parsed = new URL(value); return parsed.protocol !== 'https:' || parsed.origin !== value || !hostnames.includes(parsed.hostname); } catch { return true; } })) throw new AdmissionFailure('not-configured', 503);
      const received = request.headers.get('Origin');
      if (received && allowed.includes(received)) origin = received;
      if (!origin) throw new AdmissionFailure('origin-denied', 403);
      const url = new URL(request.url);
      if (!['/v1/session', '/v1/status', '/v1/metrics'].includes(url.pathname) || url.search || url.hash) throw new AdmissionFailure('not-found', 404);
      if (url.pathname === '/v1/metrics') {
        if (request.method !== 'GET') throw new AdmissionFailure('method-denied', 405);
        const fingerprint = await bounded(abuseKey(env.AUTH_SECRET, `metrics:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`), controller.signal);
        if (!(await bounded(env.ADMISSION_LIMITER.limit({ key: fingerprint }), controller.signal)).success) throw new AdmissionFailure('rate-limit', 429);
        if (!(await authorizedMonitor(request, env.METRICS_SECRET, env.AUTH_SECRET))) throw new AdmissionFailure('access-denied', 401);
        const response = await bounded(metricsOperation(env.SUBJECT_QUOTAS), controller.signal);
        return new Response(await readBounded(response, 32768, controller.signal), { status: response.status, headers: headers(origin) });
      }
      if (url.pathname === '/v1/status' && request.method === 'GET') {
        const fingerprint = await bounded(abuseKey(env.AUTH_SECRET, `status:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`), controller.signal);
        if (!(await bounded(env.ADMISSION_LIMITER.limit({ key: fingerprint }), controller.signal)).success) throw new AdmissionFailure('rate-limit', 429);
        const response = await bounded(quotaOperation(env.SUBJECT_QUOTAS, '', 'status'), controller.signal);
        return Response.json(await bounded(response.json(), controller.signal), { status: response.status, headers: headers(origin) });
      }
      if (request.method === 'OPTIONS') {
        if (request.headers.get('Access-Control-Request-Method') !== 'POST') throw new AdmissionFailure('method-denied', 405);
        const requested = (request.headers.get('Access-Control-Request-Headers') ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (requested.some(value => value !== 'content-type')) throw new AdmissionFailure('header-denied', 400);
        const preflight = headers(origin);
        preflight.set('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS));
        return new Response(null, { status: 204, headers: preflight });
      }
      if (request.method !== 'POST') throw new AdmissionFailure('method-denied', 405);
      if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AdmissionFailure('content-type', 415);
      const now = nowSeconds();
      const fingerprint = await bounded(abuseKey(env.AUTH_SECRET, `admission:${Math.floor(now / 86400)}:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`), controller.signal);
      if (!(await bounded(env.ADMISSION_LIMITER.limit({ key: fingerprint }), controller.signal)).success) throw new AdmissionFailure('rate-limit', 429);
      const issuance = await bounded(quotaOperation(env.SUBJECT_QUOTAS, `ip_${fingerprint}`, 'mint'), controller.signal);
      if (!issuance.ok) throw new AdmissionFailure(issuance.status === 503 ? 'warming' : 'rate-limit', issuance.status === 503 ? 503 : 429);
      let body: z.infer<typeof requestSchema>;
      try { body = requestSchema.parse(JSON.parse(await readBounded(request, 8192, controller.signal))); }
      catch (error) { if (error instanceof AdmissionFailure) throw error; throw new AdmissionFailure('invalid-request', 400); }
      measurement.renewal = !!body.previousToken;
      let subject: string = crypto.randomUUID();
      if (body.previousToken) {
        // Renewal authenticates the same subject; never silently mint a different subject.
        try { subject = (await bounded(verifyRelayToken(body.previousToken, env.AUTH_SECRET, origin, now), controller.signal)).sub; }
        catch (error) { if (error instanceof AdmissionFailure) throw error; throw new AdmissionFailure('renewal-denied', 401); }
      }
      let result: { success?: unknown; hostname?: unknown; action?: unknown; challenge_ts?: unknown };
      try {
        const verify = await bounded(siteverify('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: body.proof }), redirect: 'error', signal: controller.signal,
        }), controller.signal);
        if (!verify.ok) { void verify.body?.cancel().catch(() => undefined); throw new AdmissionFailure('verification-unavailable', 503); }
        result = JSON.parse(await readBounded(verify, 8192, controller.signal));
        if (!result || typeof result !== 'object') throw new Error('invalid-verification');
      } catch (error) {
        if (error instanceof AdmissionFailure && error.code === 'timeout') throw error;
        throw new AdmissionFailure('verification-unavailable', 503);
      }
      const timestamp = typeof result.challenge_ts === 'string' ? Date.parse(result.challenge_ts) / 1000 : NaN;
      if (result.success !== true || typeof result.hostname !== 'string' || !hostnames.includes(result.hostname) || result.hostname !== new URL(origin).hostname || result.action !== TURNSTILE_ACTION || !Number.isFinite(timestamp) || timestamp > now + 30 || now - timestamp > 300) throw new AdmissionFailure('proof-rejected', 403);
      if (!(await bounded(quotaOperation(env.SUBJECT_QUOTAS, subject, 'mint'), controller.signal)).ok) throw new AdmissionFailure('rate-limit', 429);
      // Time spent validating a proof must not shorten the promised token lifetime.
      const issuedAt = nowSeconds(), expiresAt = issuedAt + ACCESS_TTL_SECONDS;
      const token = await bounded(issueRelayToken(env.AUTH_SECRET, { v: 1, aud: 'simagents-relay', sub: subject, origin, iat: issuedAt, exp: expiresAt }, issuedAt), controller.signal);
      return Response.json({ token, expiresAt, renewAt: expiresAt - 120 }, { headers: headers(origin) });
    } catch (error) {
      if (controller.signal.aborted) return reply(504, 'timeout', origin);
      if (error instanceof AdmissionFailure) return reply(error.status, error.code, origin);
      // No logging: caught network exceptions can contain request or credential details.
      return reply(503, 'admission-unavailable', origin);
    } finally {
      clearTimeout(timer); request.signal.removeEventListener('abort', cancel); controller.abort();
    }
  };
  return async (request: Request, env: AdmissionEnv, context?: MetricsContext): Promise<Response> => {
    const started = nowMs(), measurement: { renewal?: boolean } = {};
    const response = await handle(request, env, measurement);
    const elapsedMs = Math.max(0, nowMs() - started), path = new URL(request.url).pathname;
    if (path !== '/v1/metrics' && env.SUBJECT_QUOTAS) {
      const code = response.headers.get('X-Simagents-Admission-Error');
      const outcome: TechnicalSample['outcome'] = code === 'warming' ? 'warming' : code === 'timeout' ? 'timeout' : response.status === 429 ? 'abuse' : response.status === 401 || response.status === 403 ? 'access' : response.status >= 400 ? 'error' : 'ok';
      const sample: TechnicalSample = { operation: path === '/v1/status' ? 'admission-status' : measurement.renewal === undefined ? 'admission-other' : measurement.renewal ? 'admission-renewal' : 'admission-initial', outcome, status: response.status, elapsedMs };
      const write = bounded(metricsOperation(env.SUBJECT_QUOTAS, sample), AbortSignal.timeout(1000)).then(result => { if (!result.ok) throw new Error('Metric unavailable'); }).catch(() => { /* No content logging or inference retry when technical monitoring is unavailable. */ });
      if (context) { try { context.waitUntil(write); } catch { await write; } } else await write;
    }
    return response;
  };
}
export default { fetch: createAdmission() };

async function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void promise.catch(() => undefined); throw new AdmissionFailure('timeout', 504); }
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new AdmissionFailure('timeout', 504));
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}
async function readBounded(message: Request | Response, maximum: number, signal: AbortSignal): Promise<string> {
  if (Number(message.headers.get('Content-Length')) > maximum) {
    void message.body?.cancel().catch(() => undefined); throw new AdmissionFailure('size-limit', 413);
  }
  const reader = message.body?.getReader();
  if (!reader) throw new AdmissionFailure('invalid-request', 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      const part = await bounded(reader.read(), signal);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) { cancel(); throw new AdmissionFailure('size-limit', 413); }
      chunks.push(part.value);
    }
    if (signal.aborted) throw new AdmissionFailure('timeout', 504);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
