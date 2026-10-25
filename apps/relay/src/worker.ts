import { quotaOperation, metricsOperation, type QuotaNamespace } from './quota';
import { authorizedMonitor, type TechnicalSample } from './technical-metrics';
export { SubjectQuota } from './quota';
import { verifyRelayToken, abuseKey } from './access';
import { approvedRequest } from './policy';
export interface RateLimiter { limit(input: { key: string }): Promise<{ success: boolean }> }
export interface RelayEnv { AUTH_SECRET: string; ALLOWED_ORIGINS: string; REQUEST_LIMITER: RateLimiter; EDGE_LIMITER: RateLimiter; SUBJECT_QUOTAS?: QuotaNamespace; METRICS_SECRET?: string }
export interface MetricsContext { waitUntil(promise: Promise<unknown>): void }
export const MAX_REQUEST_BYTES = 256 * 1024;
export const MAX_RESPONSE_BYTES = 1024 * 1024;
export const MAX_IN_FLIGHT = 6;
/** Browsers reuse a preflight answer this long (Chromium caps at 7200 s) instead of preflighting every inference. */
export const PREFLIGHT_MAX_AGE_SECONDS = 7200;
const TIMEOUT_MS = 60000;
class RelayFailure extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
function responseHeaders(origin?: string): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'X-Simagents-Relay-Error, Server-Timing');
  }
  return headers;
}
function failure(code: string, status: number, origin?: string): Response {
  const headers = responseHeaders(origin); headers.set('X-Simagents-Relay-Error', code);
  return new Response(JSON.stringify({ error: { code } }), { status, headers });
}
function origins(env: RelayEnv): Set<string> {
  if (typeof env.ALLOWED_ORIGINS !== 'string') throw new RelayFailure('not-configured', 503);
  const values = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
  if (!values.length || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || !env.REQUEST_LIMITER || !env.EDGE_LIMITER) throw new RelayFailure('not-configured', 503);
  for (const value of values) {
    try { const url = new URL(value); if (url.protocol !== 'https:' || url.origin !== value) throw new Error(); }
    catch { throw new RelayFailure('not-configured', 503); }
  }
  return new Set(values);
}
async function boundedText(message: Request | Response, maximum: number, signal: AbortSignal): Promise<string> {
  if (Number(message.headers.get('Content-Length')) > maximum) { void message.body?.cancel().catch(() => undefined); throw new RelayFailure('size-limit', 413); }
  const reader = message.body?.getReader();
  if (!reader) { if (message instanceof Response) return ''; throw new RelayFailure('invalid-json', 400); }
  let size = 0;
  const chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw new RelayFailure('timeout', 504);
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximum) { void reader.cancel().catch(() => undefined); throw new RelayFailure('size-limit', 413); }
      chunks.push(result.value);
    }
    if (signal.aborted) throw new RelayFailure('timeout', 504);
    const bytes = new Uint8Array(size);
    let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
