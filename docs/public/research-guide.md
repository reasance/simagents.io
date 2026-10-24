# Research Guide

Browser-local SimAgents runs are best treated as exploratory by default. They are useful for forming hypotheses, inspecting behaviors, comparing prompt settings, and exporting artifacts for later review.

## Evidence Levels

| Level | Appropriate use |
|-------|-----------------|
| Exploratory | Interactive runs, prompt tuning, demo worlds, qualitative inspection |
| Descriptive | Exported runs with documented seed, roster, config, and metrics |
| Comparative | Multiple exported runs with locked settings and matched baselines |
| Validated | Replicated comparisons with predeclared hypotheses and statistical review |

Do not present a single browser run as validated evidence.

## Browser Experiment Runner

The worker exposes a small batch runner through `engine-client.ts`:

- `runExperiment(definition)`
- `cancelExperiment(runId)`
- `getExperimentStatus(runId)`
- `exportExperiment(runId)`

Definitions and run summaries are stored in:

- `simagents_experiment_defs_v1`
- `simagents_experiment_runs_v1`

Runs are bounded for browser storage. Export JSON or CSV when the artifact matters.

## What To Record

For any run you intend to discuss, keep:

- world seed
- roster and provider settings
- custom prompt
- runtime config overrides
- start/end tick
- exported world JSON
- experiment JSON/CSV export when using the batch runner
- notes on manual interventions

## Metrics Posture

Prefer explicit metric classes:

- **Mechanistic:** counts and state values directly produced by the world.
- **Heuristic:** useful summaries such as cooperation rate or survival trend.
- **Inferential:** only after replicated, matched comparisons.

State which class you are using.

## Browser Artifact Bundle

A minimal review bundle should include:

```text
bundle/
  README.md
  world-export.json
  experiment-run.json
  experiment-run.csv
  config-notes.md
  claim-review.md
```

Use [Research Bundles](https://github.com/reasance/simagents.io/blob/main/docs/research-bundles.md) and the templates in `docs/templates/` when preparing a stronger claim.
