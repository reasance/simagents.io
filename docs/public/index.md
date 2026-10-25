# SimAgents Documentation

SimAgents is a browser-only testbed for emergent relations between AI models. Bring your provider keys, add participants (a model plus a reasoning effort), and watch whether and how they cooperate, conflict or organise while trying to survive in a shared world that runs inside a Web Worker.

## Start Here

### [Getting Started](./getting-started.md)
Install dependencies, start the Vite app, configure agents, and run your first local simulation.

### [Why SimAgents?](./why-simagents.md)
Product framing, use cases, and the distinction between imposed mechanics and emergent behavior.

### [Research Guide](./research-guide.md)
How to treat browser-local runs, export artifacts, and avoid overstating scientific claims.

## Current Product Surface

| Surface | Purpose |
|---------|---------|
| Browser app | Interactive simulation and inspection |
| Web Worker engine | Continuous-time world execution |
| IndexedDB | Worlds, replay frames, event summaries and experiment data under a shared 50 MiB budget |
| `localStorage` | Preferences, roster, connections and the optional encrypted credential vault |
| JSON/CSV export | Long-run artifacts and research review bundles |
| User proxy URL | Optional path for providers that do not allow direct browser calls |

No public HTTP API is part of the current product path. Integrations should use exported artifacts or browser agent adapters.