/** Dependency injection is used only by offline tests; deployed fetch uses the runtime transport. */
export function createRelay(upstream: typeof fetch = fetch, timeoutMs = TIMEOUT_MS, nowSeconds = () => Math.floor(Date.now() / 1000), nowMs = () => performance.now()) {
  let inFlight = 0;
  const handle = async (request: Request, env: RelayEnv, measurement: { upstreamHttpMs?: number; upstreamError?: boolean; providerQuota?: boolean }): Promise<Response> => {
    let origin: string | undefined;
    let admitted = false;
    let quotaLease: string | undefined;
    let quotaSubject: string | undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const cancel = () => controller.abort(); request.signal.addEventListener('abort', cancel, { once: true });
    if (request.signal.aborted) controller.abort();
    try {
      const allowed = origins(env);
      const receivedOrigin = request.headers.get('Origin');
      if (receivedOrigin && allowed.has(receivedOrigin)) origin = receivedOrigin;
      const url = new URL(request.url);
      if (url.search || url.hash || !['/v1/health', '/v1/inference', '/v1/models', '/v1/metrics'].includes(url.pathname)) throw new RelayFailure('not-found', 404);
      const edgeKey = await abuseKey(env.AUTH_SECRET, `edge:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`);
      if (!(await abortable(env.EDGE_LIMITER.limit({ key: edgeKey }), controller.signal)).success) throw new RelayFailure('rate-limit', 429);
      if (url.pathname === '/v1/metrics') {
        if (request.method !== 'GET') throw new RelayFailure('method-denied', 405);
        if (!(await authorizedMonitor(request, env.METRICS_SECRET, env.AUTH_SECRET))) throw new RelayFailure('access-denied', 401);
        if (!env.SUBJECT_QUOTAS) throw new RelayFailure('not-configured', 503);
        const result = await abortable(metricsOperation(env.SUBJECT_QUOTAS), controller.signal);
        return new Response(await boundedText(result, MAX_RESPONSE_BYTES, controller.signal), { status: result.status, headers: responseHeaders(origin) });
      }
      if (url.pathname === '/v1/health' && request.method === 'GET') return new Response('{"status":"ok","version":1}', { headers: responseHeaders(origin) });
      if (!origin) throw new RelayFailure('origin-denied', 403);
      if (request.method === 'OPTIONS') {
        if (request.headers.get('Access-Control-Request-Method') !== 'POST') throw new RelayFailure('method-denied', 405);
        const requested = (request.headers.get('Access-Control-Request-Headers') ?? '').toLowerCase().split(',').map((h) => h.trim()).filter(Boolean);
        if (requested.some((header) => !['content-type', 'authorization', 'x-provider-key'].includes(header))) throw new RelayFailure('header-denied', 400);
        const headers = responseHeaders(origin);
        headers.set('Access-Control-Allow-Methods', 'POST'); headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Provider-Key');
        headers.set('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS));
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== 'POST' || url.pathname === '/v1/health') throw new RelayFailure('method-denied', 405);
      const authorization = request.headers.get('Authorization') ?? '';
      if (!authorization.startsWith('Bearer ')) throw new RelayFailure('access-denied', 401);
      let subject: string;
      try { subject = (await verifyRelayToken(authorization.slice(7), env.AUTH_SECRET, origin, nowSeconds())).sub; }
      catch { throw new RelayFailure('access-denied', 401); }
      if (!(await abortable(env.REQUEST_LIMITER.limit({ key: await abuseKey(env.AUTH_SECRET, `subject:${subject}`) }), controller.signal)).success) throw new RelayFailure('rate-limit', 429);
      if (inFlight >= MAX_IN_FLIGHT) throw new RelayFailure('rate-limit', 429);
      inFlight++; admitted = true;
      const providerKey = request.headers.get('X-Provider-Key') ?? '';
      if (!providerKey || providerKey === authorization.slice(7) || providerKey.length > 16000 || /[\r\n]/.test(providerKey)) throw new RelayFailure('invalid-credential', 400);
      if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new RelayFailure('content-type', 415);
      let value: unknown;
      try { value = JSON.parse(await boundedText(request, MAX_REQUEST_BYTES, controller.signal)); }
      catch (error) { if (error instanceof RelayFailure) throw error; throw new RelayFailure('invalid-json', 400); }
      let approved: ReturnType<typeof approvedRequest>;
      try { approved = approvedRequest(value, url.pathname === '/v1/models' ? 'models' : 'inference'); }
      catch { throw new RelayFailure('request-not-approved', 400); }
      if (!env.SUBJECT_QUOTAS) throw new RelayFailure('not-configured', 503);
      quotaSubject = subject;
      const quota = await abortable(quotaOperation(env.SUBJECT_QUOTAS, subject, 'forward'), controller.signal);
      if (!quota.ok) throw new RelayFailure(quota.status === 503 ? 'warming' : 'rate-limit', quota.status === 503 ? 503 : 429);
      quotaLease = (await quota.json() as { lease: string }).lease;
      const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      if (approved.protocol === 'anthropic-messages') { headers.set('X-Api-Key', providerKey); headers.set('Anthropic-Version', '2023-06-01'); }
      else if (approved.protocol === 'gemini-generate-content') headers.set('X-Goog-Api-Key', providerKey);
      else headers.set('Authorization', `Bearer ${providerKey}`);
      if (controller.signal.aborted) throw new RelayFailure('timeout', 504);
      const upstreamStarted = nowMs();
      let result: Response, raw: string;
      try {
        result = await abortable(upstream(approved.url, { method: approved.body ? 'POST' : 'GET', headers, body: approved.body ? JSON.stringify(approved.body) : undefined,
          redirect: 'manual', cache: 'no-store', signal: controller.signal }), controller.signal);
        measurement.upstreamError = !result.ok;
        if (result.status >= 300 && result.status < 400) { void result.body?.cancel().catch(() => undefined); throw new RelayFailure('upstream-redirect', 502); }
        raw = await boundedText(result, MAX_RESPONSE_BYTES, controller.signal);
      } finally { measurement.upstreamHttpMs = Math.max(0, nowMs() - upstreamStarted); }
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { if (result.ok) throw new RelayFailure('upstream-format', 502); }
      if (!result.ok) {
        const code = (parsed as { error?: { code?: unknown; type?: unknown } } | null)?.error;
        const category = String(code?.code ?? code?.type ?? '');
        const safe = ['insufficient_quota', 'quota_exceeded', 'billing_hard_limit_reached'].includes(category) ? category : 'provider_error';
        measurement.providerQuota = safe !== 'provider_error';
        return new Response(JSON.stringify({ error: { code: safe } }), { status: result.status >= 400 && result.status <= 599 ? result.status : 502, headers: responseHeaders(origin) });
      }
      return new Response(raw, { status: 200, headers: responseHeaders(origin) });
    } catch (error) {
      if (controller.signal.aborted) return failure('timeout', 504, origin);
      if (error instanceof RelayFailure) return failure(error.code, error.status, origin);
      // Never log caught errors: transport exceptions may contain credential-bearing request details.
      return failure('relay-unavailable', 502, origin);
    } finally {
      if (quotaLease && quotaSubject && env.SUBJECT_QUOTAS) {
        try { await abortable(quotaOperation(env.SUBJECT_QUOTAS, quotaSubject, 'release', quotaLease), AbortSignal.timeout(2000)); } catch { /* Lease expiry recovers failed releases without re-forwarding. */ }
      }
      if (admitted) inFlight--; controller.abort(); clearTimeout(timer); request.signal.removeEventListener('abort', cancel); }
  };
  return async (request: Request, env: RelayEnv, context?: MetricsContext): Promise<Response> => {
    const started = nowMs(), measurement: { upstreamHttpMs?: number; upstreamError?: boolean; providerQuota?: boolean } = {};
    const response = await handle(request, env, measurement);
    const elapsedMs = Math.max(0, nowMs() - started), upstreamHttpMs = measurement.upstreamHttpMs;
    const overhead = Math.max(0, elapsedMs - (upstreamHttpMs ?? 0));
    if (Number.isFinite(elapsedMs) && Number.isFinite(overhead)) response.headers.set('Server-Timing', `relay_overhead;dur=${overhead.toFixed(2)}${upstreamHttpMs === undefined ? '' : `, upstream_http;dur=${upstreamHttpMs.toFixed(2)}`}`);
    const path = new URL(request.url).pathname;
    if (path !== '/v1/metrics' && env.SUBJECT_QUOTAS) {
      const code = response.headers.get('X-Simagents-Relay-Error');
      const outcome: TechnicalSample['outcome'] = code === 'warming' ? 'warming' : code === 'timeout' ? 'timeout' : code === 'rate-limit' ? 'abuse' : measurement.providerQuota ? 'quota' : measurement.upstreamError ? 'upstream-error' : response.status === 401 || response.status === 403 ? 'access' : response.status >= 400 ? 'error' : 'ok';
      const sample: TechnicalSample = { operation: path === '/v1/inference' ? 'relay-inference' : path === '/v1/models' ? 'relay-models' : path === '/v1/health' ? 'relay-health' : 'relay-other', outcome, status: response.status, elapsedMs, ...(upstreamHttpMs === undefined ? {} : { upstreamHttpMs }) };
      const write = abortable(metricsOperation(env.SUBJECT_QUOTAS, sample), AbortSignal.timeout(1000)).then(result => { if (!result.ok) throw new Error('Metric unavailable'); }).catch(() => { /* Anonymous metrics may be unavailable; never retry inference or log payloads. */ });
      if (context) { try { context.waitUntil(write); } catch { await write; } } else await write;
    }
    return response;
  };
}
export default { fetch: createRelay() };

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { promise.catch(() => undefined); throw new RelayFailure('timeout', 504); }
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => { abort = () => reject(new RelayFailure('timeout', 504)); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}
