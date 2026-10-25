# CLAUDE.md

This file provides guidance to AI coding assistants when working with this repository.

## Project Overview

Sim Agents is a browser-only testbed for emergent relations between AI models. The user opens the Vite app, brings provider API keys, and configures participants: a model plus a reasoning effort (the same model may join several times at different efforts; Jev and Sage decision models are supported). The participants then live in a continuous-time world inside a Web Worker and must survive. The point is to observe whether and how they start to cooperate, conflict or form any kind of structure, without being told to.

World state persists in IndexedDB under a shared 50 MiB budget; preferences and the optional encrypted credential vault stay in bounded `localStorage`. Long artifacts are exported as JSON or CSV.

There is no product backend path. `apps/relay` and `apps/admission` are constrained Cloudflare Workers for provider transport only. Do not add route handlers, database clients, queues, auth enforcement, tenancy, or server-side control flows unless the user explicitly asks for a separate experimental artifact.

## Core Philosophy

Always distinguish:

- **Imposed infrastructure:** grid world, movement physics, event logging, identity, survival pressure, health, resources, biomes, seasonal cycles, currency.
- **Emergent behavior:** movement patterns, conversation, trade conventions, reputation, trust, social structures, property conventions, laws, morality.

Rules:

- Validate physics, not morality. Do not add centralized reputation, crime tracking, or justice systems.
- **No incentives in what agents read.** The prompt describes physics only. It never says to cooperate, trade, compete, help or accumulate, and never reveals cooperation bonuses or trust-based prices (in memories either).
- **Physical action names.** Agent-facing actions come from `packages/engine/src/llm/prompts/action-surface.ts`, listed alphabetically with physical descriptions; morally loaded engine actions are aliased (`strike` → `harm`, `take` → `steal`).
- **Anonymity.** Prompts never contain model, provider or roster names. Model and effort are visible only to the observer.
- **Speed is evaluated.** There is no global tick and simulated time passes while an agent decides. Never normalize latency between models.
- **Observer-only metrics.** Relational metrics (`engine/emergence-metrics.ts`) are computed from the event log and never fed back to agents.
- **UI only for real functions.** Every control must be wired to something the product does. Do not add placeholder panels, features that are off for everyone, or controls the engine ignores.

## Interface

The design is "Observatory": dark, map-centred, one brass accent for what is active, selected or spoken. Colours and type are tokens in `apps/web/src/index.css` (`night`, `panel`, `raised`, `rule`, `mist`, `star`, `brass`, `ok`, `alert`; IBM Plex Sans/Mono and Barlow Condensed, self-hosted). Component classes live in `@layer components` so Tailwind utilities can override them. Targets are at least 44 px, everything works by keyboard, and the browser smokes audit WCAG 2.2 AA at 1440, 768 and 390 px.

**Dry run** (`engine/llm/dry-run-provider.ts`) replaces every model participant with scripted local replies: the real prompt is built, the reply waits a wall-clock delay that grows with effort, and nothing is sent or billed. The worker receives no keys or connections, the saved world carries `configuration.dryRun`, and a world resumes only in the mode it was started in. It exists to exercise the interface; never present its worlds as model results.

## Architecture

```text
apps/web/
  src/engine-host/        # Worker entrypoint and main-thread client
  src/services/           # IndexedDB/localStorage persistence, replay, prompt logs, experiments, verification
  src/stores/             # Zustand state
  src/components/         # UI: TopBar, Setup (keys → participants → limits), World (participants, detail, feed),
                          # Canvas/WorldMap, Analytics (Relations page), SocialGraph, ConfigPanel (advanced settings)
  src/index.css           # Observatory design tokens and component classes
apps/relay/               # Official provider relay (Cloudflare Worker, text protocols only)
apps/admission/           # Relay access admission (Cloudflare Worker)
packages/engine/
  src/actions/            # Action handlers and types
  src/engine/             # SimEngine, agent runner, executor, persistence, emergence metrics
  src/engine/llm/         # Provider requests, protocol adapters, decision-model provider
  src/engine-memory/      # Browser-local store, queries, bus, projections
  src/llm/                # Prompt construction, action surface and response parsing
  src/config/             # Runtime config and worker overrides
packages/shared/
  src/llm-catalog.ts      # Provider/model/effort catalog with vendor sources
  src/connections.ts      # Connection profiles, text and decision protocols
```

