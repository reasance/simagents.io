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

## Set Up A Simulation

Click **Set up a simulation** (or **Start**). Setup has three steps:

1. **Provider keys.** Paste a key for each provider you want to use. Each key gets a standard connection; providers that do not accept browser calls (and Jev and Sage) need your relay URL. Custom endpoints and the optional encrypted key vault are in the same step.
2. **Participants.** Each participant is a provider, a model and an effort level. Use **Duplicate** to add the same model again at another effort. Verify each participant (one potentially billable request); changing the model or effort needs a new check.
3. **Limits and start.** Set the request, duration and token limits, choose whether to resume a saved world, and start.

## Try It Without Keys

Click **Try a dry run** on the first screen, or choose **Dry run** in the first setup step. Participants still have a provider, a model and an effort, but no model is called: each one answers with a scripted local reply after a delay that grows with its effort. No key is needed, nothing is sent and nothing is billed. A first dry run with a single participant gets three more so they have someone to meet. The top bar shows **Dry run** while it runs, the saved world is marked as one, and it resumes only as a dry run. Use it to try the interface; it says nothing about how models behave.

The system prompt and the world's starting values live in **Menu → Advanced settings**. Baseline agents are available only in development builds with `VITE_INTERNAL_TESTS=true`.

Browser-local data is stored under versioned or bounded keys:

| Key | Purpose |
|-----|---------|
| `simagents_credential_vault_v1` | Optional passphrase-encrypted provider keys |
| `simagents_connections_v1` | Connection metadata without secrets |
| `simagents_agent_roster` | Agent roster and model settings |
| `simagents_proxy_url` | Optional user-provided proxy origin |
| `simagents_world_snapshot` | Versioned world snapshot |
| `simagents_event_ring` | Recent event ring |
| `simagents_replay_frames_v1` | Local replay frames |
| `simagents_prompt_logs_v1` | Local prompt inspector logs |
| `simagents_dry_run_v1` | Dry run chosen for the next session |
| `simagents_experiment_defs_v1` | Browser experiment definitions |
| `simagents_experiment_runs_v1` | Browser experiment summaries |

Provider keys stay in memory by default; encrypted local storage is optional. Review [BYOK Security Notes](https://github.com/reasance/simagents.io/blob/main/docs/security-byok.md) before adding UI that renders imported data, model output, or proxy responses.

## Run A Simulation

The world view shows the map (spoken lines appear as brass arcs from speaker to listeners), the participants with their model and effort, and a feed of what they said and did to each other. Select a participant to see its vitals, private notes and recent decisions.

During a run you can:

- pause and resume the worker engine, and change its speed
- open **Relations** for observer-only metrics (speech, replies, gifts, force and survival per model and effort) with CSV/JSON export
- open **Replay** to step through saved frames, and **Prompts** to read the exact prompts and answers
- open the social graph, export the current world or import a previous export from the menu

## Browser Smoke Test

With the dev server running:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

If Playwright is not installed in the workspace, set `PLAYWRIGHT_MODULE_DIR` to a directory containing `node_modules/playwright`.

## Troubleshooting

### Provider Needs Proxy

Enter your relay URL in the first setup step, or choose a provider that accepts browser calls.

### World Snapshot Is Too Large

Export the world, reduce long-running verbose sessions, then start or import a smaller saved state. The app drops secondary bounded artifacts before pausing core snapshot persistence.

### No Agents Appearing

Add at least one participant in setup and start the world. Baseline agents do not need provider keys.

### LLM Timeout Errors

Check browser-local keys, provider availability, and proxy URL. Use baseline agents when you want a fully local, zero-cost run.
