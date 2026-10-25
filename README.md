# Sim Agents

[![CI](https://github.com/reasance/simagents.io/actions/workflows/ci.yml/badge.svg)](https://github.com/reasance/simagents.io/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Browser-only testbed for emergent relations between AI models.

Bring your provider keys, add participants (a model plus a reasoning effort; the same model can join several times at different efforts, and the Jev and Sage decision models are supported), and let them try to survive in a shared world. Each agent acts at its own speed, sees only what is near, and can speak to whoever is within earshot. Nothing tells them to cooperate, trade or compete: the prompt describes physics only, agents are anonymous, and the Relations page measures what they say and do to each other per model and effort.

Sim Agents is a Vite SPA. The world runs inside a Web Worker, the UI is React/Zustand/Canvas, and worlds, replay frames, event summaries and experiment data are stored in browser IndexedDB with a shared 50 MiB application budget and JSON/CSV export paths. Preferences and the optional encrypted credential vault remain in `localStorage`.

## Architecture

| Layer | Current implementation |
|-------|------------------------|
| App | `apps/web` Vite + React |
| Engine | `packages/engine` browser-safe continuous-time simulation |
| Worker host | `apps/web/src/engine-host` |
| Persistence | IndexedDB with legacy migration, a 50 MiB data budget and import/export |
| LLMs | BYOK provider calls, direct or through a user-provided proxy URL; effort per participant |
| Decision models | Jev (TypeSafe AI) and Sage (Levanto Labs) choose among concrete actions and cannot speak |
| Shared catalog | `packages/shared/src/llm-catalog.ts`, each model with its vendor source and verification date |
| Emergence metrics | `packages/engine/src/engine/emergence-metrics.ts`, observer-only, CSV/JSON export |

Important local keys:

- `simagents_credential_vault_v1` (optional encrypted credentials)
- `simagents_session_limits_v1` (non-secret request/time/token limits)
- `simagents_connections_v1` (connection metadata without secrets)
- `simagents_agent_roster`
- `simagents_proxy_url`
- `simagents_world_snapshot`
- `simagents_event_ring`
- `simagents_replay_frames_v1`
- `simagents_prompt_logs_v1`
- `simagents_experiment_defs_v1`
- `simagents_experiment_runs_v1`

## Getting Started

```bash
bun install --frozen-lockfile
bun dev:web
```

Use Bun 1.2.14 (see `.bun-version`). Open [http://localhost:5173](http://localhost:5173), enter or unlock provider keys, configure the roster, and review session limits before starting. Public builds require BYOK; internal baseline fixtures require `VITE_INTERNAL_TESTS=true` in development.

In Configuration → Connections, create a named connection, select its protocol/endpoint, and assign it to an agent. New OpenAI connections default to Responses. Set model capabilities, optionally load model IDs, then explicitly verify the model (one potentially billable request). Legacy provider-only settings are converted while retaining roster/model IDs and saved user-relay settings; public startup requires verification of the displayed connection. Invalid legacy settings remain blocked until corrected.

Provider keys stay in memory by default. Optional encrypted storage requires a passphrase; legacy plaintext keys require explicit migration. See [BYOK Security Notes](docs/security-byok.md) before adding any feature that renders imported data, model output, or proxy responses.

See [BYOK release status](docs/byok-release-status.md) for completed work and remaining release gates.

The [official relay implementation](apps/relay/README.md) is available for deployment review but has not been deployed. Its option stays disabled until the build has `VITE_OFFICIAL_RELAY_URL`, `VITE_ADMISSION_URL` and `VITE_TURNSTILE_SITE_KEY`. Public access uses a security check without accounts or invitations. Authorization stays in memory for 15 minutes and renews separately from provider keys. Genuine Turnstile and Cloudflare runtime checks remain pending.

## Verification

```bash
bun typecheck
bun run test
(cd apps/web && bun run build)
node --check scripts/browser-smoke.mjs
```

Bundle safety check after a web build:

```bash
node scripts/check-browser-bundle.mjs
```

The checker rejects backend dependencies/control-plane calls while allowing vendor URLs such as OpenRouter and Z.ai that contain `/api/`.

To run the browser smoke test against a running dev server:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

If Playwright is not installed in the workspace, set `PLAYWRIGHT_MODULE_DIR` to a directory containing `node_modules/playwright`.

## Documentation

| Document | Description |
|----------|-------------|
| [Backend Zero Architecture](docs/browser-mode-plan.md) | Browser-only runtime, storage, worker APIs |
| [Testing Matrix](docs/testing.md) | Required static and browser gates |
| [Browser-Only Release Checklist](docs/browser-only-release-checklist.md) | Pre-tag gates, manual QA, release notes draft |
| [BYOK Security Notes](docs/security-byok.md) | Browser key storage, CSP, XSS checklist |
| [Documentation Index](docs/INDEX.md) | Central navigation hub |
| [Research Guide](docs/public/research-guide.md) | Browser-local experiment posture and exports |
| [Metric Specification](docs/metric-specification.md) | Metric tiers, including emergence metrics |
| [Roadmap](ROADMAP.md) | Current status and open work |
| [PRD](docs/PRD.md) | Historical product requirements |

## License

[MIT](LICENSE)
