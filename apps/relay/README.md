# SimAgents official relay

This is a separate Cloudflare Worker for the BYOK SPA. It is implemented and tested locally, **not deployed or certified against live providers**. The browser still owns simulation/world state.

## Contract

| Route | Operation | Authentication |
|---|---|---|
| `GET /v1/health` | Static readiness/version; no provider call | Edge rate limit; no access token |
| `POST /v1/models` | First-page model list at an approved provider path | Signed relay token and provider credential |
| `POST /v1/inference` | One bounded, non-streaming text request | Signed relay token and provider credential |

Inference body: `{ providerId, protocol, endpoint, modelId, body }`. Model-list body: `{ providerId, protocol, endpoint }`. `Authorization: Bearer <relay-access-token>` authorizes relay use; `X-Provider-Key` carries the user's separate provider key. No browser cookies or relay tokens are forwarded upstream.

Destinations are exact, reviewed triples in `packages/shared/src/relay-policy.ts`. The actual upstream URL is constructed from that list, not from an arbitrary caller URL. Custom endpoints, workspace-specific URLs not in the list, IP literals, alternate schemes, URL credentials, query strings, and redirects are not accepted. Custom destinations remain available through direct access or a user-controlled relay.

Only the current simulation adapter payloads are allowed. Tools, streaming, remote image/file inputs, background execution, conversation handles, arbitrary headers and model-fallback lists are rejected. OpenAI storage is disabled in the request. Provider privacy/retention policies remain separate from relay behavior.

## Local privacy and limits

The handler has no content telemetry. A separate Durable Object stores bounded temporary technical counters only. It prunes elapsed 60-second windows and 90-second leases through alarms; state and cleanup alarms commit atomically. There is no calendar-boundary reset of active limits. Logical expiry is not a certification of platform backup/log retention. It never writes keys, prompts, responses or exceptions to console, caches, databases, queues or storage bindings. Responses use `Cache-Control: no-store`; upstream fetch bypasses cache. Error responses redact provider text. Wrangler observability is explicitly disabled. Operator-side Cloudflare logging/export settings must also be reviewed before deployment; this source code cannot certify settings outside the repository.

Limits:

- 256 KiB request body; 1 MiB provider response.
- 60-second total deadline, including body reads, and cancellation on client disconnect.
- Six admitted upstream operations per isolate, bounding buffered-response memory.
- Coordinated subject counters: six concurrent leases and 50 forwarded operations per rolling minute. Additional local rate bindings: 60 operations/minute per authenticated subject; 120 edge requests/minute per HMAC-blinded client address as an additional abuse backstop. Edge checks include preflight/health traffic; preflight answers carry `Access-Control-Max-Age: 7200`, so browsers do not preflight every inference.
- Tokens are valid for at most 15 minutes and are bound to an exact HTTPS application origin. Subject identifiers should be opaque, not email addresses or names.
- No retry, fallback destination or alternate model is selected by this service.

Cloudflare rate limits are local to each Cloudflare location, not a global billing/concurrency guarantee. The isolate admission guard is also not global. Shared IPs can encounter the edge backstop. Capacity, WAF rules, monitoring and actual platform behavior require staging checks before release. References: [rate bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [cache bypass](https://developers.cloudflare.com/workers/examples/cache-using-fetch/), [Workers logging configuration](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

## Deployment preparation — no deploy performed

1. Select the relay domain/route, exact HTTPS SPA origins and rate-limit namespace IDs that do not conflict with another service. The IDs in `wrangler.toml` are template values to review.
2. Configure `ALLOWED_ORIGINS` as a comma-separated list of exact origins. The empty default fails closed. `workers_dev` and preview URLs are disabled.
3. Generate and securely retain a cryptographically random signing secret with at least 32 bytes of entropy. Supply it as the Worker `AUTH_SECRET` secret, never a `VITE_*` variable, committed file or URL. Local `.dev.vars` and `.wrangler` are ignored.
4. Use an operator-selected/pinned Wrangler release supporting rate bindings (Cloudflare documents a minimum of 4.36.0) and the configured compatibility date. Validate with a dry run and review platform logging settings before any authorized rollout. Wrangler/Cloudflare platform validation has not been run in this task.
5. Review the separate [admission service](../admission/README.md), its exact Turnstile hostname/action settings and shared subject-counter binding before deployment. Neither service has been deployed or certified in Cloudflare.
6. After separately authorized deployments, build the SPA with `VITE_OFFICIAL_RELAY_URL=https://<relay-origin>`, `VITE_ADMISSION_URL=https://<admission-origin>` and `VITE_TURNSTILE_SITE_KEY=<public-site-key>`. URLs are HTTPS origins without a path. All three are required to enable public relay access. Existing direct/user-relay connections are not rerouted.
7. Users select **Official relay**, enter their provider key and complete security verification. No operator token, invitation or account is needed. Relay authorization is memory-only and is excluded from the provider vault. At minute 13 the app requests a fresh proof and authenticates renewal with its existing token. An interactive challenge or failed/expired access pauses and blocks new requests; the user resumes explicitly after access returns. Model verification and the world are preserved.

`apps/relay/scripts/mint-token.ts` remains an explicit local diagnostic issuer; it is not the public admission protocol and has not been used to distribute deployment tokens.

## Tests and rollback

`bun run --filter @simagents/relay test` covers authentication, hostile destinations, header isolation, payload/schema restrictions, body limits, redirects, deadlines, slow uploads, error redaction, logging absence, concurrency admission and interoperability with the application's four protocol adapters. `bun run --filter @simagents/relay build` bundles the Worker for inspection.

`scripts/official-relay-smoke.ts` serves a production SPA fixture under a synthetic HTTPS origin, runs this exact handler in process, and stubs all provider calls. It delegates to `admission-browser-smoke.ts`, which covers the actual admission/relay handlers, simulated widget/provider access, silent and interactive renewal, Worker token updates, blocked resume, model-verification/world preservation and credential-free exports. Authorization clocks are simulated; the real-time soak is separate. Rate bindings are simulated; these tests do not validate Cloudflare's deployed rate infrastructure or provider access.

Before release, test deployed TLS/CORS/auth/limits, aggregate latency/errors, WAF policy and provider compatibility with dedicated keys and an authorized budget. Keep app, relay and destination policy versions together. Removing a destination or disabling the relay must fail closed and pause affected sessions, never reroute automatically. Rotating `AUTH_SECRET` revokes access tokens for new admissions (in-flight provider calls may still finish/be billed); an empty origin list disables forwarding. Use aggregate platform metrics only; do not enable body/header logging for debugging.

## Free-only, 24-hour retention continuation

The coordinator now uses one fixed object name, RAM-only per-subject state and no storage/alarm operations. Subject and address fingerprints are never durable object names or persisted records. GC removes the longest 90-second lease within another five seconds. Cold/restarted objects refuse grants for 90 seconds, allowing all previous windows/leases to end before accepting new traffic. Capacity is bounded at 4096 live entries; new entries are refused rather than evicting active quotas.

One constantly resident 128 MB object is about 11,059 GB-s/day, below the documented 13,000 GB-s/day Free duration allowance. The 100,000/day request limit remains shared; exceeding Free quotas must produce errors, not a paid upgrade. Verify the actual Free account plan before rollout. The native edge limits remain locality-specific supplements. Real Cloudflare runtime/log/retention evidence remains required.
