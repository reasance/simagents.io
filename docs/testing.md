# Testing Matrix

Use browser-safe gates for normal SimAgents work.

## Required Static Gates

```bash
bun typecheck
bun run --filter @simagents/engine test
(cd apps/web && bun run build)
node --check scripts/browser-smoke.mjs
```

Bundle safety check after the web build:

```bash
node scripts/check-browser-bundle.mjs
```

Passing state is no output.

## Browser Smoke

CI runs the browser smoke against a local Vite server. For local reproduction, start a dev server first:

With a dev server running:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

The smoke gate should cover:

- start, pause, resume, reset
- import/export world
- BYOK and proxy config
- local analytics
- local replay
- local puzzles
- custom prompt apply/reset
- local prompt inspector
- small browser experiment run/export
- IndexedDB atomic writes, cross-connection budget accounting and non-destructive legacy migrations
- persisted replay after reload, tick-zero frames and explicit missing-tick reporting
- reconstructed prompt-summary labeling and experiment export without a live Worker

## Focused Engine Tests

Prefer focused tests under `packages/engine` for:

- action handlers
- vitals and housekeeping
- persistence serialize/hydrate
- replay frame derivation
- puzzle selectors
- prompt log shaping
- browser experiment summaries

## Security Audit

Before merging any feature that displays model output, imported data, or proxy responses:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|eval\\(|new Function|document\\.write|DOMParser" apps/web/src apps/web/index.html packages/engine/src packages/shared/src
```

Expected result: no unsafe rendering sinks.

## BYOK correctness regression checkpoint

Run `bun run test` for both engine and Worker/client regressions, then `bun run typecheck` and `bun run --filter web build`. `scripts/browser-smoke.mjs` accepts `SIMAGENTS_SMOKE_BROWSER=chromium|webkit|firefox`; the browser must already be installed in the selected Playwright environment. The smoke harness blocks unmatched external requests and uses synthetic provider responses.

See [BYOK implementation status](byok-release-status.md) for verified coverage and the still-open production release gates. Internal baseline fixtures are not evidence of a public BYOK flow or live model certification.


## Credentials, budgets and production BYOK checks

Use Bun 1.2.14 (`.bun-version` / `packageManager`) and `bun install --frozen-lockfile`. Start the legacy fixture smoke server with `VITE_INTERNAL_TESTS=true bun run --filter web dev -- --host 127.0.0.1 --port 5184`; this flag has no effect in production builds.

For production checks, run `bun run --filter web build` and `bun run --filter web preview -- --host 127.0.0.1 --port 5185`. With `PLAYWRIGHT_MODULE_DIR` pointing at Playwright 1.62.1 and `SIMAGENTS_SMOKE_URL=http://127.0.0.1:5185/`, run `node scripts/credential-smoke.mjs` and `node scripts/byok-production-smoke.mjs`. Repeat with `SIMAGENTS_SMOKE_BROWSER=webkit`. All credentials are synthetic and unmatched external requests are blocked. The production tests do not use the development engine bridge.

The vault smoke covers memory-only defaults, encrypted reload/unlock, invalid passphrase, lock and explicit plaintext migration. The BYOK smoke covers startup checks, invalid budgets, exact request/token limits, error pause, credential clearing and production Worker rejection of internal baselines. It also protects against the WebKit Worker-entry reimport regression caused by a lazy provider chunk importing its entry module back.


## Extensible connection profiles

`connection-profile-smoke.mjs` uses the same `PLAYWRIGHT_MODULE_DIR`, `SIMAGENTS_SMOKE_URL` (production preview) and `SIMAGENTS_SMOKE_BROWSER` variables. It exercises Responses, Chat Completions, Anthropic, Gemini and OpenRouter using synthetic HTTPS routes. It checks that setup and model listing do not infer, each probe issues one request, capability edits invalidate verification, the session budget still applies, and exports contain connection metadata but no credential. Run in Chromium and WebKit; CI includes both. Unit fixtures also cover protocol-specific request/response shapes, thought exclusion, exact model/token preservation, credential reference binding, profile validation and cancellation of main-thread probes.


## Official relay and mandatory profile migration

`bun run test` includes `apps/relay` tests. The backend is compiled with `bun run --filter @simagents/relay build`. Security cases run against an injected transport and never contact providers.

For full local integration, build an isolated fixture with `VITE_OFFICIAL_RELAY_URL=https://relay.fixture.test VITE_ADMISSION_URL=https://admission.fixture.test VITE_TURNSTILE_SITE_KEY=synthetic-site-key bun run --filter web build --outDir ../../.tmp/admission-web`, then run `PLAYWRIGHT_MODULE_DIR=/path/to/playwright bun scripts/official-relay-smoke.ts`. Repeat with `SIMAGENTS_SMOKE_BROWSER=webkit`. The fixture serves the built app under a synthetic HTTPS origin, invokes the actual relay handler and uses the actual admission/relay handlers with a synthetic Turnstile widget and provider transport. Authorization clocks are simulated; this is separate from the real-time soak and exact-candidate Cloudflare checks. All provider traffic is stubbed. Normal `apps/web/dist` builds remain unconfigured for the official relay unless all three public access settings are supplied.

Legacy metadata migration tests cover preserved IDs/models/routes, backup, idempotence, failed writes and incomplete relay settings. Public BYOK smoke now verifies that converted settings cannot start before a successful probe. A verification request is separate from the simulation request budget.

### Cumulative analytics

`engine/metrics.test.ts` verifies action/result deduplication, totals after event-ring eviction, repeated snapshot hydration, explicit incomplete legacy history, malformed metrics and bounded temporal aggregates. `analytics.test.ts` checks zero-inclusive Gini, idempotent engine-counter synchronization and elapsed-simulation-time action rates. The browser smoke asserts that cumulative counters survive world reload and resume; counters are distinct from provider request/billing usage.

### Random stream continuity

`engine/random-persistence.test.ts` verifies exact next draws across JSON snapshot round-trips for global and independent agent streams, malformed ARC4 permutations, duplicate identities, legacy coverage, reset and stopped-runner protection. This is not a claim of deterministic network/model outputs or whole-world replay.

### Guided BYOK setup

Against the production preview, run `node scripts/setup-smoke.mjs` with the same `PLAYWRIGHT_MODULE_DIR` and `SIMAGENTS_SMOKE_URL` used by the production smoke tests. Set `SIMAGENTS_SMOKE_WIDTH=390` for the narrow layout and `SIMAGENTS_SMOKE_BROWSER=webkit` for WebKit. The script intercepts provider traffic, exercises the entire journey, checks keyboard focus and writes local review screenshots under `.tmp/setup`. Full-app mobile overflow and real five-person usability testing remain separate gates.

### Dry run

`node scripts/dry-run-smoke.mjs`, against the production preview with the same variables, starts a dry run from the first screen, waits for speech in the feed, checks the agent detail and a captured prompt, and fails if any request leaves the page origin. Run it with `SIMAGENTS_SMOKE_WIDTH=390` for the narrow layout; screenshots go to `.tmp/dry-run`. `engine/dry-run.test.ts` checks that a dry run reads no key and calls no `fetch`, that its wait grows with effort, and that it speaks to agents within earshot. `apps/web/src/__tests__/dry-run.test.ts` covers its preflight and the saved-world flag.

### Release checkpoint gates

Run `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`,
`node scripts/check-browser-bundle.mjs`, `node scripts/audit-dependencies.mjs`,
then `npm ci --prefix docs-site`, `npm audit --prefix docs-site --audit-level=high`
and `bun run build:docs`. Audit service failures are failures, not clean results.

After building SPA, relay and admission, `node scripts/release-candidate.mjs` writes
`apps/web/dist/candidate.json`; `node scripts/release-candidate.mjs --verify`
checks artifact integrity. Serve that directory for the public fixture tests.
Do not rebuild it between browser verification and artifact publication.
The existing internal baseline/relay fixture builds are separate artifacts.

`node scripts/check-release-gates.mjs` deliberately fails while the evidence in
`docs/release-gates.json` is incomplete. The CI summary also requires docs and
all other mandatory jobs to succeed, including when jobs are skipped/cancelled.
IndexedDB version 2 requires a compatible rollback candidate before publication.

The checked-in release-gates JSON is a pending template. After evidence exists for
an immutable commit, the operator supplies the completed JSON through the
`SIMAGENTS_RELEASE_EVIDENCE` repository variable; recording it outside the commit
avoids a self-referential commit hash. Each gate needs `status: "passed"`, the
exact `commit`, and an `artifact` reference. References require human review.

The resumed goal adds the 33-action registry matrix and complete persisted-entity
validation before mutation. `scripts/header-smoke.mjs` checks 1440/768/390 px,
keyboard tools and persisted EN/IT selection. `scripts/accessibility-smoke.mjs`
archives automated A/AA findings for ready/setup/configuration; it does not replace
manual keyboard, screen-reader, canvas, zoom or full-product checks. Both block
external traffic. The translation inventory is read-only; the conversion script
changes only reviewed catalog keys in JSX, leaving experiment text/data intact.

### Admission, quotas and keyboard continuation

`bun run test` includes admission transport fixtures (no Cloudflare or provider calls), coordinated quota/expiry fixtures, and queued-token/Worker snapshot preservation. Run `scripts/keyboard-smoke.mjs` against the public production preview with the existing Playwright variables for EN/IT and Chromium/Firefox/WebKit. It exercises native agent/resource selection at 1440×900, 768×1024 and 390×844, both canvas keyboard controls and zoom bounds, and captures `.tmp/keyboard` screenshots. This is not a real browser 200% zoom check or a complete keyboard audit.

Candidate builds now require both `bun run --filter @simagents/relay build` and `bun run --filter @simagents/admission build`. `scripts/release-candidate.mjs --verify` checks relay/admission artifacts, SPA assets, source catalogs/schemas, lockfile and commit. Release evidence includes `candidateId` on the report and each gate; `candidateRemoteCi.runId` identifies the exact successful push CI run. Release downloads that run's artifacts, verifies the ID and clean identity, and keeps zipped candidates as release assets. Remote CI and deployment evidence must be gathered separately.

### Extended public surfaces and native Chromium zoom

Against the already built production candidate (with `candidate.json` served), run `node scripts/public-ui-smoke.mjs` using the existing Playwright URL/browser/language variables. `SIMAGENTS_SMOKE_WIDTH` accepts 1440, 768 or 390; the corresponding heights are 900, 1024 and 844. Reports cover ready/onboarding/configuration/review, paused and stopped worlds, agent/resource/event/decision panes, analytics, puzzle list, gallery/inspector and replay. They also exercise pointer/keyboard panel movement and resize, explicit pause/resume, captured request consent, invalid-import preservation and language changes with unchanged world/RNG/settings. Provider traffic is simulated and every other external destination is blocked.

For Chromium only, `SIMAGENTS_SMOKE_NATIVE_ZOOM=2` launches an isolated temporary profile with the repository's minimal test extension, applies [native tab zoom](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom), reads it back and verifies the CSS viewport/devicePixelRatio change. CSS zoom remains 1. This follows [Playwright's bundled-Chromium extension support](https://playwright.dev/docs/chrome-extensions); it does not modify the user's browser profile. Native Firefox/WebKit zoom needs separate evidence. Screenshots, full Axe reports and served-candidate identity are archived under `.tmp/public-ui`.

These checks are broader public UI evidence, not a complete end-to-end certification of populated puzzles, every inspector control, vault/import recovery, native zoom in all engines, device performance, real providers or usability. Their missing cases remain release gates.

### Real-time soak harness and build provenance

`bun scripts/realtime-soak.ts` runs the fixed 3600-second workload through the public SPA with 20 agents, 1× speed, simulated Anthropic transport and no accelerated clock. `--pilot-seconds=60` (up to 600) is explicitly a pilot and cannot satisfy the soak gate. Preserve each immutable `.tmp/soak/<run-id>` directory: protocol, synthetic preconditioning fixture/hash, candidate identity, native RSS samples for all owned browser processes, click-to-presentation latency, invariant snapshots, terminal summary and reload receipt. Absence of native memory evidence fails. The harness declares plateau thresholds before the run and excludes synthetic preloaded history/time from measurements. A dirty local completed run remains preliminary evidence, not a clean release-candidate gate.

Freeze the built SPA/relay/admission artifacts before a long run and serve that frozen directory on a loopback-only port. Poll the existing process handle and terminal report; do not restart merely because observation timed out. Keep candidate versions and startup/sample/terminal errors. Quota denied, saturation and insufficient-space scenarios are separate tests, not inferred from the normal workload.

Successful Vite output now writes `build-source.json`. `release-candidate.mjs` verifies its source fingerprint before recording/verifying a candidate, so an old SPA cannot be relabelled after a failed build or source edit. Public build configuration is included; private key/secret values are not. Tests/docs/generated fixtures are excluded from compilation inputs, while source, lockfile, config and manifests are bound. Run dependent local commands with failure propagation (`bun run build && node scripts/release-candidate.mjs`), never generate a manifest after a failed build.

`node --test scripts/release-gates.test.mjs` and `bun scripts/check-provider-manifest.mjs` validate only local gate/draft contracts. They make no provider calls and do not certify linked external evidence. Stable-version evidence additionally needs `publicBetaExit`; beta versions still need all original gates and deployment/operator authority.

### Populated public readers and browser storage pressure

`bun scripts/public-data-smoke.ts` adds genuine public UI/Worker/IndexedDB paths for captured request/response content, valid imported puzzle/fragment fixtures, open-puzzle confidentiality, completed-puzzle/history detail, native replay-agent selection and history retention across import. The fixture explicitly imports synthetic puzzle state; it is not claimed as a model's decision or real historical outcome. Run EN/IT at the three viewports in Chromium, Firefox and WebKit. Reports/screenshots are in `.tmp/public-data`.

`bun scripts/storage-budget-browser.ts` compiles the production `AppDataStore` into a separate internal test artifact and fills genuine browser IndexedDB through its normal APIs. It establishes the 45 MiB secondary ceiling, 50 MiB total ceiling/reserve, atomic failed writes, retained source world, and correct accounting after archive removal. It does not certify the native origin quota manager.

`bun scripts/storage-fault-smoke.ts` explicitly injects `QuotaExceededError` into the real browser transaction path and checks visible EN/IT errors plus preserved committed world/accounting. The attempted CDP origin-quota override reported active zero/small quota but did not enforce write rejection in the tested Chromium profiles; that negative result is not a native-quota pass. Injected handling and logical payload-budget saturation are separate evidence. Native quota denial/physical insufficient disk requires its own reproducible environment before claiming that operational gate complete.

### Native Firefox/WebKit zoom and the local Cloudflare runtime

The public UI runner supports `SIMAGENTS_SMOKE_NATIVE_ZOOM=2` in all three
engines. Firefox/WebKit use the pinned Playwright browser's native full-page
zoom commands through its test-only internal transport. They verify layout,
DPR, CSS zoom 1 and a native 200% → 100% → 200% round trip. Transport changes
fail the harness instead of falling back to CSS or viewport emulation.
Firefox uses explicit native keyboard activation at 200%; pointer automation
is a separate known limitation. WebKit and Chromium exercise pointer input.

`SIMAGENTS_EVIDENCE_ROOT` selects an owned per-run output directory for public
UI/data/admission/runtime reports. Failed public flows archive screenshots
and Playwright traces. Ordinary automation blocks real provider traffic.
Admission fixtures can serve `SIMAGENTS_ADMISSION_TEST_DIST=apps/web/dist` at
`SIMAGENTS_ADMISSION_TEST_APP_ORIGIN=https://app.simagents.io`, reading relay
configuration from that artifact's build receipt. This tests the exact SPA
with synthetic server/widget traffic; it does not certify genuine admission.

Install the locked test runtime with `npm ci --prefix
scripts/fixtures/cloudflare-runtime`, audit it, and run
`MINIFLARE_MODULE_DIR="$PWD/scripts/fixtures/cloudflare-runtime/node_modules/miniflare"
node scripts/cloudflare-runtime-smoke.mjs`. Its real alarm wait is not an
accelerated clock. Local workerd evidence remains distinct from Cloudflare
runtime/location/PITR evidence. Documentation additionally requires
`node --test scripts/braces-security.test.mjs`; the private fork and its
upstream hashes/security scope are documented in `docs-site/vendor/braces`.

### RAM-only counter replacement

The current workerd runner verifies a global RAM coordinator, not persistent
SQLite counters/alarms. It waits 91 real seconds for restart safety and 97
seconds for the longest lease plus GC. The test-only subclass reads live RAM
size and SQLite key names; counter activity and expiry must both leave zero
stored keys. Production code never accesses the storage API. Only one constant
object ID is used, so opaque subjects and address fingerprints are not durable
object names. Local proof is distinct from deployed Free-plan/log evidence.

The internal baseline smoke now waits for the real inline import status,
not an obsolete browser alert; Playwright waits are bounded. It remains a
separate development-only build with baseline agents. Public candidate tests
must use the exact production artifact and simulated transport.
