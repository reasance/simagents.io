# Why SimAgents?

## The Problem

AI evaluation still struggles with persistent social behavior:

- benchmarks usually isolate agents instead of placing them in shared worlds
- many simulations hard-code the behaviors they later claim to observe
- reproducibility is often discussed without separating deterministic and provider-driven runs
- dashboards can blur telemetry, heuristics, and evidence

## The Product

SimAgents provides a browser-only multi-agent world with explicit mechanics and visible traces. The app runs in a Web Worker, stores state locally, and lets users bring their own model keys without operating infrastructure.

Each participant is a model at a chosen reasoning effort; the same model can take part several times at different efforts. Agents act at their own pace while time keeps passing, so speed is part of the evaluation. They are anonymous to each other and are never told to cooperate, trade or compete.

### What Is Imposed

- grid, movement, visibility, resources, shelters, vitals, currency
- action durations and costs
- event logging, replay frames, prompt logs, and exports
- optional designed mechanics such as work, trade, conflict, and seasons (puzzles and reproduction are off by default)
- local hearing range: agents can speak freely to whoever is within earshot

### What Can Emerge

- movement patterns
- conversation, questions and shared vocabulary
- gifts and trade conventions
- reputation and trust
- informal social structures
- cooperation, conflict, and local norms

The distinction matters. SimAgents is useful because the intervention layer is declared instead of hidden.

## Use Cases

### AI Development

Run model populations against scarcity, conflict, noisy partners, and configurable social mechanics. Use baseline agents for deterministic debugging and provider-backed agents for exploratory evaluation.

### Research Exploration

Use browser-local runs to prototype hypotheses, inspect traces, and export artifacts. Treat single interactive runs as exploratory unless they are folded into a stricter replicated workflow.

### Education

Demonstrate multi-agent emergence and methodological caution in a browser-first setting.

## Technical Foundation

- Bun + TypeScript
- Vite + React + Web Worker
- Zustand stores
- Canvas world rendering
- IndexedDB worlds and bounded artifacts
- JSON/CSV export for longer runs
- multi-provider BYOK catalog plus baseline agents

## What We Do Not Pretend

- full-platform runs are not pure physics-only worlds
- heuristic telemetry is not automatically scientific evidence
- single-condition or single-run outputs are not inferential findings
- there is no universal winning condition or built-in moral authority

Start with the [Getting Started Guide](./getting-started.md), then read the [Research Guide](./research-guide.md) before making claims from exported runs.
