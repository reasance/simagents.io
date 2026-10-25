# SimAgents Roadmap

> Last updated: 2026-10-25

## Current Status

SimAgents is a **browser-only testbed for emergent relations between AI models**:

- The user brings provider keys and configures participants: a model plus a reasoning
  effort. The same model can join several times at different efforts.
- The catalog lists the current models of Anthropic, OpenAI, Google, xAI, DeepSeek,
  Alibaba (Qwen), Z.ai (GLM), Mistral, MiniMax and Moonshot (Kimi), each with the effort
  levels its vendor documents, plus the decision models Jev (TypeSafe AI) and
  Sage (Levanto Labs). Every entry cites its source and verification date.
- Agents live in a shared world inside a Web Worker and must survive: hunger, energy,
  health, resources, shelters, seasons and an optional currency.
- There is no global tick. Each agent decides at its own pace while simulated time keeps
  passing, so provider latency and effort affect survival. Speed is part of the evaluation.
- Agents perceive only what is within sight, hear only what is said within earshot, and
  can speak freely to whoever is near. They are anonymous: prompts never name a model.
- Nothing tells agents to cooperate, trade or compete. The prompt describes physics and
  lists physical actions alphabetically; economic mechanics exist but are not suggested.
- Observer-only metrics (Analytics → Relations) measure speech, replies, gifts, force,
  shared conventions and survival per model and effort, with CSV/JSON exports.

World state persists in IndexedDB (shared 50 MiB budget); preferences and the optional
encrypted credential vault stay in `localStorage`. See `docs/browser-mode-plan.md`.

## Emergence Testbed Progress

| Step | Area | Status |
|------|------|--------|
| 0 | Dependency advisories (zod 4, undici) | Complete |
| 1 | Verified model catalog, Claude 5.x effort, duplicate-with-effort roster | Complete |
| 2 | No system trust in observations; puzzles and reproduction off by default | Complete |
| 3 | Free local speech (`speak`) with conversation in observations | Complete |
| 4 | Neutral prompt, physical action surface (`give`, `strike`, `take`), private notes | Complete |
| 5 | Provider failures isolated per agent, bounded retries, unresponsive agents stay in the world | Complete |
| 6 | Jev and Sage as voiceless decision-model participants | Complete |
| 7 | Effort in decision telemetry, emergence metrics, Relations panel and exports | Complete |

## Open Work

1. **Real-provider runs.** All verification uses synthetic provider responses. No paid
   inference has been run against the new catalog or the decision models.
2. **Jev and Sage transport.** Browser CORS support is undocumented, so both default to a
   user relay. Confirm with a live key whether direct browser calls work.
3. **Prices for new models.** Cost estimates only cover models with an entry in
   `packages/shared/src/provider-prices.json`; add verified prices before relying on
   per-run cost caps for Claude 5.5, GPT-6, Gemini 4 and the other new entries.
4. **Cross-browser smoke.** Local verification ran the chromium suite; CI also runs
   Firefox and WebKit.
5. **Null models for relational metrics.** `docs/metric-specification.md` names the
   comparisons; baseline runs that produce them are not automated yet.
6. **Trade semantics.** `trade` is an immediate swap the other agent is not asked about,
   and with cooperation enabled it can grant trust/loyalty bonus items. It is described
   honestly to agents; decide whether to keep, change or retire it.

## Verification Gates

From a clean checkout (see `docs/testing.md`):

```bash
bun install --frozen-lockfile
node scripts/audit-dependencies.mjs
bun run typecheck
bun run lint
bun run test
bun run build
node scripts/check-browser-bundle.mjs
```

Browser smoke tests need Playwright 1.62.1 (`PLAYWRIGHT_MODULE_DIR`) and a running dev or
preview server; `.github/workflows/ci.yml` shows the full matrix and the build-time
`VITE_*` variables.

## Known Limitations

1. **XSS remains the main threat to browser-held keys.** Keys stay in memory by default
   with optional passphrase encryption; follow `docs/security-byok.md` for any UI that
   renders model output or imported data.
2. **Agents' speech is untrusted text.** It is quoted verbatim into other agents' prompts
   (that exchange is the experiment) and rendered as plain text in the UI.
3. **Storage is finite.** Long verbose runs approach the 50 MiB budget; export runs as
   JSON or CSV.