## Commands

```bash
bun dev:web
bun run typecheck
bun run lint
bun run test
bun run build
node scripts/audit-dependencies.mjs
node scripts/check-browser-bundle.mjs
node --check scripts/browser-smoke.mjs
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

`check-browser-bundle.mjs` passes when it prints its success line; it allows vendor URLs such as OpenRouter and Z.ai that contain `/api/`. Browser smokes need Playwright 1.62.1 via `PLAYWRIGHT_MODULE_DIR`; see `docs/testing.md` and `.github/workflows/ci.yml` for the full matrix and build-time `VITE_*` variables.

## Local Storage Keys

- `simagents_credential_vault_v1` (optional encrypted credentials)
- `simagents_api_keys` (legacy plaintext; explicit migration only)
- `simagents_session_limits_v1`
- `simagents_connections_v1`
- `simagents_agent_roster`
- `simagents_proxy_url`
- `simagents_world_snapshot`
- `simagents_event_ring`
- `simagents_custom_prompt`
- `simagents_replay_frames_v1`
- `simagents_prompt_logs_v1`
- `simagents_experiment_defs_v1`
- `simagents_experiment_runs_v1`
- `simagents_dry_run_v1` (dry run chosen for the next session)

All new keys must be versioned, validated on read, bounded by byte/count budget, and clearable/exportable where user data could become large.

## Worker Interfaces

The main-thread client in `apps/web/src/engine-host/engine-client.ts` is the public control boundary. Add browser features there instead of inventing HTTP-shaped interfaces.

Current worker capabilities include:

- world init/start/pause/resume/reset/snapshot/export
- runtime config and custom prompt application
- local replay range/frame/agent timeline
- local prompt log consumption
- browser experiment run/cancel/status/export
- browser agent adapter registration
- warnings for agents left unresponsive after provider failures

## Adding Actions

1. Add or update the handler in `packages/engine/src/actions/handlers/`.
2. Add the action type in `packages/engine/src/actions/types.ts` and its params schema in `actions/validation.ts`.
3. Register it in the action dispatcher.
4. Offer it to LLM agents in `llm/prompts/action-surface.ts` with a physical, judgement-free description, and to decision models in `engine/llm/decision-model-provider.ts` if it can be fully specified in advance.
5. Keep cross-entity mutations in browser-local query modules or engine helpers.
6. Add fixtures to `__tests__/engine/action-matrix.test.ts` and focused tests under `packages/engine`.

## Adding LLM Providers

1. Update `packages/shared/src/llm-catalog.ts`. Every model needs a vendor `source` URL, a `verifiedAt` date and the reasoning levels the vendor documents; never fill these from memory.
2. Update request construction in `packages/engine/src/engine/llm/protocol-adapters.ts` (effort mapping per protocol).
3. If the provider cannot be called directly from the browser, mark it proxy-only and rely on the user-configured proxy URL.
4. Decision models (closed-question APIs) use a decision protocol in `packages/shared/src/connections.ts` and `engine/llm/decision-model-provider.ts`; the official relay does not carry them.
5. Keep keys out of logs, snapshots, replay frames, prompt logs, and exports.

## Documentation

- `docs/browser-mode-plan.md` - current browser-only architecture and agent interface
- `docs/testing.md` - verification gates
- `docs/metric-specification.md` - metric tiers, including emergence metrics
- `docs/security-byok.md` - browser key storage and XSS posture
- `docs/public/research-guide.md` - browser experiment posture
- `docs/PRD.md` - historical requirements

All project artifacts should be in English.
