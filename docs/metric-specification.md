# Metric Specification

Metric claims in SimAgents must identify the metric tier and the failure mode before they are used in reports or public research.

## Tiers

- `validated`: standard statistic with direct operational meaning in the current datastore
- `descriptive`: faithful telemetry, but not an inferential claim by itself
- `heuristic`: composite proxy that needs interpretation caution
- `experimental`: exploratory metric still under validation

## Core Metrics

| Metric | Tier | Formula | Notes | Failure Mode |
|--------|------|---------|-------|--------------|
| Survival rate | validated | `alive_at_end / alive_at_start` | Derived from persisted snapshots | Incorrect if initial snapshot is missing |
| Gini coefficient | validated | standard Gini over alive-agent balances | Computed from stored balances | Sensitive to tiny populations |
| Average wealth | descriptive | mean balance of alive agents | Useful state summary | Can hide inequality tails |
| Trade count | descriptive | final cumulative `agent_traded` count | Good for throughput | Not a direct measure of cooperation quality |
| Conflict count | descriptive | final cumulative harm/steal count | Good for incident volume | Does not capture severity distribution |
| Cooperation index | heuristic | `(positive trust share + repeat trade rate + cluster cohesion) / 3` | Proxy only | Overstates “cooperation” if trust or clustering are noisy |
| Clustering metrics | heuristic | connected components under fixed Manhattan radius | Topology proxy | Highly sensitive to radius choice |
| Intentional cooperation index | heuristic | `(cross-biome trade × 0.35) + (info novelty × 0.25) + (trade reciprocity × 0.25) + (voluntary approach × 0.15)` | Emergent cooperation experiments | Designed for `emergent_cooperation` profile; cross-biome trade is meaningful only with biome exclusivity enabled |
| Cross-biome trade rate | descriptive | fraction of trades between agents from different biomes | Measures complementarity-driven trade | Meaningless without biome exclusivity |
| Trade reciprocity rate | descriptive | fraction of trade partners who trade back | Sustained relationships vs one-offs | Does not measure trade quality |
| Cooperation timeline | experimental | per-tick cooperation index for discovery curve analysis | Observing S-curve emergence | Noisy at small window sizes |
| Phase 2 social graph metrics | experimental | graph statistics over knowledge/trust relations | Exploratory diagnostics | Null model still evolving |

## Emergence Metrics (Relations panel and exports)

Computed by `packages/engine/src/engine/emergence-metrics.ts` from the event log only; agents never see them. Exported as agents CSV, interactions CSV and JSON from Analytics → Relations. The worker computes them over the in-memory event log, which keeps the most recent 10 000 events, per-heartbeat bookkeeping included (saved snapshots keep only 500 and are not used for these figures); runs longer than that are measured over the retained window while survival still spans the whole run.

| Metric | Tier | Formula | Notes | Failure Mode |
|--------|------|---------|-------|--------------|
| Survival minutes | validated | death `simTimeMs` (or snapshot time if alive) / 60 000 | Per agent | All agents start at sim time 0; late spawns would be overstated |
| Decisions per sim hour | descriptive | decision events / survival hours | Speed is part of the evaluation: provider latency and effort reduce it | Sim speed changes during a run distort comparisons; keep speed fixed |
| Mean decision latency | descriptive | mean `processingTimeMs` of decision events | Wall-clock provider latency | Includes network and relay time, not only model time |
| Undecided turns | descriptive | `agent_undecided` count | A decision model (Sage) preferred no option and the agent did nothing; not a decision and not a failure, but its latency and tokens count | Depends on the model's own closeness threshold |
| Utterances / questions | descriptive | `agent_spoke` count; utterances containing `?` | Questions are a surface proxy | Rhetorical questions count; questions without `?` do not |
| Distinct listeners / addressees | descriptive | distinct agents who heard / were addressed | Contact breadth | Depends on spatial density; compare against random-walk baselines |
| Gifts given / received | descriptive | `agent_gave` events by giver / recipient | Unilateral transfers | Cannot tell gifts from payments agreed in speech; read the conversation |
| Strikes / takes / trades | descriptive | successful `harm` / `steal` / `trade` decisions | Physical acts, not moral judgements | Failed attempts are excluded |
| Addressed-speech reciprocity | heuristic | share of directed addressed pairs answered by addressed speech the other way | Conversation proxy | Null model: shuffle addressees among agents within earshot at the same tick |
| Gift reciprocity | heuristic | share of directed gift pairs with a gift the other way | Exchange proxy | Small counts; report pair counts with the ratio |
| Shared place names | experimental | names independently proposed by ≥2 agents | Convention formation proxy | Common words (e.g. "river") converge by chance; compare with name frequency in single-agent runs |

## Null-Model Rule

Any metric above the `descriptive` tier must document:

- the independent variable it is expected to respond to
- a null model or baseline comparison
- the conditions under which it becomes misleading

Until then, the metric may appear in telemetry but not as strong scientific evidence.
