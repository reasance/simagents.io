# Getting Started

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- Git

## Install

```bash
git clone https://github.com/reasance/simagents.io.git
cd simagents.io
bun install
```

## Start The App

```bash
bun dev:web
```

Open [http://localhost:5173](http://localhost:5173).

## Configure Agents

Open the Config panel:

- Edit the agent roster.
- Use baseline agents for zero-cost local runs.
- Add provider API keys only when you want live model decisions.
- Add a proxy URL only when a provider requires one.

Browser-local data is stored under versioned or bounded keys:

| Key | Purpose |
|-----|---------|
| `simagents_api_keys` | BYOK provider keys |
| `simagents_agent_roster` | Agent roster and model settings |
| `simagents_proxy_url` | Optional user-provided proxy origin |
| `simagents_world_snapshot` | Versioned world snapshot |
| `simagents_event_ring` | Recent event ring |
| `simagents_replay_frames_v1` | Local replay frames |
| `simagents_prompt_logs_v1` | Local prompt inspector logs |
| `simagents_experiment_defs_v1` | Browser experiment definitions |
| `simagents_experiment_runs_v1` | Browser experiment summaries |

Provider keys stay in memory by default; encrypted local storage is optional. Review [BYOK Security Notes](https://github.com/reasance/simagents.io/blob/main/docs/security-byok.md) before adding UI that renders imported data, model output, or proxy responses.

## Run A Simulation

Click **Start**. If a saved world exists, choose whether to resume it or start fresh.

During a run you can:

- pause and resume the worker engine
- export the current world as JSON
- import a previous world export
- view local analytics
- inspect replay frames
- inspect puzzle state
- edit and apply the custom prompt
- inspect local prompt logs

## Browser Smoke Test

With the dev server running:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

If Playwright is not installed in the workspace, set `PLAYWRIGHT_MODULE_DIR` to a directory containing `node_modules/playwright`.

## Troubleshooting

### Provider Needs Proxy

Add a proxy URL in the Config panel or choose a direct-browser provider.

### World Snapshot Is Too Large

Export the world, reduce long-running verbose sessions, then start or import a smaller saved state. The app drops secondary bounded artifacts before pausing core snapshot persistence.

### No Agents Appearing

Configure at least one roster entry and click **Start**. Baseline agents do not need provider keys.

### LLM Timeout Errors

Check browser-local keys, provider availability, and proxy URL. Use baseline agents when you want a fully local, zero-cost run.
