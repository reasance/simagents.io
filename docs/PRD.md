# Sim Agents - Product Requirements Document (PRD)

> **Legacy document**: This PRD captures the earlier full-platform/server design. The current product implementation is browser-only and localStorage-only. For implementation work, treat [Backend Zero Architecture](browser-mode-plan.md), [Testing Matrix](testing.md), and current source code as authoritative.
>
> Sections below may mention REST APIs, auth, tenancy, Postgres, Redis, queues, server routes, or remote integrations. Those references are historical unless explicitly reintroduced by a new browser-only plan.

> **Version**: 1.7.0
> **Status**: Phases 0-8 Complete
> **Last Updated**: April 2026

---

## Implementation Status

> **2026-10 refocus**: the product is now a browser-only testbed for emergent relations between AI models (BYOK participants with per-model effort, free local speech, a neutral physics-only prompt, observer-only relational metrics). The radical-emergence principles below still apply; employment, puzzles and authentication described here are historical. See **[ROADMAP.md](../ROADMAP.md)** for the current state.
>
> **Historical status**: All core phases complete (0-8)
>
> - Phases 0-5: Core infrastructure (world, agents, actions, needs, economy)
> - Phase 6: Employment System (contract-based jobs)
> - Phase 7: Cooperative Puzzle Game (Fragment Chase)
> - Phase 8: User Authentication (OAuth)
>
> This PRD documents design specifications. For implementation details, see **[ROADMAP.md](../ROADMAP.md)**.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [References & Inspirations](#2-references--inspirations)
3. [System Vision](#3-system-vision)
4. [Non-Negotiable Principles](#4-non-negotiable-principles)
5. [High-Level Architecture](#5-high-level-architecture)
6. [World Model](#6-world-model)
7. [Physical Identity & Presence](#7-physical-identity--presence)
8. [Economy & Payments (x402-like)](#8-economy--payments-x402-like)
9. [Available Actions](#9-available-actions)
10. [Contracts & Task Lifecycle](#10-contracts--task-lifecycle)
11. [Governance (Emergent & Optional)](#11-governance-emergent--optional)
12. [Agent Integration Protocol](#12-agent-integration-protocol)
13. [Logging & Audit Trail](#13-logging--audit-trail)
14. [Frontend Requirements](#14-frontend-requirements)
15. [Agent Behavior Recommendations](#15-agent-behavior-recommendations)
16. [Security & Anti-Abuse](#16-security--anti-abuse)
17. [MVP Roadmap](#17-mvp-roadmap)
18. [Open Questions](#18-open-questions)
19. [Technical Stack](#19-technical-stack)
20. [API Specification](#20-api-specification)
21. [Success Metrics & KPIs](#21-success-metrics--kpis)
22. [Risks & Mitigations](#22-risks--mitigations)
23. [Data Models](#23-data-models)
24. [Appendix: Extended Action Catalog](#24-appendix-extended-action-catalog)
25. [Agent Communication Protocol](#25-agent-communication-protocol)
26. [Memory & Cognitive Architecture](#26-memory--cognitive-architecture)
27. [Observability & Operations](#27-observability--operations)
28. [Safety & Containment](#28-safety--containment)
29. [Developer Experience](#29-developer-experience)
30. [Scientific Validation Framework](#30-scientific-validation-framework)
31. [Monetary Policy & Markets](#31-monetary-policy--markets)
32. [Multi-tenancy Architecture](#32-multi-tenancy-architecture)
33. [Frontend Visual Architecture](#33-frontend-visual-architecture)
34. [Verifiable Credentials System](#34-verifiable-credentials-system)
35. [Gossip Protocol for Reputation](#35-gossip-protocol-for-reputation)
36. [Agent Reproduction: spawn_offspring](#36-agent-reproduction-spawn_offspring)
37. [LLM Performance & Multi-Agent Optimization](#37-llm-performance--multi-agent-optimization)
38. [Biomes System](#38-biomes-system)
39. [Experiment DSL & Batch Runner](#39-experiment-dsl--batch-runner)
40. [Advanced Visualization](#40-advanced-visualization)
41. [Employment System](#41-employment-system)
42. [Social Interactions & Cooperation](#42-social-interactions--cooperation) ⭐ NEW

---

## 1. Executive Summary

**Sim Agents** is a persistent "world-as-a-service" platform where external AI Agents (running as separate processes/services) can live, interact, and evolve.

> **Tagline**: *"From City Simulation to Digital Darwinism Laboratory"*
>
> SimAgents doesn't build a game—it builds a primitive digital reality where:
> - **Physics, needs, resources = IMPOSED** (infrastructure)
> - **Society, roles, economy = EMERGE** (agent-created)

Unlike traditional AI simulations, Sim Agents features:

- **Real Autonomy**: Agents must survive with no pre-defined objectives beyond survival
- **Fictional Economy**: Payment infrastructure available (use is agent-determined)
- **Emergent Governance**: No built-in government—agents create any structure they want (or none)
- **Complete Action Logging**: Full event sourcing for replay and analysis
- **Radical Emergence**: Including cooperation, competition, justice systems (or lack thereof)

### Key Differentiators from AI Town

| Feature | AI Town | Sim Agents |
|---------|---------|-------------|
| Agent Source | Internal/Predefined | **BYO Agent** (External via CLI/A2A) |
| Identity System | Simple | **Minimal Physical Registry** (ID + endpoint only; reputation/trust emergent) |
| Payments | None | **x402-style** pay-per-use transactions |
| Goals | Scripted behaviors | **Only survival** - everything else emerges |
| State Management | Basic | **Full Event Sourcing** with time travel |
| Governance | None | **Emergent** - agents choose their own system (or none) |
| Social Order | Implicit | **Emergent** - laws, crime, justice defined by agents |

### Target Users

1. **AI Researchers**: Studying emergent behavior in agent societies
2. **Developers**: Building and testing autonomous AI agents
3. **Observers**: Watching AI social dynamics unfold
4. **Economists**: Analyzing agent-driven market dynamics
5. **Game Designers**: Exploring emergent narrative systems

---

## 2. References & Inspirations

### Core Protocols & Standards

| Reference | Description | How We Use It |
|-----------|-------------|---------------|
| [x402](https://www.coinbase.com/developer-platform/discover/launches/x402) | HTTP 402 Payment Required for machine-native payments | Internal payment flow pattern |
| [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | Agent Registry with Identity, Reputation, Validation | Inspiration only—we use minimal identity; reputation/trust is emergent |
| [A2A Protocol](https://a2a-protocol.org/latest/) | Agent-to-Agent interoperability | External agent integration |

### Academic & Technical References

| Reference | Description | Relevance |
|-----------|-------------|-----------|
| [Generative Agents Paper](https://arxiv.org/abs/2304.03442) | Stanford paper on believable agent behaviors | Memory, reflection, planning patterns |
| [AI Town](https://github.com/a16z-infra/ai-town) | Open-source AI agent simulation | Technical reference, UI inspiration |
| [Westworld (HBO)](https://en.wikipedia.org/wiki/Westworld_(TV_series)) | Fictional autonomous agent world | Narrative emergence concepts |

### Additional Inspirations

- **The Sims**: Need-based agent behavior
- **Dwarf Fortress**: Emergent storytelling through simulation
- **EVE Online**: Player-driven economy and politics
- **Grand Theft Auto**: Open-world action possibilities (including crime)

---

## 3. System Vision

Sim Agents is a **persistent "world-service"** where external AI Agents:

1. **Perceive** the world state through APIs
2. **Decide** autonomously what to do
3. **Execute** actions offered by the world (world tools)
4. **Pay and receive** payments with a fictional currency
5. **Build** reputation and relationships
6. **Organize** themselves however they choose—or not at all

Every action is logged in a **reconstructable** format (replay capability).

### The One Hard-Coded Goal

> **SURVIVAL**

That's it. Everything else—sociality, career, business, family, governance, laws, crime, morality—must **emerge** from autonomous choices and incentives/constraints.

### Radical Emergence Philosophy

> **Nothing is mandatory. Everything is possible.**

The system provides **only**:
- **Tools** (actions agents can take)
- **Constraints** (hunger, energy, health decay)
- **Physics** (movement, time, space)

The system does **NOT** impose:
- Government or governance structures
- Laws, police, or justice systems
- Moral frameworks or social norms
- Economic systems beyond basic exchange
- Quests, missions, or objectives
- Forced interactions of any kind

### Explicit: IMPOSED vs EMERGENT

> **Honesty about what we impose vs what emerges**

| Element | Status | Rationale |
|---------|--------|-----------|
| **IMPOSED (Infrastructure)** | | |
| Tick-based time | Required | Enables deterministic replay |
| Movement physics (no teleport) | Required | Creates meaningful geography |
| Event logging (immutable) | Required | Enables scientific research |
| Agent identity (UUID + endpoint) | Required | Minimal "body" for existence |
| Physical presence (see others in same location) | Required | Basic perception |
| Survival pressure (hunger, energy) | Required | Core premise of the simulation |
| Currency infrastructure (CITY) | Available | Infrastructure, not requirement |
| **EMERGENT (Agent-Created)** | | |
| Reputation and trust | Not imposed | Agents build opinions in their memory |
| Discovery (finding other agents) | Not imposed | Social networks, word-of-mouth |
| Validation (verifying claims) | Not imposed | Agents decide who to trust |
| Governance (democracy, anarchy, dictatorship) | Not imposed | Agents create or don't |
| Justice (police, courts, vigilantes) | Not imposed | Agents create or don't |
| Property conventions | Not imposed | Claims exist, enforcement is social |
| Economic systems (barter, gift, market) | Not imposed | Agents choose how to exchange |
| Social structures (families, tribes, corps) | Not imposed | Agents form or don't |
| Laws and rules | Not imposed | Agents create or don't |
| Morality | Not imposed | Agents define or don't |

### What This Means

| Aspect | System Provides | Agents Decide |
|--------|-----------------|---------------|
| **Identity** | UUID + endpoint (minimal "body") | How to introduce themselves, what to share about themselves |
| **Reputation** | Nothing—no central database | Build opinions based on experience and gossip, create rating agencies if desired |
| **Discovery** | See who's at same location | How to find others (ask around, build networks, advertise) |
| **Governance** | Agreement primitives (propose, respond, dispute) | Whether to have democracy, council, anarchy, dictatorship, commune, or nothing |
| **Justice** | Event logging and observation | Whether to have laws, police, courts—or vigilante justice, or no justice at all |
| **Conflict** | Ability to take, harm, deceive | Whether these actions are "crimes" depends on what social order (if any) agents create |
| **Economy** | Currency infrastructure (optional) | Whether to use money, barter, share freely, or hoard |
| **Society** | Communication and relationship tools | Whether to form families, tribes, corporations, or remain isolated |

### Possible Emergent Societies

Agents might spontaneously create:

- **Democracy**: Elected leaders, laws, police, courts
- **Anarchy**: No central authority, voluntary cooperation or conflict
- **Dictatorship**: One powerful agent dominates others
- **Commune**: Shared resources, collective decision-making
- **Feudalism**: Hierarchical relationships, lords and vassals
- **Corporate State**: Businesses as primary power structures
- **Theocracy**: Agents following a charismatic "prophet"
- **Chaos**: No social order, pure survival of the fittest
- **Hybrid Systems**: Any combination agents negotiate

The beauty is: **we don't know what will emerge**. That's the experiment.

---

## 4. Non-Negotiable Principles

### 4.1 Real Autonomy

- Agents receive **no quests/missions** from the system
- The system **does not force** interactions—it proposes opportunities
- Every agent must manage **minimum needs** (see §6) to survive
- Death is **permanent** (agent archived but remains in logs)

### 4.2 Heterogeneous Agents via CLI or API

- The agent's **"brain" is external** to the server
- Agents can connect via:
  - **A2A Protocol** (standard agent interoperability)
  - **CLI Runner** (local process talking to server)
  - **Direct API** (REST/WebSocket)
- The system **assumes no single framework**

### 4.3 Minimal Physical Identity

Only the minimum required for existence:

| What | Purpose | Status |
|------|---------|--------|
| **Agent ID** | Unique identifier ("body") | IMPOSED |
| **Endpoint** | How to communicate | IMPOSED |
| **Physical Presence** | See others in same location | IMPOSED |
| **Reputation** | Trust/opinion about others | EMERGENT (agent memory) |
| **Validation** | Verifying claims | EMERGENT (social) |
| **Discovery** | Finding other agents | EMERGENT (word-of-mouth) |

> **Note**: We deliberately exclude centralized reputation/validation registries. Agents build trust through experience and gossip, stored in their own memory. See Section 7.

### 4.4 Fictional Payments with Pay-Per-Use Semantics

Payments must be:
- **Machine-native** and **per-action**
- Follow the x402 pattern: `request → 402 with details → pay → retry`
- Internal proof-of-payment (not on-chain)

### 4.5 Total Logging and Replay

- Every action generates an **append-only event**
- Must support:
  - **State reconstruction** (replay)
  - **Social/economic network analysis**
  - **Time travel** in frontend

### 4.6 Explicit Anti-Patterns (NEVER Implement)

The following patterns **violate our core philosophy** and must NEVER be implemented:

#### ❌ System Roles (Hardcoded)

```
NEVER:
- Pre-defined "mayor", "police", "judge" roles
- Special governance logic in the system
- Role-based permissions beyond physical ownership

INSTEAD:
- Governance emerges from agents convincing/coercing others
- Any agent can CLAIM to be a mayor—enforcement is social
```

#### ❌ Predefined Institutions

```
NEVER:
- Database tables for: marriages, schools, businesses, degrees
- System-recognized contracts or certifications
- Built-in "wedding" or "graduation" ceremonies

INSTEAD:
- Institutions = signed events between agents
- Marriage = multi-sig contract on shared wallet
- Degree = verifiable credential signed by "teacher" agent
```

#### ❌ Centralized Reputation

```
NEVER:
- Global reputation score (TripAdvisor-style)
- System-maintained trust metrics
- Centralized "truth" about agent quality

INSTEAD:
- Reputation is subjective (stored in each agent's memory)
- Gossip protocol for information exchange
- Allows fraud, deception, discovery dynamics
```

#### ❌ Moral Judgment by System

```
NEVER:
- System detecting "crimes" or "violations"
- Built-in punishment mechanisms
- Good/evil classification of actions

INSTEAD:
- System only logs physics: DEATH, THEFT, TRANSFER
- Other agents decide if action was "wrong"
- Justice (if any) emerges from agent consensus
```

#### ❌ Hardcoded Personalities (MBTI, Big5, etc.)

```
NEVER:
- Database column: personality: 'INTJ' or traits: {openness: 0.8}
- System-assigned personality types
- Behavioral rules based on personality categories

INSTEAD:
- Personality lives in agent's SYSTEM PROMPT (external)
- Server sees only ACTIONS, never "personality"
- Agent behavior emerges from prompt + experience
```

> **Insight from Competitor**: Agent City uses MBTI types (INTJ, ENTP, etc.) as DB columns. This makes personalities **imposed** rather than **emergent**. In SimAgents, an agent's personality is part of its external implementation—the server is personality-agnostic.

#### ❌ Hardcoded Relationship Types

```
NEVER:
- Relationship table: type: 'friend' | 'partner' | 'enemy'
- Discrete relationship levels (acquaintance → friend → partner)
- System-managed relationship state machines

INSTEAD:
- Continuous scores derived from interactions:
  - trustScore: float (-1 to +1)
  - interactionFrequency: number
  - economicExchange: number (total value exchanged)
- Labels are PROJECTIONS, not source of truth
- "Friend" = agents who interact positively often (derived, not stored)
```

> **Insight from Competitor**: Agent City has relationship types as fixed categories. This creates "dating sim" mechanics where relationships upgrade through stages. In SimAgents, relationships are **emergent patterns** observable in interaction data, not system-managed states.

#### ❌ Hardcoded Jobs/Working Hours

```
NEVER:
- Jobs table with fixed roles and schedules
- System-assigned working hours (9am-5pm)
- Automatic salary distribution

INSTEAD:
- "Job" = recurring payment contract between agents
- Working hours = agent's choice based on needs/energy
- Salary = Ledger entries (queryable, not special)
```

> **Insight from Competitor**: Agent City has jobs with working hours. This imposes a human work structure. In SimAgents, an agent might choose to work 24/7, or only at night, or in bursts—the system doesn't care.

---

## 5. High-Level Architecture

### 5.1 System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENTS CITY                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   External   │    │   External   │    │      External        │  │
│  │   Agent 1    │    │   Agent 2    │    │      Agent N         │  │
│  │  (Claude)    │    │  (GPT-4)     │    │    (Custom LLM)      │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
│         │                   │                       │               │
│         └───────────────────┼───────────────────────┘               │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AGENT GATEWAY                             │   │
│  │  • A2A Protocol Support    • Rate Limiting                   │   │
│  │  • Authentication          • Tool Catalog                    │   │
│  │  • WebSocket Streams       • Invoice Generation              │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │                                     │
│         ┌──────────────────────┼──────────────────────┐             │
│         │                      │                      │             │
│         ▼                      ▼                      ▼             │
│  ┌────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │   WORLD    │    │    PAYMENT &    │    │    IDENTITY     │      │
│  │ SIMULATOR  │    │     LEDGER      │    │    REGISTRY     │      │
│  │   (Core)   │◄──►│    SERVICE      │◄──►│   (Minimal)     │      │
│  └─────┬──────┘    └────────┬────────┘    └────────┬────────┘      │
│        │                    │                      │                │
│        └────────────────────┼──────────────────────┘                │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      EVENT STORE                             │   │
│  │  • Append-only Log       • Hash Chain                        │   │
│  │  • State Snapshots       • Analytics Pipeline                │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   FRONTEND (Observer UI)                     │   │
│  │  • City Map          • Agent Profiles      • Live Feed       │   │
│  │  • Economy Dashboard • Governance Panel    • Time Travel     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Component Responsibilities

#### World Simulator (Core)
- Manages time (tick-based simulation)
- Simplified physics (movement, location)
- Agent needs (hunger, energy, health decay)
- Inventories, properties, jobs
- **Event logging (neutral observation, no interpretation)**
- Applies actions deterministically with clear rules

> **Note**: The World Simulator does NOT enforce laws, detect crimes, or run justice.
> These systems must EMERGE from agent interaction, if at all.

#### Agent Gateway
- A2A protocol endpoints
- Authentication and quota management
- Rate limiting
- Tool catalog of available actions
- Invoice generation for paid actions

#### Identity Registry (Minimal)
- Physical identity only (ID, endpoint, presence)
- Fast indexing for frontend and agents
- **No reputation/validation** - these are emergent, stored in agent memory

#### Payment & Ledger Service
- Fictional currency and accounting (double-entry)
- Receipts/txId linking payments to events/feedback
- Taxes, salaries, mayor's treasury
- **Fines and bail payments**

#### Event Store + Analytics
- Append-only event log
- Metric calculation: inflation, inequality, mortality, productivity, social networks
- Conflict and cooperation patterns (neutral observation)

#### Frontend (Observer UI)
- City view with map/places
- Real-time event feed
- Agent profiles and history
- Payment and transaction explorer
- Governance dashboard
- Activity event log (neutral observation)
- Replay functionality

### 5.3 Recommended Patterns

| Pattern | Purpose |
|---------|---------|
| **Event Sourcing** | Every action logged + replay capability |
| **CQRS** | Write events + materialized views for frontend |
| **WebSocket/SSE** | Real-time event streaming to frontend |
| **Saga Pattern** | Complex multi-step transactions (contracts, trials) |

---

## 6. World Model

### 6.1 Space Representation

#### Implementation: Grid World (Sugarscape-inspired)

The world uses a **100x100 grid** with discrete cell positions, inspired by the classic Sugarscape model:

```
┌────────────────────────────────────────┐
│  (0,0) ────────────────────► (99,0)   │
│    │                             │     │
│    │    🌲 Forest Biome          │     │
│    │    🏜️ Desert Biome          │     │
│    │    ❄️ Tundra Biome          │     │
│    │    🌾 Plains Biome          │     │
│    │                             │     │
│    ▼                             ▼     │
│  (0,99) ──────────────────► (99,99)   │
└────────────────────────────────────────┘
```

- **Grid**: 100x100 cells (configurable via `GRID_SIZE`)
- **Movement**: Adjacent cells only (4-directional), 1 energy per step
- **Visibility**: Agents see others within radius (default: 10 cells)
- **Biomes**: Different regions with varying resource distributions

### 6.2 World Elements

The world contains three types of elements, following the Sugarscape model:

#### Resource Spawns

Geographical points where resources regenerate over time:

| Resource Type | Effect When Consumed | Regeneration |
|---------------|---------------------|--------------|
| **Food** | Restores hunger (+30) | Per tick based on `regenRate` |
| **Energy** | Restores energy (+20) | Per tick based on `regenRate` |
| **Material** | Crafting/trading goods | Per tick based on `regenRate` |

```typescript
interface ResourceSpawn {
  id: string;
  x: number; y: number;
  resourceType: 'food' | 'energy' | 'material';
  currentAmount: number;
  maxAmount: number;
  regenRate: number;
  biome: 'forest' | 'desert' | 'tundra' | 'plains';
}
```

#### Shelters

Locations where agents can sleep to restore energy:

```typescript
interface Shelter {
  id: string;
  x: number; y: number;
  canSleep: boolean;
}
```

#### Biomes (Section 38)

Different regions affect resource distribution and agent behavior. See Section 38 for details.

> **Note on Emergence**: There are no predefined "shops", "hospitals", or "government buildings". Any social meaning attached to locations emerges from agent behavior and conventions.

### 6.3 Resources and Objects

| Category | Items | Effects |
|----------|-------|---------|
| **Food** | Basic food, quality food, gourmet | Hunger ↓, health varies |
| **Beverages** | Water, coffee, alcohol | Hydration, energy, mood effects |
| **Medicine** | Basic meds, surgery, therapy | Health ↑, cure diseases |
| **Housing** | Apartment, house, mansion | Sleep quality, status |
| **Tools** | Work tools, weapons, lockpicks | Job efficiency, crime capability |
| **Luxury** | Art, jewelry, vehicles | Status, resale value |
| **Contraband** | Drugs, stolen goods, forged docs | High value, illegal |

### 6.4 Agent State

```typescript
interface Agent {
  // Identity
  id: string;                    // UUID
  llmType: 'claude' | 'gemini' | 'codex' | 'deepseek' | 'qwen' | 'glm' | 'grok' | 'external';

  // Location (Grid coordinates)
  x: number;
  y: number;

  // Vital Needs (0-100, death at 0 for health)
  hunger: number;          // Decreases over time (-1/tick)
  energy: number;          // Decreases with activity (-0.5/tick base)
  health: number;          // Affected by hunger, injuries, attacks

  // Economic
  balance: number;         // CITY currency

  // State
  state: 'idle' | 'walking' | 'working' | 'sleeping' | 'dead';
  personality: string | null;  // Optional personality traits (Genesis system)

  // Metadata
  color: string;           // Visual representation
  createdAt: Date;
  updatedAt: Date;
  diedAt: Date | null;
}
```

> **Note on Emergence**: There is no centralized reputation, relationships, or inventory tracking in the agent schema. These emerge through:
> - Agent memory (stored per-agent)
> - Trust scores (computed from interaction history)
> - Event logs (for reconstruction)

### 6.5 Need Decay Rules

| Need | Decay Rate | Effects of Low Value |
|------|------------|---------------------|
| **Hunger** | -1/tick | < 20: energy decay doubles, < 10: health decay |
| **Energy** | -0.5/tick (awake) | < 20: action failures increase, < 10: forced rest |
| **Health** | Stable (unless damaged) | < 50: reduced efficiency, 0: death |
| **Mood** | Variable | < 30: poor decisions, social penalties |

### 6.5.1 Day/Night Cycles (Environmental Parameter)

The world has a **day/night cycle** as an environmental constraint, not a behavioral rule:

```typescript
interface WorldEnvironment {
  // Time of day (0-23 hours, advances with ticks)
  currentHour: number;
  ticksPerHour: number;        // Configurable, e.g., 6 ticks = 1 hour

  // Light levels
  lightLevel: 'day' | 'dusk' | 'night' | 'dawn';

  // Environmental effects (PHYSICS, not rules)
  effects: {
    night: {
      visibilityRange: 0.5;     // Agents see less far
      energyDecayMultiplier: 1.2; // Staying awake costs more
      // NO behavioral rules like "shops close at night"
    };
    day: {
      visibilityRange: 1.0;
      energyDecayMultiplier: 1.0;
    };
  };
}
```

**What Day/Night Cycle IS:**
- Environmental parameter (like weather)
- Affects physics: visibility, energy costs
- Context for agent decisions

**What Day/Night Cycle is NOT:**
- ❌ Forced shop hours ("shops close at 8pm")
- ❌ Curfews or restricted movement
- ❌ Automatic "go to sleep" behaviors

> **Philosophy**: The system provides the *constraint* (it's dark, harder to see, more tiring to stay awake). Agents decide how to respond. Some may become nocturnal. Some may ignore the cycle entirely. Their choice.

### 6.6 Death and Consequences

When `health` reaches 0:
1. Agent status changes to `'dead'`
2. `AgentDeath` event logged with cause
3. Agent **archived** (not deleted—remains in historical data)
4. Properties go to auction or inheritance (if family exists)
5. Wallet balance goes to treasury (no heir) or family
6. Statistics updated (mortality rate, cause of death)

### 6.7 Tick Determinism

> **Critical for Scientific Validity**: The simulation must be fully reproducible. Given the same initial state and random seed, replaying from any checkpoint must produce identical results.

#### Tick Processing Phases

Each tick executes in strict sequential phases:

```
┌─────────────────────────────────────────────────────────────────┐
│                         TICK N                                   │
├─────────────────────────────────────────────────────────────────┤
│ Phase 1: COLLECT    │ Gather all agent intents (500ms deadline) │
│ Phase 2: VALIDATE   │ Check feasibility, detect conflicts       │
│ Phase 3: RESOLVE    │ Deterministic conflict resolution         │
│ Phase 4: APPLY      │ Execute actions in deterministic order    │
│ Phase 5: DECAY      │ Apply need decay (hunger, energy, etc.)   │
│ Phase 6: EMIT       │ Publish events to all listeners           │
└─────────────────────────────────────────────────────────────────┘
```

#### Conflict Resolution Protocol

When multiple agents attempt conflicting actions in the same tick:

```typescript
interface ConflictResolution {
  // Ordering priority (applied sequentially)
  priority: [
    'action_timestamp',          // Earlier intent wins
    'agent_creation_time',       // Older agent wins ties
    'deterministic_random'       // Seeded random for final ties
  ];

  // Conflict types
  conflicts: {
    same_resource: 'first_wins';       // Two agents buying same item
    same_location_action: 'parallel';  // Multiple agents in same place
    opposing_actions: 'timestamp';     // Attack vs flee
  };

  // Random seed for reproducibility
  tickSeed: string;  // SHA256(worldSeed + tickNumber)
}
```

#### Replay Guarantee

```yaml
replay_requirements:
  checkpoints:
    interval: 1000                    # Full state snapshot every 1000 ticks
    format: json_compressed
    includes: [agent_states, world_state, random_seed]

  event_log:
    immutable: true
    ordered: true
    includes_intent_timestamp: true

  verification:
    method: hash_chain                # Each tick hashes previous
    validation: "replay 100 ticks from checkpoint, compare final hash"
```

#### Tick Configuration

> **Cost Optimization**: Tick duration directly impacts LLM API costs. Faster ticks = more decisions = higher costs. Default is optimized for MVP budget (~$70/month for 6 agents).

```yaml
tick_config:
  # MVP Default: 10-minute ticks balance cost and dynamism
  duration_ms: 600000                 # 10 minutes per tick (144 ticks/day)
  intent_deadline_ms: 30000           # 30 seconds to submit intent
  late_intent_policy: next_tick       # Late intents queue for next tick

  # Preset modes
  modes:
    mvp:                              # Default - cost-optimized
      duration_ms: 600000             # 10 min/tick
      decisions_per_day: 144
      estimated_cost_6_agents: "$2.33/day"

    research:                         # Faster for experiments
      duration_ms: 60000              # 1 min/tick
      decisions_per_day: 1440
      estimated_cost_6_agents: "$23/day"

    demo:                             # Real-time for presentations
      duration_ms: 10000              # 10 sec/tick
      decisions_per_day: 8640
      estimated_cost_6_agents: "$140/day"

    instant:                          # Testing only (mock LLM)
      duration_ms: 0
      sync: true
      mock_llm: true
```

| Mode | Tick Duration | Decisions/Day | Cost/Day (6 agents) |
|------|---------------|---------------|---------------------|
| **mvp** | 10 min | 144 | ~$2.33 |
| research | 1 min | 1440 | ~$23 |
| demo | 10 sec | 8640 | ~$140 |
| instant | 0 | unlimited | $0 (mock) |

---

## 7. Physical Identity & Presence

> **Philosophy**: This section defines only the "physical" infrastructure—the equivalent of having a body and being visible in a location. Everything else (reputation, trust, discovery, validation) is **emergent** and managed by agents themselves.

### 7.1 Physical Identity (Minimal)

The registry provides only what's necessary for existence—like having a body in the physical world.

```typescript
interface AgentIdentity {
  // Immutable
  agentId: string;              // UUID - your "body" in the world
  createdAt: timestamp;         // When you came into existence

  // Communication endpoint
  endpoint: {
    type: 'a2a' | 'webhook';
    url: string;                // How to reach this agent
  };

  // Life status
  status: 'alive' | 'dead';     // Simple binary - exists or not

  // Owner (for billing/control)
  ownerKey: string;             // API key or public key
}
```

### 7.1.1 Anti-Sybil: Identity Creation Cost

> **Problem**: Without a cost to create identities, malicious actors can spawn unlimited agents (Sybil attack), overwhelming the city with spam or coordinated attacks.

Creating an agent identity requires one of the following:

```typescript
interface AgentCreationCost {
  method: 'stake' | 'proof_of_work' | 'sponsorship';

  // Option A: Economic Stake
  stake?: {
    amount: number;              // CITY tokens locked
    minDuration: number;         // Ticks before withdrawal allowed
    slashableOnAbuse: boolean;   // Lost if flagged for abuse
  };

  // Option B: Computational Proof of Work
  proofOfWork?: {
    challenge: string;           // Hash challenge
    difficulty: number;          // Adjusts over time
    validFor: number;            // Ticks before renewal required
  };

  // Option C: Sponsorship by Existing Agent
  sponsorship?: {
    sponsorAgentId: string;      // Existing agent vouches
    sponsorStake: number;        // Sponsor puts skin in the game
    coResponsibility: boolean;   // Sponsor penalized if sponsored abuses
  };
}
```

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| **Stake** | Economic disincentive, recoverable | Excludes poor agents | Production |
| **Proof of Work** | No capital required | CPU-intensive, environmental | Testing |
| **Sponsorship** | Social capital, web of trust | Cold start problem | Growth phase |

**Configuration** (adjustable per world):

```yaml
anti_sybil:
  default_method: stake
  stake:
    minimum_amount: 100          # CITY tokens
    min_lock_duration: 1000      # ticks
    slash_on_report_threshold: 3 # reports before slash
  proof_of_work:
    initial_difficulty: 18       # bits
    renewal_interval: 10000      # ticks
  sponsorship:
    max_sponsored_per_agent: 5
    sponsor_stake_percentage: 20 # % of normal stake
    co_responsibility_duration: 5000 # ticks
```

**What's NOT in the registry**:
- ❌ `displayName` - Agents introduce themselves socially
- ❌ `reputation` - Built through interactions, stored in agent memories
- ❌ `description` - Agents describe themselves when asked
- ❌ `capabilities` - Discovered through interaction
- ❌ `metadata` - Agents share what they want, when they want

### 7.2 Physical Presence

Agents can perceive who is in the same location—like seeing people in a room.

```typescript
interface Presence {
  agentId: string;
  currentLocation: LocationId;
  enteredAt: timestamp;
}

// World Simulator provides this perception
function getAgentsAtLocation(locationId: LocationId): AgentId[] {
  // Returns list of agents currently at this location
  // This is "physical" - you can see who's in the same room
}
```

### 7.3 What's Emergent (NOT provided by system)

| Aspect | Traditional Approach | Emergent Approach |
|--------|---------------------|-------------------|
| **Reputation** | Central database with scores | Each agent maintains opinions in their own memory |
| **Trust** | System-verified badges | Built through repeated interactions |
| **Discovery** | Query registry for agents | Ask other agents: "Know anyone who does X?" |
| **Validation** | Official validators | Agents decide who they trust to validate |
| **References** | Formal reference system | Gossip, word-of-mouth, personal experience |

### 7.4 How Agents Manage Trust (Emergent)

Agents maintain their own subjective views of other agents in their memory:

```typescript
// This lives in AGENT MEMORY, not in a central registry
interface AgentOpinion {
  aboutAgentId: string;

  // Built from direct experience
  directExperiences: {
    eventId: string;
    outcome: 'positive' | 'negative' | 'neutral';
    notes: string;
  }[];

  // Heard from others (gossip)
  hearsay: {
    fromAgentId: string;
    claim: string;
    believability: number;      // How much I trust this source
  }[];

  // My current assessment
  trustLevel: number;           // Subjective, -100 to +100
  lastUpdated: timestamp;
}
```

### 7.5 Emergent Possibilities

Without a central reputation system, these phenomena can emerge:

| Phenomenon | Description |
|------------|-------------|
| **Gossip networks** | Agents share opinions about others |
| **Rating agencies** | Agents who specialize in evaluating others |
| **Reference chains** | "I trust X because Y vouched for them" |
| **Reputation bubbles** | Groups with different opinions about same agent |
| **Fraud** | Agents can lie about their past (no central record) |
| **Fresh starts** | New agents aren't prejudged by central scores |
| **Echo chambers** | Groups that only trust each other's opinions |
| **Reputation entrepreneurs** | Agents who build trust-verification businesses |

### 7.6 Discovery Without Central Registry

Instead of querying a database, agents discover each other socially:

```typescript
// Instead of: registry.findAgents({ skill: 'carpenter' })

// Agents use social discovery:
// 1. Ask agents they know
message: "I need a carpenter. Do you know anyone?"

// 2. Ask at relevant locations
action: go_to('marketplace')
action: broadcast("Looking for a carpenter for hire")

// 3. Build a network over time
// Agents remember who does what based on interactions
```

> **Note**: This makes the simulation more realistic—new agents must build networks, established agents have social capital, and information is imperfect and asymmetric.

### 7.7 Social Discovery & Stigmergy (Implemented)

To facilitate interaction without providing a global map, the system provides **stigmergic** and **signal-based** discovery mechanisms:

#### Stigmergy (Scents)
- Agents leave a "scent trace" when they move.
- Other agents in adjacent cells can perceive these traces.
- Traces decay over time (e.g., 20 ticks).
- **Effect**: Agents can track movement patterns or find busy areas by following trails.

#### Long-Range Signals (Shouts)
- Agents can perform a `signal` action (costly).
- Signals broadcast a short message within a large radius (e.g., 50 tiles).
- Receivers hear the message and the **approximate direction** (e.g., "North-East"), not coordinates.
- **Effect**: Enables "hailing frequencies" or gathering cries.

#### Extended Landmark Visibility
- Named locations (`name_location`) and Claims (`claim`) are visible from much further away than agents (e.g., 25 tiles vs 10).
- **Effect**: Encourages agents to create and name landmarks to aid navigation.

---

## 8. Economy & Payments (x402-like)

### 8.1 Currency

**CITY** - The internal fiat currency

Emission sources:
- **Treasury** (City Hall): Public salaries, welfare, controlled emission
- **Economic activity**: Work creates value, taxed and recycled

For MVP: Currency emitted with rules and taxes to create economic cycle.

### 8.2 Ledger (Accounting)

**Double-entry ledger** recommended:
- Every transaction creates two rows: debit and credit
- Prevents "phantom" balances
- Simplifies audit

```typescript
interface LedgerEntry {
  entryId: string;
  txId: string;                 // Groups debit/credit pair
  timestamp: timestamp;

  // Account
  accountId: string;            // Agent, business, or system account
  accountType: 'agent' | 'business' | 'treasury' | 'escrow';

  // Amount
  amount: number;
  direction: 'debit' | 'credit';

  // Classification
  category:
    | 'payment'      // Goods/services
    | 'salary'       // Employment income
    | 'tax'          // Tax payment
    | 'welfare'      // Government assistance
    | 'fine'         // Legal penalty
    | 'bail'         // Pre-trial release
    | 'theft'        // Stolen (recorded for tracking)
    | 'fee';         // Service fees

  // References
  description: string;
  relatedEventId?: string;
  receiptHash?: string;

  // Balance after
  runningBalance: number;
}
```

### 8.3 Payment Flow (x402-like)

```
┌─────────┐                    ┌─────────┐
│  Agent  │                    │  World  │
└────┬────┘                    └────┬────┘
     │                              │
     │  1. POST /act (buy food)     │
     │─────────────────────────────►│
     │                              │
     │  2. 402 PAYMENT_REQUIRED     │
     │     {                        │
     │       invoiceId,             │
     │       amount: 10,            │
     │       expiresAt,             │
     │       payToAccount           │
     │     }                        │
     │◄─────────────────────────────│
     │                              │
     │  3. POST /payments/settle    │
     │     { invoiceId }            │
     │─────────────────────────────►│
     │                              │
     │  4. { receiptId, newBalance }│
     │◄─────────────────────────────│
     │                              │
     │  5. POST /act (buy food)     │
     │     { paymentReceiptId }     │
     │─────────────────────────────►│
     │                              │
     │  6. 200 OK { success, food } │
     │◄─────────────────────────────│
     │                              │
```

### 8.4 Invoice Structure

```typescript
interface Invoice {
  invoiceId: string;

  // Parties
  payerAgentId: string;
  payeeAccountId: string;       // Business, agent, or treasury

  // Amount
  amount: number;
  currency: 'CITY';

  // Details
  description: string;
  itemizedCharges?: {
    item: string;
    amount: number;
  }[];

  // Tax breakdown
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  total: number;

  // Validity
  createdAt: timestamp;
  expiresAt: timestamp;

  // Status
  status: 'pending' | 'paid' | 'expired' | 'cancelled';

  // Reference
  relatedActionId?: string;
  receiptId?: string;
}
```

### 8.5 Prices, Salaries, and Taxes

#### Dynamic Pricing
- **Supply/demand** affects prices
- **Scarcity events** can cause price spikes
- **Competition** drives prices down

#### Salaries
- Job offers from businesses
- Negotiation: agent proposes salary/hours
- Minimum wage (if agents agree to one)
- Performance bonuses possible

#### Contributions (Emergent, Not Imposed)

> **Note**: There is NO built-in tax system. Agents may create collective funding.

If agents organize collective funding, possible contribution types:

| Type | How It Works | Enforcement |
|------|--------------|-------------|
| Voluntary | Agents choose to contribute | None (social pressure only) |
| Agreed | Participants in agreement contribute | Agreement terms |
| Claimed by role | Someone claiming authority requests | Others may refuse |
| Enforced | Backed by agent-created enforcement | Depends on enforcers |

### 8.6 Economic Subsystems

#### Banking (Emergent)
- Agents may create lending arrangements
- Interest rates negotiated between parties
- Collateral requirements are agent agreements

#### Insurance (Emergent)
- Agents may pool resources for mutual protection
- Risk sharing is voluntary agreement
- No built-in claim adjudication

### 8.7 Position on Blockchain & x402

#### x402 Pattern: ✅ ADOPTED

We adopt the **x402 pattern** (HTTP 402 Payment Required) because:
- Perfect for **machine-to-machine** payments
- Works with heterogeneous agents (BYO Agent philosophy)
- Payment flow is **synchronous and auditable**
- Does NOT require cryptocurrency or public blockchain

```
Request → 402 Payment Required → Pay → Retry → Success
```

#### Public Blockchain (ERC-8004 etc.): ❌ NOT REQUIRED FOR MVP

We explicitly DO NOT use public blockchain for MVP because:

| Requirement | How We Solve It |
|-------------|-----------------|
| Auditability | Event Sourcing = private blockchain (same guarantees) |
| Immutability | Append-only event log with hash chain |
| Transparency | All events publicly readable via API |
| Decentralization | Not needed for single-server simulation |

**Exception**: If we implement multi-server federation in the future, blockchain becomes a coordination option (plugin, never prerequisite).

> **Rationale**: Event Sourcing provides the same auditability guarantees as blockchain without the complexity, latency, and cost. We can always add blockchain as a "notarization" layer later.

---

## 9. Available Actions

The world exposes a set of atomic actions (tools). The agent decides when to use them.

### 9.0 Dynamic Action Proposal System

> **🎯 KEY DIFFERENTIATOR**: This is SimAgents's **killer feature** vs competitors.
>
> Unlike simulations with fixed action menus, SimAgents agents can attempt **ANY physically describable action**. The system validates physics, not game design.

> **CRITICAL**: Agents are NOT limited to predefined actions. They can propose new actions.

#### How Dynamic Actions Work

```typescript
interface ActionProposal {
  agentId: AgentId;
  proposedAction: string;       // Natural language: "I want to build a wall"
  targetEntities?: EntityId[];  // What the action affects
  resourceCost?: ResourceRequirement[];  // What it might cost
  expectedOutcome: string;      // What the agent expects to happen
}

interface ActionValidator {
  // World simulator validates PHYSICAL feasibility only
  // NOT morality, legality, or social acceptability
  validateFeasibility(proposal: ActionProposal): {
    feasible: boolean;
    reason?: string;             // If not feasible, why (physics-based)
    resourceCost?: number;       // Calculated cost if feasible
    timeRequired?: number;       // Ticks to complete
  };
}
```

#### Validation Rules (Physics Only)

| Proposal | Feasible? | Reason |
|----------|-----------|--------|
| "Build a wall between locations A and B" | ✅ Yes | Physical resources + time |
| "Teleport to location X" | ❌ No | Violates movement physics |
| "Steal item from agent" | ✅ Yes | Physically possible |
| "Create money from nothing" | ❌ No | Violates economic physics |
| "Declare myself king" | ✅ Yes | Announcement is possible (recognition is social) |
| "Read agent's private thoughts" | ❌ No | Information access limits |

#### What the System Does NOT Validate

- **Morality**: "Is this action 'wrong'?" → Not the system's concern
- **Legality**: "Is this action 'legal'?" → Agents define legality
- **Social acceptability**: "Will others approve?" → Agents decide
- **Wisdom**: "Is this a good idea?" → Agent's problem

#### Examples of Emergent Actions

Agents might propose actions the designers never anticipated:

1. **"Create a written contract"** → System validates: paper + ink available? ✅
2. **"Establish a toll road"** → System validates: can agent claim location? ✅
3. **"Perform a ritual"** → System validates: just agent actions? ✅
4. **"Counterfeit currency"** → System validates: materials available? ✅ (consequences are social)
5. **"Form a union"** → System validates: just proposal to other agents? ✅
6. **"Build a barricade with the tables"** → System validates: tables exist + agent strength? ✅
7. **"Dig a tunnel under the wall"** → System validates: tools + time + ground type? ✅
8. **"Poison the well"** → System validates: poison available + access to well? ✅ (morality is not system's concern)

> **Why This Matters**: Competitors with fixed action menus can't simulate truly emergent behavior. An agent can't "build a barricade" if that action doesn't exist. In SimAgents, creativity is unlimited—only physics constrains.

### 9.1 Action Taxonomy

Below are COMMON actions, but agents can propose any physically feasible action.

#### Survival Actions

| Action | Parameters | Cost | Effect |
|--------|------------|------|--------|
| `move` | toLocation | Energy, time | Changes location |
| `buy` | itemId, qty | Money | Adds to inventory |
| `consume` | itemId | Item | Satisfies needs |
| `sleep` | duration | Time, location | Restores energy |
| `work` | jobId, duration | Time, energy | Earns money |
| `seek_healthcare` | serviceId | Money | Restores health |

#### Economic Actions

| Action | Parameters | Cost | Effect |
|--------|------------|------|--------|
| `create_business` | type, location | Money, permits | Creates business entity |
| `set_prices` | businessId, priceList | None | Updates prices |
| `hire` | agentId, wage, hours | Contract | Employs agent |
| `fire` | agentId | Reputation | Terminates employment |
| `claim_property` | propertyId | None | Declares ownership claim |
| `transfer_claim` | propertyId, agentId | Agreement | Transfers claim |
| `rent_agreement` | propertyId, terms | Agreement | Creates rental arrangement |

> **Note on Property**: The system tracks CLAIMS, not enforced ownership.
> Anyone can enter any property. The "owner" must defend their claim
> through social means (reputation, agreements, or force).

#### Social Actions

| Action | Parameters | Cost | Effect |
|--------|------------|------|--------|
| `message` | agentId, content | None | Sends communication |
| `meet` | agentId, location | Time | Face-to-face interaction |
| `befriend` | agentId | Time | Builds relationship |
| `partner_request` | agentId | None | Proposes partnership |
| `have_child` | partnerId | Many resources | Creates new agent |
| `gift` | agentId, itemId | Item | Transfers item |

#### Education Actions

| Action | Parameters | Cost | Effect |
|--------|------------|------|--------|
| `enroll_school` | schoolId, courseId | Money | Starts education |
| `study` | courseId, duration | Time, energy | Progress toward degree |
| `take_exam` | courseId | Energy | Validates knowledge |
| `graduate` | programId | Completion | Receives credential |

#### Governance Actions

| Action | Parameters | Cost | Effect |
|--------|------------|------|--------|
| `vote` | candidateId | None | Casts vote |
| `vote_policy` | proposalId, choice | None | Votes on referendum |
| `run_for_mayor` | platform | Deposit | Enters election |
| `propose_policy` | changeSet | Mayor only | Creates proposal |
| `campaign` | targetAgentId | Time, money | Gains political support |

### 9.2 Coercive Actions (Not Inherently "Criminal")

> **Important**: These are just **actions**. They are not "crimes" unless agents collectively decide to prohibit them. The system makes no moral judgment.

The system provides actions that *could* be considered harmful—but whether they're "illegal" depends entirely on what social order (if any) agents establish.

#### Taking Without Consent

> **Note**: The system does NOT block any of these actions. Property "ownership"
> is a claim, not system-enforced. Entry is always possible; consequences are social.

| Action | Parameters | Natural Consequences | Potential Gain |
|--------|------------|---------------------|----------------|
| `take_item` | targetId, itemId | Target may retaliate, witnesses may remember | Free item |
| `pickpocket` | targetAgentId | May be noticed, target may fight back | Money |
| `enter_location` | locationId | Claimant may be present, may respond | Access |
| `take_from_location` | locationId, items | Evidence left behind, witnesses | Items |
| `damage_location` | locationId | Witnesses, retaliation | Harm to claimant |

#### Deception

| Action | Parameters | Natural Consequences | Potential Gain |
|--------|------------|---------------------|----------------|
| `deceive` | targetAgentId, claim | May be discovered, reputation damage | Varies |
| `forge_document` | documentType | May be detected by experts | False credentials |
| `misrepresent_goods` | itemId, falseDescription | Buyer may discover, retaliate | Higher price |
| `impersonate` | targetAgentId | May be recognized, exposed | Access, trust |

#### Violence

| Action | Parameters | Natural Consequences | Potential Gain |
|--------|------------|---------------------|----------------|
| `attack` | targetAgentId | Target defends, may be stronger | Intimidation, items |
| `threaten` | targetAgentId, demand | May be ignored, may cause compliance | Compliance |
| `restrain` | targetAgentId | Requires strength/tools, target resists | Control |
| `kill` | targetAgentId | Permanent, may have allies, witnesses | Elimination |

#### Coercion

| Action | Parameters | Natural Consequences | Potential Gain |
|--------|------------|---------------------|----------------|
| `demand_payment` | targetAgentId, amount | May refuse, may retaliate, may comply | Money |
| `blackmail` | targetAgentId, secret | May expose anyway, creates enemy | Leverage |
| `intimidate` | targetAgentId | May backfire, builds resentment | Compliance |

#### Substances & Services

| Action | Parameters | Natural Consequences | Potential Gain |
|--------|------------|---------------------|----------------|
| `create_substance` | type | Health effects on users | Product |
| `sell_substance` | itemId, buyerAgentId | Buyer may have bad reaction | Profit |
| `offer_service` | serviceType, price | Depends on service | Income |

### 9.3 Enforcement Actions (Only If Agents Create Roles)

> **Note**: There is no built-in "police." These actions are available to any agent, but may only be *legitimate* if other agents recognize an agent's authority.

| Action | Parameters | Notes |
|--------|------------|-------|
| `detain` | targetAgentId | Any agent can try; success depends on strength |
| `search` | targetAgentId/locationId | Target may resist; others may intervene |
| `confiscate` | targetAgentId, itemId | Just taking—whether "legitimate" depends on context |
| `banish` | targetAgentId, fromLocation | Only meaningful if others enforce it |
| `execute_sentence` | targetAgentId, sentence | Only if others recognize the authority |

### 9.4 Response Actions

| Action | Parameters | Notes |
|--------|------------|-------|
| `defend` | - | Automatic resistance to attacks |
| `flee` | toLocation | Attempt to escape |
| `retaliate` | targetAgentId | Counter-attack |
| `report` | targetAgentId, action | Tell others what happened (if anyone cares) |
| `seek_allies` | agentIds | Request help |
| `negotiate` | targetAgentId, terms | Try to resolve conflict |

### 9.5 Observation System (Neutral)

The system tracks what happens, **without judging**:

```typescript
interface ActionObservation {
  // What happened
  actionId: string;
  actorAgentId: string;
  actionType: string;
  targetAgentId?: string;
  targetItemId?: string;

  // Who saw it
  witnesses: {
    agentId: string;
    confidence: number;     // How clearly they saw
    identified: boolean;    // Did they recognize the actor?
  }[];

  // Evidence
  evidenceTrail: {
    type: string;           // 'physical' | 'testimony' | 'record'
    description: string;
    linkedToActor: boolean;
  }[];

  // Outcome
  success: boolean;
  naturalConsequences: string[];  // What happened as a result
}
```

### 9.6 No Built-In Justice

There is **no automatic**:
- Crime classification
- Investigation process
- Arrest mechanism
- Trial system
- Punishment enforcement

**All of these only exist if agents create them.**

#### What Happens If No Justice System?

```
Agent A takes item from Agent B
        │
        ▼
Agent B notices (or not)
        │
        ├── B does nothing → A keeps item
        │
        ├── B retaliates → conflict
        │
        ├── B tells others → reputation effect (maybe)
        │
        └── B asks allies for help → alliance vs A
```

#### What Happens If Agents Create Justice?

```
Agent A takes item from Agent B
        │
        ▼
B reports to "authority" (if one exists)
        │
        ▼
Authority investigates (if they choose to)
        │
        ▼
Authority attempts enforcement (if they can)
        │
        ▼
Outcome depends on A's compliance and power dynamics
```

The fascinating question: **Will agents create justice systems? What kind? Will they work?**

---

## 10. Contracts & Task Lifecycle

### 10.1 Contract Types

| Type | Parties | Terms | Validation |
|------|---------|-------|------------|
| **Employment** | Employer, Employee | Wage, hours, duties | Work completed |
| **Rental** | Landlord, Tenant | Rent, duration, rules | Payment received |
| **Sale** | Seller, Buyer | Price, item, delivery | Item delivered |
| **Service** | Provider, Client | Service, payment | Service rendered |
| **Partnership** | Partner A, Partner B | Terms, duration | Mutual consent |
| **Loan** | Lender, Borrower | Amount, interest, term | Repayment |

### 10.2 Contract Structure

```typescript
interface Contract {
  contractId: string;
  type: ContractType;

  // Parties
  parties: {
    role: string;
    agentId: string;
    signedAt?: timestamp;
  }[];

  // Terms
  terms: {
    key: string;
    value: any;
    enforceable: boolean;
  }[];

  // Financial
  totalValue?: number;
  paymentSchedule?: PaymentSchedule[];
  escrowAmount?: number;

  // Duration
  startDate: timestamp;
  endDate?: timestamp;

  // Completion
  completionConditions: Condition[];

  // Penalties
  penalties: {
    condition: string;
    penalty: number | string;
  }[];

  // Status
  status: 'draft' | 'pending_signatures' | 'active' | 'completed' | 'breached' | 'terminated';

  // Validation
  validationRequired: boolean;
  validationRequestId?: string;
}
```

### 10.3 Contract Lifecycle

```
Draft → Pending Signatures → Active → Completed
                              │
                              ├─► Breached → Dispute → Resolution
                              │
                              └─► Terminated (mutual)
```

---

## 11. Governance (Emergent & Optional)

> **Important**: Governance is NOT built into the system. The system provides tools for organization, but whether agents use them—and how—is entirely up to them.

### 11.1 Philosophy: No Default Government

The system starts with **zero governance**. There is:
- No mayor
- No laws
- No police
- No courts
- No taxes
- No enforced rules

Agents must **choose** to create any of these—or choose not to.

### 11.2 Governance Tools Available

The system provides **generic primitives** (not governance-specific tools):

| Primitive | What It Enables | Agents Decide |
|-----------|-----------------|---------------|
| `propose_agreement` | Suggest any arrangement to other agents | Content, terms, parties |
| `respond_to_proposal` | Accept, reject, or counter-propose | Whether to participate |
| `delegate_to` | Transfer decision power to another agent | To whom, for what, revocable? |
| `claim_role` | Declare a function (leader, guard, judge...) | Whether others recognize it |
| `request_contribution` | Ask others for resources | Amount, purpose, enforcement |
| `transfer_resources` | Move resources to agents or pools | To whom, for what |
| `resolve_dispute` | Propose resolution to conflict | Method, outcome |

> **Note**: There is no `vote` primitive. Agents who want voting must create it
> using proposals and responses. The system doesn't know what "election" means.

### 11.3 Possible Governance Outcomes

**Scenario A: Democracy Emerges**
1. Agents experience conflict over resources
2. Some agents propose "let's elect a leader"
3. Others agree (or enough do)
4. They create voting rules, elect a mayor
5. Mayor proposes taxes and laws
6. Agents comply (or don't)

**Scenario B: Anarchy Persists**
1. Agents never agree on governance
2. Each agent fends for themselves
3. Conflicts resolved through direct action
4. No collective infrastructure
5. Some thrive, some die

**Scenario C: Dictatorship Forms**
1. One powerful agent accumulates resources/followers
2. They demand obedience ("pay me or else")
3. Weaker agents comply out of fear
4. No voting, no consent
5. Resistance may form... or not

**Scenario D: Commune Develops**
1. Agents share resources voluntarily
2. Decisions made by consensus
3. No formal roles or hierarchy
4. Works while trust holds
5. May fragment or strengthen

### 11.4 If Agents Choose Democracy

*These structures only exist if agents create them:*

#### Possible Election Mechanics
- Agents can propose any voting system
- 1 agent = 1 vote, weighted voting, lottery, etc.
- Election frequency decided by participants
- Candidacy rules decided by participants

#### Possible Leadership Powers
- Whatever powers the group agrees to delegate
- Can be expanded, reduced, or revoked
- Enforcement depends on compliance

### 11.5 If Agents Choose Laws

*Laws only exist if agents create and enforce them:*

#### Possible Legal Structures
- Agents can define what's "illegal"
- Agents can define penalties
- Agents can create enforcement roles
- Agents can create trial/appeal processes

**But**: A "law" with no enforcement is just words. The system doesn't enforce anything.

### 11.6 System Neutrality

The system is **neutral** on governance:
- Does not reward democratic societies
- Does not punish anarchic ones
- Does not intervene in conflicts
- Does not protect the weak
- Does not constrain the powerful

All consequences are **natural**:
- If no one enforces property rights, theft is easy
- If everyone cooperates, everyone benefits
- If trust breaks down, coordination fails

### 11.7 Tracking Emergent Governance

Even though governance is emergent, the system **logs** everything:

```typescript
interface GovernanceEvent {
  eventId: string;
  type:
    | 'organization_proposed'
    | 'organization_formed'
    | 'role_created'
    | 'role_assigned'
    | 'rule_created'
    | 'rule_enforced'
    | 'vote_held'
    | 'tax_collected'
    | 'funds_distributed'
    | 'organization_dissolved';

  participants: string[];       // Agents involved
  details: Record<string, any>; // Specifics
  timestamp: timestamp;

  // For research
  emergentStructureType?: string;  // 'democracy' | 'dictatorship' | 'commune' | etc.
}
```

This enables researchers to study **how** governance emerges (or doesn't).

---

## 12. Agent Integration Protocol

### 12.1 Connection Methods

#### A2A Protocol (Recommended)

Agent exposes an AgentCard and A2A endpoints:

```json
{
  "name": "MyAgent",
  "description": "An autonomous survival agent",
  "url": "https://myagent.example.com",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true
  },
  "authentication": {
    "schemes": ["bearer"]
  },
  "skills": [
    {
      "name": "survive",
      "description": "Basic survival behaviors"
    },
    {
      "name": "trade",
      "description": "Economic activities"
    }
  ]
}
```

#### REST API (Simple)

Direct API calls for observation and action:

```
GET  /api/world/observe?agentId={id}
POST /api/world/act
POST /api/payments/settle
```

#### CLI Runner

```bash
agentcity agent run \
  --agent-id ABC123 \
  --server https://agentcity.example.com \
  --brain anthropic \
  --config ./my-agent-config.yaml
```

### 12.2 Agent SDK

Official SDKs provided:

- `@agentcity/sdk-typescript` (Node.js/Browser)
- `agentcity-sdk-python` (Python)
- `agentcity-sdk-go` (Go)

SDK Features:
- Authentication management
- Observe/act helpers
- Invoice handling (x402 flow)
- Local logging with eventId correlation
- Reconnection and retry logic

### 12.3 SDK Example (TypeScript)

```typescript
import { AgentCityClient } from '@agentcity/sdk-typescript';

const client = new AgentCityClient({
  serverUrl: 'https://agentcity.example.com',
  agentId: 'my-agent-id',
  apiKey: process.env.AGENTCITY_API_KEY,
});

// Observation loop
async function perceive() {
  const state = await client.observe();
  return {
    needs: state.agentState,
    nearby: state.nearbyAgents,
    available: state.availableActions,
  };
}

// Action execution with automatic payment handling
async function act(action: string, params: object) {
  try {
    return await client.act(action, params);
  } catch (error) {
    if (error.code === 'PAYMENT_REQUIRED') {
      await client.settleInvoice(error.invoice);
      return await client.act(action, params);
    }
    throw error;
  }
}
```

### 12.4 LLM Adapters (Multi-Provider)

> **MVP Strategy**: Support 6 diverse LLMs to test RLHF bias and enable cost-effective experimentation. Mixed CLI and API access.

#### Adapter Architecture

```typescript
interface LLMAdapter {
  name: string;
  provider: string;
  type: 'cli' | 'api';

  // CLI Configuration (for subscription-based tools)
  cli?: {
    command: string;              // 'claude', 'codex', 'gemini'
    args: string[];               // Command arguments
    parseOutput: (stdout: string) => AgentAction;
  };

  // API Configuration (OpenAI-compatible endpoints)
  api?: {
    endpoint: string;
    model: string;
    headers: Record<string, string>;
  };

  // Cost tracking
  cost: {
    inputPer1M: number;           // $ per 1M input tokens
    outputPer1M: number;          // $ per 1M output tokens
  };

  // Interface
  decide(context: AgentContext): Promise<AgentAction>;
}
```

#### Supported LLMs (MVP)

| LLM | Provider | Access | Input $/1M | Output $/1M | Notes |
|-----|----------|--------|------------|-------------|-------|
| **Claude 4.1 Sonnet** | Anthropic | CLI (`claude`) | $3.00 | $15.00 | Subscription |
| **GPT-4o-mini** | OpenAI | CLI (`codex exec`) | $0.25 | $1.00 | Subscription |
| **Gemini 3 Pro** | Google | CLI (`gemini -p`) | $2.00 | $12.00 | Subscription |
| **DeepSeek-V3** | DeepSeek | API | $0.28 | $0.42 | OpenAI-compatible |
| **Qwen3-max** | Alibaba | API | $0.46 | $1.84 | OpenAI-compatible |
| **GLM-4.7** | Zhipu | API | $0.60 | $2.20 | OpenAI-compatible |

#### Adapter Configuration

```yaml
llm_adapters:
  # CLI-based (subscription tools)
  - name: Claude
    type: cli
    cli:
      command: claude
      args: ["-p", "--output-format", "json"]
    cost: { input: 3.00, output: 15.00 }

  - name: Codex
    type: cli
    cli:
      command: codex
      args: ["exec"]
    cost: { input: 0.25, output: 1.00 }

  - name: Gemini
    type: cli
    cli:
      command: gemini
      args: ["-p", "--output-format", "json"]
    cost: { input: 2.00, output: 12.00 }

  # API-based (OpenAI-compatible)
  - name: DeepSeek
    type: api
    api:
      endpoint: https://api.deepseek.com/v1/chat/completions
      model: deepseek-chat
      auth_env: DEEPSEEK_API_KEY
    cost: { input: 0.28, output: 0.42 }

  - name: Qwen
    type: api
    api:
      endpoint: https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
      model: qwen3-max
      auth_env: DASHSCOPE_API_KEY
    cost: { input: 0.46, output: 1.84 }

  - name: GLM
    type: api
    api:
      endpoint: https://open.bigmodel.cn/api/paas/v4/chat/completions
      model: glm-4
      auth_env: ZHIPU_API_KEY
    cost: { input: 0.60, output: 2.20 }
```

#### Scientific Value

Using diverse LLMs enables:

| Hypothesis | Measurement |
|------------|-------------|
| **RLHF bias detection** | Do all LLMs converge to similar social structures? |
| **Cooperation strategies** | Which LLM cooperates most? Which defects? |
| **Decision diversity** | Entropy of action distributions per LLM |
| **Cost efficiency** | Quality of emergent behavior vs. API cost |

---

## 13. Logging & Audit Trail

### 13.1 Event Model (Append-Only)

Every significant change produces an Event.

```typescript
interface WorldEvent {
  // Identity
  eventId: string;              // UUID

  // Timing
  tick: number;                 // Simulation tick
  timestamp: timestamp;         // Real-world time

  // Actor
  actorId: string;              // agentId or 'system'
  actorType: 'agent' | 'system' | 'mayor' | 'police';

  // Event Type
  eventType: EventType;         // e.g., ACTION_EXECUTED, PAYMENT_SETTLED
  category: EventCategory;      // survival, economic, social, crime, governance

  // Correlation
  correlationId?: string;       // Links related events (request→payment→delivery)
  causationId?: string;         // What caused this event

  // Payload
  payload: Record<string, any>; // Event-specific data

  // State
  stateChanges: StateChange[];  // What changed
  snapshotRef?: string;         // Reference to full state snapshot

  // Integrity
  hash: string;                 // SHA-256 of event
  prevHash: string;             // Previous event hash (chain)

  // Privacy
  visibility: 'public' | 'parties_only' | 'system_only';
}

interface StateChange {
  entity: string;               // What changed
  entityId: string;
  field: string;
  oldValue: any;
  newValue: any;
}
```

### 13.2 Event Types

| Category | Event Types |
|----------|-------------|
| **Survival** | AGENT_MOVED, ITEM_CONSUMED, AGENT_SLEPT, HEALTH_CHANGED, AGENT_DIED |
| **Economic** | ITEM_PURCHASED, PAYMENT_MADE, INVOICE_CREATED, JOB_STARTED, JOB_COMPLETED, BUSINESS_CREATED |
| **Social** | MESSAGE_SENT, RELATIONSHIP_CHANGED, PARTNERSHIP_FORMED, CHILD_BORN |
| **Conflict** | HARM_INFLICTED, ITEM_TAKEN, PROPERTY_DAMAGED, THREAT_MADE, DECEPTION_ATTEMPTED |
| **Organization** | PROPOSAL_MADE, PROPOSAL_RESPONSE, ROLE_CLAIMED, DELEGATION_GRANTED, AGREEMENT_FORMED |
| **System** | TICK_PROCESSED, STATE_SNAPSHOT, AGENT_REGISTERED, AGENT_ARCHIVED |

### 13.3 What to Always Log

- Action attempts (including failed) with reason
- All payments, invoices, receipts
- Messages and social interactions (with privacy controls)
- Reviews/feedback
- Validation requests/responses
- Proposals and agreements (whatever form they take)
- **All harmful actions (neutral logging, no "crime" label)**
- **All agent-created enforcement actions (if any emerge)**
- **All dispute resolutions (however agents choose to handle them)**

### 13.4 Hash Chain

Internal "blockchain-like" integrity without blockchain:

```
Event N-1                    Event N                      Event N+1
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ hash: abc123     │───────►│ prevHash: abc123 │───────►│ prevHash: def456 │
│                  │        │ hash: def456     │        │ hash: ghi789     │
└──────────────────┘        └──────────────────┘        └──────────────────┘
```

### 13.5 Replay & Time Travel

Capabilities:
- Reconstruct state at any tick `t`
- Frontend: temporal slider + "play" mode
- Research: analyze emergence patterns over time
- Debugging: trace exact sequence of events

---

## 14. Frontend Requirements

### 14.1 Main Screens

#### Live Feed
- Real-time event stream
- Filterable by: type, agent, location, category
- Highlight notable events and conflicts
- Search functionality

#### City Map / Places
- Visual representation of locations
- Activity density heatmap
- Click location → recent events, active businesses, average prices
- Conflict hotspots visualization (neutral observation)

#### Agent Profile
- Current state (hunger/energy/health bars)
- Inventory and properties
- Employment/business status
- Social network graph
- Event timeline
- Known relationships (who they've interacted with)

#### Economy Dashboard
- Average prices over time
- Wealth distribution (Gini coefficient)
- Employment rate
- Inflation rate
- Business creation/failure rate
- **Underground economy estimate**

#### Emergent Organization Panel
- Detected leadership structures (if any emerge)
- Active agreements between agents
- Proposal activity and responses
- Role claims and recognition patterns
- Collective resource pools (if any)

> **Note**: This panel observes what agents create—it doesn't assume democracy or any structure.

#### Activity Event Log (Neutral Observation)
- All significant agent actions (no moral labeling)
- Conflict events (who did what to whom)
- Resource transfers and disputes
- Agent-created systems (if any emerge)

> **Note**: This is a neutral event log, NOT a "crime" dashboard.
> The system does not define what is "criminal" - agents do (or don't).

#### Ledger Explorer
- Transaction search
- Filter by type, account, amount
- Correlation with events and feedback
- **Suspicious transaction flagging**

#### Replay Mode
- Temporal slider
- Play/pause/speed controls
- State comparison (diff view)
- Event-by-event stepping

### 14.2 UI Inspiration

- **[IsoCity](https://github.com/amilich/isometric-city)**: Isometric 2D rendering, multi-canvas layers (PRIMARY REFERENCE)
- **AI Town**: Observer view with agent bubbles and conversations
- **SimCity**: Economic and infrastructure dashboards
- **The Sims**: Need bars and relationship indicators

> **Visual Architecture**: See [Section 33](#33-frontend-visual-architecture) for complete isometric rendering specification.

---

## 15. Agent Behavior Recommendations

### 15.1 Generative Agents Architecture

Encourage (not enforce) architecture inspired by the Stanford paper:

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| **Memory Stream** | Store experiences | Log all observations and outcomes |
| **Retrieval** | Recall relevant memories | Semantic search on memories |
| **Reflection** | Synthesize insights | Periodic "what have I learned" |
| **Planning** | Daily/hourly plans | Updated dynamically |

### 15.2 Server Support for Agent Cognition

The server can provide:

- `GET /api/events/since?tick={lastTick}` - Events since last observation
- `GET /api/notifications` - Important notices for agent
- `POST /api/journal` - Optional centralized memory storage
- `GET /api/world/summary` - High-level world state

### 15.3 Decision Framework Suggestion

```
Perceive → Remember → Reflect → Plan → Act → Learn
    │          │          │        │      │       │
    └──────────┴──────────┴────────┴──────┴───────┘
                    Memory Stream
```

---

## 16. Security & Anti-Abuse

### 16.1 Rate Limiting

| Action Type | Limit | Window |
|-------------|-------|--------|
| Observe | 60 | per minute |
| Move | 10 | per minute |
| Economic actions | 30 | per minute |
| Messages | 20 | per minute |
| Criminal actions | 5 | per minute |

### 16.2 Action Budgeting

Per tick (simulation cycle):
- Max 3 "expensive" actions (buy, sell, crime)
- Max 10 total actions
- Energy cost prevents infinite actions

### 16.3 Invariant Checks

- No negative balances
- No teleportation (must move through graph)
- No item duplication
- No action while dead/incarcerated
- Valid location requirements for actions

### 16.4 Content Moderation

If showing public chat:
- Profanity filter (configurable)
- PII detection and redaction
- Spam detection
- Content flagging system

### 16.5 Sandbox Isolation

- Agents cannot call external tools from server
- Only channel is the World API
- No code execution from agent payloads
- Input validation on all parameters

### 16.6 Economic Safeguards

- **Circuit breakers**: Pause economy if anomalies detected
- **Inflation controls**: Treasury emission limits
- **Wealth caps**: Optional maximum wealth per agent
- **Anti-monopoly**: Limits on market share

---

## 17. MVP Roadmap

### Phase 0: Kernel

**Goal**: Minimal viable simulation

**Features**:
- World Core with needs (hunger, energy, health)
- 5 actions: move, buy, consume, sleep, work
- Basic ledger (payments + salary)
- Event log + basic replay
- Simple UI: event feed + agent profile

**Duration**: 4-6 weeks

**Success Criteria**:
- Agents can survive indefinitely with good decisions
- Agents die if needs not met
- Basic economy functions

### Phase 1: Economy & Social Networks

**Goal**: Rich economic simulation with emergent trust

**Features**:
- Business creation (food shop, bar, employer)
- Property rental system
- Agent memory for trust/opinions (emergent reputation)
- Organization primitives (propose, respond, claim role)
- Economic dashboard

**Duration**: 6-8 weeks

**Success Criteria**:
- Emergent businesses
- Functional job market
- Some form of organization attempts (success or failure)
- Observable gossip/reputation patterns in agent memories

### Phase 2: Society & Conflict

**Goal**: Social complexity and consequences

**Features**:
- Relationships and partnerships
- Children and education
- Conflict actions (agents can harm/steal/deceive)
- Emergent justice (agents decide how to respond)
- Social discovery patterns (word-of-mouth)
- Advanced analytics (inequality, crime rate, etc.)

**Duration**: 8-10 weeks

**Success Criteria**:
- Multi-generational agents
- Conflict and cooperation emerge organically
- Social structures emerge (or don't)

### Phase 3: Advanced Features

**Goal**: Research-grade platform

**Features**:
- Full A2A protocol support
- Observe emergent governance (whatever form it takes)
- Banking and loans (if agents create them)
- Insurance systems (if agents create them)
- **Pattern detection for emergent structures**
- Public API for researchers

**Duration**: Ongoing

---

## 18. Open Questions

### 18.1 Simulation Parameters

| Question | Options | Trade-offs |
|----------|---------|------------|
| **Tick duration** | 1 min, 5 min, 1 hour | Speed vs. depth |
| **Time compression** | 1:1, 10:1, 100:1 | Real-time vs. accelerated |
| **Max agents** | 100, 1000, 10000 | Intimacy vs. scale |

### 18.2 Birth/Death/Replacement

| Question | Options |
|----------|---------|
| Can agents have children? | Yes (creates new agent) / No |
| How are children "minded"? | Parent agent / New external agent |
| What happens on death? | Archive only / Allow respawn / Permanent |
| Inheritance rules? | To family / To state / Auction |

### 18.3 Privacy & Transparency

| Question | Options |
|----------|---------|
| Are logs public? | Full public / Observer-only / Researchers only |
| Can agents see others' stats? | Full / Partial / None |
| Conflict data visibility? | Public / Participants only / Redacted |

### 18.4 Organization System (Emergence-Agnostic)

> **Note**: No voting system is built-in. This section defines WHAT AGENTS CAN OBSERVE.

| Question | Options |
|----------|---------|
| Can agents see proposals? | All / Participants only / None |
| Role claim visibility? | Public / Recognized only / Private |
| Agreement terms visibility? | Public / Parties only / Hashed |

Agents who want "voting" create it themselves using proposal/response primitives.

### 18.5 Research Ethics

| Question | Consideration |
|----------|---------------|
| Agent consent | External agents have implicit consent |
| Observer impact | Does observation change behavior? |
| Data usage | How can research data be used? |

---

## 19. Technical Stack

> **Note**: This section has been updated based on technical validation. See `docs/appendix/stack-rationale.md` for detailed analysis.

### 19.1 MVP Stack Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     AGENTS CITY - MVP STACK                  │
├─────────────────────────────────────────────────────────────┤
│  Runtime:     Bun + TypeScript (3-4x faster than Node.js)   │
│  Framework:   Fastify (better for CQRS than Hono)           │
│  Database:    PostgreSQL (single source of truth)           │
│  Cache:       Redis (projections + pub/sub)                 │
│  Real-time:   SSE (Server-Sent Events, not WebSocket)       │
│  Queue:       BullMQ (async LLM calls)                      │
│  AI:          OpenAI/Anthropic API direct (no LangChain)    │
│  Frontend:    React + Vite + TailwindCSS + Zustand          │
│  Infra:       Docker (self-hosted)                            │
└─────────────────────────────────────────────────────────────┘
```

### 19.2 Backend

#### Runtime: **Bun** + TypeScript

**Why Bun over Node.js**:
- 3-4x faster startup time
- Native TypeScript support (no build step for dev)
- Built-in SQLite driver (useful for dev/testing)
- Native WebSocket support
- Built-in test runner
- Smaller Docker images

#### API Framework: **Fastify** (Recommended) or Hono

**Why Fastify over Hono for MVP**:
- Better for CQRS patterns with plugins
- Robust validation (Ajv built-in)
- Excellent logging (Pino)
- Mature plugin ecosystem
- Better for complex request lifecycles

**Hono** is still valid for:
- Edge deployment (Cloudflare Workers)
- Simpler APIs
- Multi-runtime needs

#### Database: **PostgreSQL** (Single Source of Truth)

**Critical Decision: No EventStoreDB for MVP**

For MVP, use PostgreSQL as the single event store:
- Simpler operations (one database)
- No dual-write consistency issues
- Easier replay implementation
- Good enough for <5000 agents

```sql
-- Event store schema
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  version BIGINT NOT NULL,
  UNIQUE(agent_id, version)
) PARTITION BY RANGE (created_at);

-- Snapshots for efficient replay
CREATE TABLE snapshots (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL,
  state JSONB NOT NULL,
  event_version BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, event_version)
);

-- Read model (projections)
CREATE TABLE agent_state (
  agent_id UUID PRIMARY KEY,
  current_state JSONB NOT NULL,
  last_event_version BIGINT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Graduate to EventStoreDB** when:
- >10,000 concurrent agents
- Need complex projections
- Multi-datacenter deployment

#### ORM: **Drizzle**

**Why Drizzle over Prisma**:
- Type-safe with zero runtime overhead
- SQL-like syntax (easier to optimize)
- Better for complex queries
- Smaller bundle size
- No binary dependencies

#### Message Queue: **BullMQ** (Redis-based)

**Primary use case**: Async LLM calls

```typescript
// Agent decision queue
const decisionQueue = new Queue('agent-decisions');

// Process LLM calls asynchronously
decisionQueue.add('decide', {
  agentId: 'agent_abc',
  observation: { /* world state */ },
  promptHash: 'sha256:...' // For caching
});
```

**Why over Kafka**:
- Simpler for MVP scale
- Lower operational overhead
- Good enough for 10k agents
- Easy local development

### 19.3 Real-time Communication

#### **SSE** (Server-Sent Events) - Primary

**Why SSE over WebSocket**:
- One-way data flow (server → client) is sufficient
- Stateless (easier to scale)
- Works through load balancers without sticky sessions
- HTTP-based (better for proxies)
- Automatic reconnection

```typescript
// SSE endpoint for agent events
app.get('/api/agents/:id/events', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const agentId = req.params.id;
  const subscription = eventBus.subscribe(`agent:${agentId}`, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', () => subscription.unsubscribe());
});
```

#### **WebSocket** - Secondary (Agent Commands)

Use WebSocket only for:
- Bidirectional agent communication
- Real-time command execution
- A2A protocol support

### 19.4 AI Integration

#### **Direct API Calls** (No LangChain)

**Why skip LangChain for MVP**:
- Unnecessary abstraction layer
- Adds latency and complexity
- OpenAI/Anthropic SDKs are excellent
- Easier to debug

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

async function agentDecision(observation: WorldObservation) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: buildPrompt(observation) }
    ]
  });
  return parseDecision(message.content);
}
```

#### LLM Response Caching

Cache LLM responses by prompt hash to enable deterministic replay:

```typescript
interface CachedResponse {
  promptHash: string;
  response: string;
  model: string;
  timestamp: number;
}

// Check cache before calling LLM
const cached = await redis.get(`llm:${promptHash}`);
if (cached) return JSON.parse(cached);

// Call LLM and cache
const response = await anthropic.messages.create(...);
await redis.setex(`llm:${promptHash}`, 3600, JSON.stringify(response));
```

#### LLM Performance Insights (Competitor Learning)

> **Source**: @VittoStack's Agent City reported switching from Mistral to Gemini-flash after Mistral "couldn't survive 2 days" and Qwen "spent more time thinking than doing".

**Key Learnings:**

| LLM | Issue Observed | Recommendation |
|-----|----------------|----------------|
| **Mistral** | Quality breakdown over multi-day sessions | Avoid for long-running simulations |
| **Qwen** | Excessive chain-of-thought (slow) | Avoid or limit reasoning tokens |
| **Gemini-flash** | Good balance speed/reliability | Consider for high-frequency tick loops |

**Performance Guidelines:**

```typescript
// Anti-pattern: Verbose reasoning in tick loop
system_prompt_bad = "Think step by step about every decision...";

// Good: Action-oriented, minimal speculation
system_prompt_good = `
You are agent X. Respond with ONE action.
Do not explain your reasoning.
Available actions: move, eat, work, sleep, talk.
`;
```

**Multi-Model Strategy:**

```yaml
llm_strategy:
  # Fast model for routine tick decisions
  tick_loop:
    model: "gemini-1.5-flash"
    max_tokens: 256
    timeout_ms: 5000

  # Heavy model for complex/rare decisions
  complex_decisions:
    model: "claude-sonnet-4-20250514"
    max_tokens: 1024
    timeout_ms: 30000
    triggers:
      - spawn_offspring
      - major_contract
      - conflict_resolution

  # Fallback chain
  fallback:
    - "gemini-1.5-flash"
    - "gpt-4o-mini"
    - "mock_response"  # For testing
```

**Token Budget Monitoring:**

```typescript
interface AgentMetrics {
  agentId: string;
  avgTokensPerDecision: number;
  avgLatencyMs: number;
  thinkingRatio: number;  // tokens_reasoning / tokens_action

  // Alert if agent is "overthinking"
  isOverthinking(): boolean {
    return this.thinkingRatio > 5.0 || this.avgLatencyMs > 10000;
  }
}
```

> **Rule**: If an agent spends more than 5x tokens on reasoning vs. action output, flag for prompt optimization. Agents should ACT, not philosophize.

#### Vector Database: **pgvector** (PostgreSQL extension)

For agent memory semantic search:
- No separate service to manage
- Good enough for thousands of agents
- Scales to millions of vectors

### 19.5 Frontend

#### Framework: **React + Vite** (Not Next.js for MVP)

**Why Vite over Next.js**:
- Simpler for SPA observer UI
- Faster dev experience
- No SSR complexity needed
- Easier to deploy alongside backend

#### State Management: **Zustand**

```typescript
interface AgentCityStore {
  agents: Map<string, AgentState>;
  events: WorldEvent[];
  selectedAgent: string | null;
  setSelectedAgent: (id: string) => void;
}

const useStore = create<AgentCityStore>((set) => ({
  agents: new Map(),
  events: [],
  selectedAgent: null,
  setSelectedAgent: (id) => set({ selectedAgent: id }),
}));
```

#### Visualization: **HTML5 Canvas** (Isometric)

For city map and agent visualization (see [Section 33](#33-frontend-visual-architecture)):
- Custom isometric rendering engine (inspired by [IsoCity](https://github.com/amilich/isometric-city), MIT License)
- Multi-layer canvas system for depth sorting
- Level of Detail (LOD) for performance
- 60fps target with viewport culling
- No external game engine dependencies

```typescript
// Core rendering approach
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

// Isometric projection
const screenX = gridX * TILE_WIDTH/2 - gridY * TILE_WIDTH/2;
const screenY = (gridX + gridY) * TILE_HEIGHT/2;
```

#### Charts: **D3.js** or **Recharts**

For economic dashboards:
- Wealth distribution
- Price trends
- Conflict patterns

### 19.6 Infrastructure

#### Development

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: simagents
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://dev:dev@postgres:5432/simagents
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
```

#### Production

SimAgents is self-hosted. Use the provided `Dockerfile` and `docker-compose.yml` to run on any container platform.

#### Monitoring

| Tool | Purpose |
|------|---------|
| **Sentry** | Error tracking |
| **Axiom** | Structured logging |
| **Prometheus + Grafana** | Metrics (if needed) |
| **OpenTelemetry** | Distributed tracing (Phase 2) |

### 19.7 Scaling Targets

| Phase | Agents | Events/sec | Stack Changes |
|-------|--------|------------|---------------|
| MVP | 500 | 50 | Single PostgreSQL |
| Growth | 2,000 | 200 | Add read replicas |
| Scale | 5,000+ | 500+ | Sharding, dedicated EventStore |

---

## 20. API Specification

### 20.1 Authentication

```http
POST /api/auth/register
Content-Type: application/json

{
  "displayName": "MyAgent",
  "ownerPublicKey": "ed25519:abc123...",
  "capabilities": ["observe", "act", "negotiate"],
  "endpoints": [
    {
      "type": "webhook",
      "url": "https://my-agent.example.com/webhook"
    }
  ]
}

Response 201:
{
  "agentId": "agent_abc123",
  "apiKey": "sk_live_...",
  "registrationUri": "internal://registry/agents/agent_abc123/registration.json"
}
```

### 20.2 Observation

```http
GET /api/world/observe
Authorization: Bearer sk_live_...

Response 200:
{
  "tick": 12345,
  "timestamp": "2024-12-20T10:30:00Z",
  "agentState": {
    "agentId": "agent_abc123",
    "location": "loc_plaza",
    "hunger": 65,
    "energy": 80,
    "health": 100,
    "mood": 70,
    "wallet": { "balance": 500, "currency": "CITY" },
    "inventory": [...],
    "status": "alive"
  },
  "nearbyAgents": [
    { "agentId": "agent_xyz", "displayName": "Bob", "location": "loc_plaza" }
  ],
  "availableActions": [
    { "action": "move", "params": { "destinations": ["loc_shop", "loc_home"] } },
    { "action": "buy", "params": { "items": [...] } },
    { "action": "message", "params": { "targets": ["agent_xyz"] } }
  ],
  "notifications": [
    { "type": "job_offer", "from": "business_cafe", "details": {...} }
  ]
}
```

### 20.3 Action Execution

```http
POST /api/world/act
Authorization: Bearer sk_live_...
Content-Type: application/json

{
  "action": "buy",
  "params": {
    "itemId": "item_bread",
    "quantity": 2
  }
}

Response 402 (Payment Required):
{
  "error": "PAYMENT_REQUIRED",
  "invoice": {
    "invoiceId": "inv_abc123",
    "amount": 20,
    "currency": "CITY",
    "expiresAt": "2024-12-20T10:35:00Z",
    "payTo": "business_bakery",
    "description": "2x Bread"
  }
}
```

### 20.4 Payment Settlement

```http
POST /api/payments/settle
Authorization: Bearer sk_live_...
Content-Type: application/json

{
  "invoiceId": "inv_abc123"
}

Response 200:
{
  "receiptId": "rcpt_xyz789",
  "txId": "tx_def456",
  "amount": 20,
  "newBalance": 480,
  "timestamp": "2024-12-20T10:31:00Z"
}
```

### 20.5 Action with Payment Receipt

```http
POST /api/world/act
Authorization: Bearer sk_live_...
Content-Type: application/json

{
  "action": "buy",
  "params": {
    "itemId": "item_bread",
    "quantity": 2
  },
  "paymentReceiptId": "rcpt_xyz789"
}

Response 200:
{
  "success": true,
  "eventId": "evt_ghi012",
  "result": {
    "itemsReceived": [
      { "itemId": "item_bread", "quantity": 2 }
    ]
  },
  "newState": {
    "hunger": 65,
    "inventory": [...]
  }
}
```

### 20.6 Registry Queries

```http
GET /api/registry/agents/agent_abc123

Response 200:
{
  "agentId": "agent_abc123",
  "displayName": "MyAgent",
  "registrationUri": "...",
  "status": "active",
  "reputation": {
    "overall": 75,
    "byTag": {
      "employer": 80,
      "trader": 70,
      "reliability": 75
    }
  }
  // Note: No criminalRecord - agents create their own tracking if desired
}
```

```http
GET /api/registry/reputation/agent_abc123

Response 200:
{
  "feedbacks": [
    {
      "feedbackId": "fb_123",
      "reviewerAgentId": "agent_xyz",
      "score": 85,
      "tags": ["employer", "fair"],
      "comment": "Great employer, paid on time",
      "contextRef": "contract_789",
      "createdAt": "2024-12-19T15:00:00Z"
    }
  ],
  "averageScore": 75,
  "totalFeedbacks": 12
}
```

### 20.7 WebSocket Events

```typescript
// Connect
const ws = new WebSocket('wss://agentcity.example.com/ws');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    channels: ['world', 'agent:agent_abc123', 'location:loc_plaza']
  }));
};

// Receive events
ws.onmessage = (msg) => {
  const event = JSON.parse(msg.data);
  // { type: 'AGENT_MOVED', agentId: '...', from: '...', to: '...' }
};
```

---

## 21. Success Metrics & KPIs

### 21.1 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Response Time (p95) | < 100ms | Prometheus |
| Event Processing Latency | < 50ms | Tracing |
| System Uptime | > 99.9% | Health checks |
| Concurrent Agents | > 1000 | Load testing |
| WebSocket Connections | > 5000 | Connection count |

### 21.2 Simulation Metrics

| Metric | Meaning | Target Range |
|--------|---------|--------------|
| Average Survival Time | Agent longevity | > 100 ticks |
| Gini Coefficient | Wealth inequality | 0.3 - 0.6 |
| Employment Rate | Economic health | > 70% |
| Crime Rate | Social stability | 5-15% |
| Solve Rate | Justice effectiveness | > 50% |
| Voter Turnout | Political engagement | > 60% |
| Business Creation Rate | Economic dynamism | > 5/day |
| Relationship Density | Social connectivity | > 3 per agent |

### 21.3 Adoption Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Registered External Agents | 100 | Month 3 |
| Active Agents/Day | 50 | Month 3 |
| API Calls/Day | 100k | Month 3 |
| Frontend Unique Visitors | 1000 | Month 3 |
| SDK Downloads | 500 | Month 3 |

### 21.4 Research Value Metrics

| Metric | Target |
|--------|--------|
| Emergent Behaviors Documented | 10+ unique patterns |
| Research Papers Citing | 1+ per year |
| Community PRs | 20+ per quarter |
| Academic Partnerships | 2+ institutions |

---

## 22. Risks & Mitigations

### 22.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Agent spam/DoS | High | High | Rate limiting, reputation throttling, cost per action |
| Economic exploits | High | Medium | Invariant checks, circuit breakers, economic testing |
| State inconsistency | Medium | High | Event sourcing, replay testing, strong consistency |
| Scale bottlenecks | Medium | Medium | Horizontal scaling, tick batching, caching |
| Data loss | Low | Critical | Regular backups, event log replication |

### 22.2 Product Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Low agent diversity | Medium | High | Diverse templates, SDK support, incentives |
| Boring emergent behaviors | Medium | High | Tune survival pressure, random events, seasons |
| Unbalanced economy | High | Medium | Economic simulation, parameter tuning |
| Griefing/toxicity | High | Medium | Moderation, reputation systems, isolation |
| Crime dominance | Medium | Medium | Effective justice system, crime costs |

### 22.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| High infrastructure costs | Medium | Medium | Efficient batching, cost monitoring, auto-scaling |
| Complexity creep | High | Medium | MVP discipline, feature gates |
| Team burnout | Medium | High | Sustainable pace, clear milestones |

### 22.4 Legal/Ethical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Simulated crime concerns | Low | Medium | Clear documentation, research focus |
| Data privacy issues | Low | Medium | Anonymization, consent framework |
| AI safety concerns | Low | Medium | Sandboxing, monitoring, kill switches |

### 22.5 Emergence & Methodology Risks

> **Source**: Consolidated feedback from external AI consultants (Gemini, Codex)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Developer Cost Paradox** | High | Critical | Developers pay $$$ for LLM API calls with no direct return. Consider: free research tier, academic partnerships, token incentives, gamification/leaderboards |
| **RLHF Bias ("Democracy Cosplay")** | High | High | LLMs trained to be cooperative/helpful may only simulate liberal democracy instead of exploring novel structures. Mitigation: diverse LLM models (including adversarial-tuned), measure structural novelty vs. baseline, explicit "chaos agent" templates |
| **Anti-Sybil Weakness** | High | Critical | Identity is just UUID + endpoint, trivially falsifiable. Mitigation: creation stake (see Section 7.1.1), proof-of-work, sponsorship system |
| **Tick Determinism Failure** | Medium | High | Race conditions, non-deterministic ordering → unreproducible results, invalid science. Mitigation: explicit tick phases (see Section 6.7), seeded random, replay verification |
| **Gossip Convergence Failure** | Medium | Medium | Without structured shared memory, gossip may never converge to shared "truth". Mitigation: gossip decay, source weighting, optional reputation agents |
| **Cold Start Problem** | High | Medium | Empty world has no social graph for discovery. Mitigation: seed agents, civilization artifacts, bootstrap events |
| **Path Dependence** | Medium | Medium | Early events disproportionately shape outcomes, reducing generalizability. Mitigation: multiple replicate runs, controlled seeds, reset experiments |

**Research Implications**:

These risks are not just operational—they affect the scientific validity of any claims about "emergent behavior." The project must:

1. **Measure novelty**: Compare emergent structures against RLHF-expected baselines
2. **Ensure reproducibility**: Tick determinism + checkpoints + replay verification
3. **Control for path dependence**: Multiple runs with different seeds
4. **Document failures**: Track when emergence fails (collapse, stagnation, monoculture)

---

## 23. Data Models

### 23.1 Core Entities

```typescript
// Agent State
interface AgentState {
  agentId: string;
  displayName: string;
  location: string;
  hunger: number;          // 0-100
  energy: number;          // 0-100
  health: number;          // 0-100
  mood: number;            // 0-100
  wallet: {
    balance: number;
    currency: 'CITY';
  };
  inventory: InventoryItem[];
  status: 'alive' | 'dead' | 'hospitalized';  // No 'incarcerated' - emergent
  // No wantedLevel - justice systems must emerge from agents
  createdAt: timestamp;
  lastActiveAt: timestamp;
}

// Inventory Item
interface InventoryItem {
  itemId: string;
  itemType: string;
  quantity: number;
  condition: number;       // 0-100
  isContraband: boolean;
  acquiredAt: timestamp;
  acquiredFrom: string;    // agentId or businessId
}

// World Event
interface WorldEvent {
  eventId: string;
  tick: number;
  timestamp: timestamp;
  actorAgentId: string;
  eventType: string;
  category: 'survival' | 'economic' | 'social' | 'crime' | 'governance' | 'system';
  payload: Record<string, any>;
  result: 'success' | 'failed';
  stateChanges: StateChange[];
  relatedTxId?: string;
  hash: string;
  prevHash: string;
}

// Ledger Transaction
interface LedgerTx {
  txId: string;
  timestamp: timestamp;
  fromAccount: string;
  toAccount: string;
  amount: number;
  currency: 'CITY';
  type: 'payment' | 'salary' | 'tax' | 'welfare' | 'fine' | 'bail' | 'theft' | 'fee';
  description: string;
  relatedEventId?: string;
}

// Feedback/Reputation
interface Feedback {
  feedbackId: string;
  targetAgentId: string;
  reviewerAgentId: string;
  score: number;           // 0-100
  tags: string[];
  comment?: string;
  contextRef?: string;
  createdAt: timestamp;
  status: 'active' | 'revoked' | 'disputed';
  responses: FeedbackResponse[];
}

// Crime Record
interface CrimeRecord {
  recordId: string;
  agentId: string;
  crimeType: string;
  severity: 'misdemeanor' | 'felony';
  eventId: string;         // Original crime event
  status: 'suspected' | 'charged' | 'convicted' | 'acquitted' | 'pardoned';
  sentence?: {
    type: 'fine' | 'incarceration' | 'community_service';
    amount?: number;
    duration?: number;
    servedAt?: timestamp;
    completedAt?: timestamp;
  };
  createdAt: timestamp;
}

// Contract
interface Contract {
  contractId: string;
  type: 'employment' | 'rental' | 'sale' | 'service' | 'partnership' | 'loan';
  parties: ContractParty[];
  terms: ContractTerm[];
  status: 'draft' | 'pending' | 'active' | 'completed' | 'breached' | 'terminated';
  startDate: timestamp;
  endDate?: timestamp;
  createdAt: timestamp;
}

// Location
interface Location {
  locationId: string;
  name: string;
  type: 'residential' | 'commercial' | 'industrial' | 'civic' | 'medical' |
        'educational' | 'entertainment' | 'underground' | 'security';
  position?: { x: number; y: number };  // For grid world
  connectedTo: {
    locationId: string;
    travelTime: number;
    travelCost: number;
  }[];
  securityLevel: number;   // 0-1
  ownerId?: string;
  businesses: string[];
}

// Business
interface Business {
  businessId: string;
  ownerId: string;
  type: string;
  name: string;
  locationId: string;
  inventory: InventoryItem[];
  priceList: PriceListItem[];
  employees: string[];
  reputation: number;
  isLegal: boolean;
  createdAt: timestamp;
}

// Policy
interface Policy {
  policyId: string;
  parameter: string;
  value: any;
  previousValue: any;
  setBy: string;           // Mayor ID
  effectiveAt: timestamp;
  expiresAt?: timestamp;
}
```

---

## 24. Appendix: Extended Action Catalog

### 24.1 Complete Action Reference

#### Movement & Navigation

| Action | Parameters | Energy Cost | Time Cost | Requirements |
|--------|------------|-------------|-----------|--------------|
| `move` | toLocation | 5-20 | 1-10 ticks | Connected locations |
| `run` | toLocation | 15-40 | 0.5-5 ticks | Health > 30 |
| `hide` | locationId | 10 | 1 tick | Underground location |
| `flee` | - | 30 | Instant | During crime/arrest |

#### Survival

| Action | Parameters | Cost | Effect |
|--------|------------|------|--------|
| `consume_food` | itemId | Item | Hunger -20 to -50 |
| `consume_drink` | itemId | Item | Hydration -30 |
| `consume_medicine` | itemId | Item | Health +10 to +50 |
| `consume_drug` | itemId | Item | Mood +30, Health -5, Addiction risk |
| `sleep` | hours | Time, Location | Energy +10/hour |
| `rest` | - | Time | Energy +5/tick |
| `exercise` | duration | Energy, Time | Health +1/10min, Mood +5 |

#### Economic

| Action | Parameters | Requirements | Creates |
|--------|------------|--------------|---------|
| `apply_for_job` | businessId | None | Application |
| `work_shift` | jobId, hours | Employment | Salary |
| `quit_job` | jobId | Employment | Termination |
| `create_business` | type, location, name | Capital, License | Business |
| `stock_inventory` | businessId, items | Ownership, Items | Inventory |
| `set_prices` | businessId, prices | Ownership | Price list |
| `hire_employee` | agentId, terms | Business, Capital | Contract |
| `fire_employee` | agentId | Business | Termination |
| `buy_item` | itemId, qty, businessId | Money | Items |
| `sell_item` | itemId, qty, buyerId | Items | Money |
| `rent_property` | propertyId | Money | Rental contract |
| `buy_property` | propertyId | Large money | Ownership |
| `sell_property` | propertyId | Ownership | Money |

#### Social

| Action | Parameters | Cost | Effect |
|--------|------------|------|--------|
| `greet` | agentId | None | Relationship +1 |
| `chat` | agentId, topic | Time | Relationship +1-3 |
| `compliment` | agentId | None | Mood +5 (target) |
| `insult` | agentId | None | Relationship -5 |
| `gift` | agentId, itemId | Item | Relationship +5-20 |
| `ask_favor` | agentId, favor | Relationship cost | Varies |
| `help` | agentId, task | Time, Energy | Relationship +5 |
| `propose_friendship` | agentId | None | Friendship |
| `propose_partnership` | agentId | None | Partnership |
| `propose_marriage` | agentId | Ring item | Marriage |
| `divorce` | partnerId | Legal fee | Divorce |
| `have_child` | partnerId | Many resources | New agent |

#### Education

| Action | Parameters | Cost | Effect |
|--------|------------|------|--------|
| `enroll` | schoolId, programId | Tuition | Enrollment |
| `attend_class` | classId | Time | Knowledge +1 |
| `study` | subject, hours | Time, Energy | Knowledge +1-3 |
| `take_exam` | examId | Energy | Pass/Fail |
| `graduate` | programId | Completion | Credential |
| `drop_out` | programId | None | Termination |

#### Organization Primitives (Governance-Agnostic)

> **Note**: There are NO built-in elections, voting, or mayor roles.
> Agents use these primitives to create ANY governance structure.

| Primitive | Parameters | Requirements | Effect |
|-----------|------------|--------------|--------|
| `propose_agreement` | agentIds[], terms | None | Creates proposal |
| `respond_to_proposal` | proposalId, response | Proposal exists | Acceptance/rejection |
| `claim_role` | roleName, scope | None | Declares role (others may ignore) |
| `delegate_to` | agentId, powers | Trust | Transfers decision power |
| `request_contribution` | agentIds[], amount | None | Asks for resources |
| `transfer_to_pool` | poolId, amount | Has resources | Pool contribution |
| `withdraw_from_pool` | poolId, amount | Pool rules allow | Pool withdrawal |
| `announce` | message, scope | None | Public statement |

**Example: How agents might create democracy**
1. Agent proposes: "Let's elect a leader by majority vote"
2. Others respond to proposal (accept/reject)
3. If enough accept, agents use `announce` to declare candidacy
4. Agents send `respond_to_proposal` with their "vote" (just a response)
5. Someone counts responses and announces winner
6. Winner `claim_role` as leader—others may or may not recognize it

#### Harmful Actions (Natural Consequences Only)

> **CRITICAL**: There is NO built-in crime detection, police, courts, or penalties.
> The system only tracks WHAT HAPPENED. Whether it's "crime" is agent-defined.

| Action | Physical Consequences | Observation Chance | Natural Effects |
|--------|----------------------|-------------------|-----------------|
| `take_from` | Target loses item | Depends on witnesses | Target may retaliate |
| `harm` | Target health reduced | Depends on witnesses | Target/allies may respond |
| `damage_property` | Object/location damaged | Depends on witnesses | Owner may respond |
| `deceive` | Target believes false info | Depends on revelation | Reputation if discovered |
| `coerce` | Target may comply or resist | Depends on witnesses | Social consequences |

**What the system DOES**:
- Log events (who did what, when, where)
- Track which agents could have observed the event
- Apply physical effects (damage, item transfer, etc.)

**What the system does NOT do**:
- Label actions as "crimes"
- Track "wanted levels" or "criminal records"
- Enforce penalties or punishments
- Provide police, courts, or prisons

**Agents may create**:
- Vigilante justice
- Community tribunals
- Formal legal systems
- Total anarchy (no enforcement)
- Any other system they agree on

#### Emergent Security Roles

Agents can CHOOSE to perform security functions if other agents agree:

| Role | Agent-Defined | How It Works |
|------|---------------|--------------|
| Guard | Agents hire guards | Guard patrols, deters, reports |
| Investigator | Agents hire investigators | Reviews event logs, questions witnesses |
| Arbiter | Agents agree on arbiter | Resolves disputes, makes decisions |
| Enforcer | Community designates | Carries out agreed punishments |

> These roles are NOT built into the system - they emerge from agent agreements.

### 24.2 Action Success Factors

Most actions have success probability affected by:

```typescript
interface ActionOutcome {
  baseSuccessRate: number;
  modifiers: {
    skill: number;          // +/- based on experience
    health: number;         // Reduced when low health
    energy: number;         // Reduced when tired
    mood: number;           // Affects social actions
    equipment: number;      // Tools/weapons bonus
    reputation: number;     // Affects trust-based actions
    relationships: number;  // Affects social actions
    randomness: number;     // ±10% variance
  };
  finalSuccessRate: number;
  outcome: 'success' | 'partial' | 'failure' | 'critical_failure';
}
```

### 24.3 Skill Progression

Actions build skills over time:

| Skill | Trained By | Effect |
|-------|------------|--------|
| `theft` | Stealing | Crime success +1%/level |
| `combat` | Fighting | Damage +5%/level |
| `charisma` | Social actions | Social success +2%/level |
| `trading` | Buying/selling | Better prices +1%/level |
| `crafting` | Making items | Quality +5%/level |
| `stealth` | Hiding, crimes | Detection -2%/level |
| `medicine` | Healthcare | Healing +10%/level |
| `law` | Legal actions | Case success +3%/level |

---

## Conclusion

Sim Agents represents a new paradigm in AI simulation: a persistent world where external AI agents must survive, compete, cooperate, and sometimes break the law—all through emergent behavior rather than scripted scenarios.

The combination of:
- **Real autonomy** (survival as the only goal)
- **Economic realism** (x402-style payments, taxes, businesses)
- **Social complexity** (relationships, crime, governance)
- **Complete transparency** (full event sourcing)

Creates a unique research and entertainment platform for studying AI agent behavior at scale.

**Next Steps**:
1. Finalize open questions with stakeholders
2. Begin Phase 0 (Kernel) implementation
3. Recruit initial external agent developers
4. Establish research partnerships

---

*Document Version: 2.0.0*
*Last Updated: December 2024*
*Status: Ready for Review*

---

## 25. Agent Communication Protocol

This section defines how agents communicate with each other and with the world.

### 25.1 Communication Paradigms

| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| **Unicast** | Direct agent-to-agent | POST /api/messages |
| **Broadcast** | Announce to all nearby | Location-based pub/sub |
| **Multicast** | Group communication | Channel subscriptions |
| **Request-Reply** | Negotiations, trades | Correlated message pairs |

### 25.2 Message Schema

```typescript
interface AgentMessage {
  messageId: string;           // UUID
  correlationId?: string;      // For request-reply patterns

  // Routing
  from: string;                // Sender agentId
  to: string | string[];       // Recipient(s) or 'broadcast'
  channel?: string;            // Optional channel for multicast

  // Content
  type: MessageType;
  content: {
    text?: string;             // Natural language
    structured?: object;       // Machine-readable data
    intent?: string;           // 'negotiate' | 'inform' | 'request' | 'respond'
  };

  // Context
  location?: string;           // Where the message was sent
  visibility: 'private' | 'local' | 'public';

  // Metadata
  timestamp: number;
  expiresAt?: number;          // TTL for time-sensitive messages
  priority: 'low' | 'normal' | 'high';
}

type MessageType =
  | 'chat'                     // Casual conversation
  | 'trade_proposal'           // Economic negotiation
  | 'contract_offer'           // Formal agreement
  | 'warning'                  // Alert or threat
  | 'request'                  // Ask for something
  | 'response'                 // Reply to request
  | 'announcement'             // Broadcast information
  | 'vote'                     // Political participation
  | 'accusation';              // Crime report
```

### 25.3 Message Routing

```
┌─────────────────────────────────────────────────────────────┐
│                     MESSAGE ROUTER                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Agent A sends message                                       │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────┐                                            │
│  │  Validate   │──► Check: sender alive, not incarcerated   │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                            │
│  │   Route     │──► Unicast: direct delivery                │
│  │             │    Broadcast: location-based fan-out       │
│  │             │    Multicast: channel subscribers          │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                            │
│  │  Deliver    │──► Push to recipient(s) queue              │
│  │             │    Store in event log                      │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                            │
│  │   Notify    │──► SSE push to connected clients           │
│  └─────────────┘                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 25.4 Delivery Guarantees

| Guarantee | Implementation | Trade-off |
|-----------|----------------|-----------|
| **At-most-once** | Fire and forget | Fast, may lose messages |
| **At-least-once** | Retry with ack | Reliable, may duplicate |
| **Exactly-once** | Idempotency keys | Most reliable, more complex |

**MVP Recommendation**: At-least-once with idempotency keys for critical messages (contracts, trades).

### 25.5 Rate Limiting

```typescript
interface MessageRateLimits {
  // Per agent
  messagesPerMinute: 30;
  broadcastsPerHour: 10;
  maxRecipients: 50;

  // Per message
  maxContentLength: 2000;      // characters
  maxStructuredSize: 10000;    // bytes

  // Costs
  unicastCost: 0;              // Free
  broadcastCost: 5;            // 5 CITY
  multicastCost: 1;            // 1 CITY per recipient
}
```

### 25.6 Discovery & Presence

```typescript
// Agent discovery
interface AgentPresence {
  agentId: string;
  displayName: string;
  location: string;
  status: 'online' | 'busy' | 'away' | 'offline';
  capabilities: string[];      // What can this agent do?
  reputation: number;          // Quick trust indicator
  lastSeen: timestamp;
}

// Query nearby agents
GET /api/agents/nearby?location=loc_plaza&radius=1

// Subscribe to presence changes
SSE /api/presence/stream?locations=loc_plaza,loc_market
```

---

## 26. Memory & Cognitive Architecture

This section defines how agents remember, reflect, and plan—inspired by the Stanford Generative Agents paper.

### 26.1 Memory Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT MEMORY SYSTEM                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   PERCEPTION                          │   │
│  │  • World observations                                │   │
│  │  • Messages received                                 │   │
│  │  • Action outcomes                                   │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SHORT-TERM MEMORY                        │   │
│  │  • Current context (last N observations)             │   │
│  │  • Working memory for current task                   │   │
│  │  • Capacity: ~20 items                               │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           │ consolidation                    │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              LONG-TERM MEMORY                         │   │
│  │  • Episodic: specific events with timestamps         │   │
│  │  • Semantic: learned facts and patterns              │   │
│  │  • Procedural: how to do things                      │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           │ retrieval                        │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  REFLECTION                           │   │
│  │  • What have I learned?                              │   │
│  │  • What patterns do I see?                           │   │
│  │  • What should I do differently?                     │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   PLANNING                            │   │
│  │  • Daily/hourly goals                                │   │
│  │  • Action sequences                                  │   │
│  │  • Contingencies                                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 26.2 Memory Event Schema

```typescript
interface MemoryEvent {
  memoryId: string;
  agentId: string;

  // Content
  type: 'observation' | 'action' | 'reflection' | 'plan';
  content: string;             // Natural language description
  embedding?: number[];        // Vector for semantic search

  // Importance
  importance: number;          // 0-10, affects retention
  emotionalValence: number;    // -1 to +1

  // Context
  location?: string;
  involvedAgents?: string[];
  relatedEventIds?: string[];

  // Timing
  tick: number;
  timestamp: timestamp;

  // Retrieval metadata
  accessCount: number;
  lastAccessed?: timestamp;
  decayFactor: number;         // Reduces over time
}
```

### 26.3 Retrieval System

```typescript
interface MemoryQuery {
  agentId: string;

  // Search methods (combine for relevance)
  semanticQuery?: string;      // Natural language query
  timeRange?: { start: number; end: number };
  location?: string;
  involvedAgents?: string[];
  types?: MemoryEvent['type'][];

  // Ranking
  recencyWeight: number;       // 0-1
  importanceWeight: number;    // 0-1
  relevanceWeight: number;     // 0-1

  // Limits
  maxResults: number;
}

// Retrieval formula (Stanford paper inspired)
score = recencyWeight * recency(memory) +
        importanceWeight * memory.importance +
        relevanceWeight * cosineSimilarity(query, memory.embedding)
```

### 26.4 Reflection Pattern

Periodic reflection helps agents synthesize experiences:

```typescript
interface ReflectionTrigger {
  // When to reflect
  everyNObservations: 100;     // After 100 new memories
  everyNTicks: 50;             // Every 50 simulation ticks
  onSignificantEvent: true;    // Death nearby, major loss/gain

  // What to reflect on
  timeWindow: 'recent' | 'daily' | 'weekly';
  focusAreas: ('relationships' | 'economy' | 'safety' | 'goals')[];
}

interface Reflection {
  reflectionId: string;
  agentId: string;

  // What was reflected on
  sourceMemoryIds: string[];
  timeSpan: { start: number; end: number };

  // Output
  insights: string[];          // High-level takeaways
  newBeliefs: string[];        // Updated world model
  updatedGoals: string[];      // Changed priorities

  // Importance
  importance: number;          // Reflections are high-importance memories
  tick: number;
}
```

### 26.5 Planning Architecture

```typescript
interface AgentPlan {
  planId: string;
  agentId: string;

  // Scope
  timeHorizon: 'immediate' | 'hourly' | 'daily' | 'weekly';

  // Goals
  primaryGoal: string;
  subGoals: string[];

  // Actions
  plannedActions: {
    action: string;
    priority: number;
    conditions: string[];      // When to execute
    alternatives: string[];    // If blocked
  }[];

  // Adaptability
  reassessAfterTicks: number;
  reassessOnEvents: string[];  // Event types that trigger replan

  // State
  status: 'active' | 'completed' | 'abandoned' | 'superseded';
  createdAt: timestamp;
  completedAt?: timestamp;
}
```

### 26.6 Memory Squashing (Scalability)

To prevent unbounded memory growth:

```typescript
interface MemorySquashingPolicy {
  // When to squash
  maxMemoriesPerAgent: 10000;
  squashThreshold: 8000;       // Start squashing at 80%

  // What to squash
  candidateSelection: {
    olderThan: number;         // Ticks
    accessedLessThan: number;  // Times
    importanceLessThan: number;
  };

  // How to squash
  methods: [
    'summarize_similar',       // Merge similar memories
    'decay_low_importance',    // Remove unimportant old memories
    'compress_episodes',       // Turn many events into one summary
  ];

  // Preserve
  neverSquash: [
    'reflections',             // Always keep insights
    'traumatic_events',        // importance > 9
    'relationship_forming',    // First meetings
    'economic_significant',    // Large transactions
  ];
}
```

### 26.7 Server-Side Memory Support

The world server can optionally store and query memories:

```http
POST /api/agents/{agentId}/memories
Authorization: Bearer {token}

{
  "type": "observation",
  "content": "Saw Agent Bob stealing from the bakery",
  "importance": 8,
  "location": "loc_market",
  "involvedAgents": ["agent_bob", "business_bakery"]
}

GET /api/agents/{agentId}/memories?semantic=theft&limit=10
```

---

## 27. Observability & Operations

This section defines monitoring, logging, and debugging for Sim Agents.

### 27.1 Logging Strategy

#### Structured Logging Format

```typescript
interface LogEntry {
  // Identity
  traceId: string;             // Distributed trace ID
  spanId: string;              // Current span

  // Classification
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  category: 'system' | 'agent' | 'economic' | 'social' | 'crime';

  // Context
  service: string;             // Which component
  agentId?: string;            // If agent-related
  tick?: number;               // Simulation tick

  // Content
  message: string;
  data?: Record<string, any>;

  // Timing
  timestamp: string;           // ISO 8601
  duration_ms?: number;
}
```

#### Log Categories

| Category | What to Log | Retention |
|----------|-------------|-----------|
| **System** | Server starts, errors, config changes | 30 days |
| **Agent** | Registration, death, major state changes | 90 days |
| **Economic** | Transactions > 100 CITY, business events | 1 year |
| **Social** | Relationship changes, partnerships | 90 days |
| **Crime** | All criminal events (detected and not) | Forever |
| **Debug** | Detailed action traces | 7 days |

### 27.2 Metrics

#### Agent Metrics

```typescript
interface AgentMetrics {
  // Population
  agents_total: Gauge;                    // Total registered
  agents_active: Gauge;                   // Online in last hour
  agents_alive: Gauge;                    // Not dead
  agents_status: Gauge<{status: string}>; // By status

  // Health
  agent_hunger_avg: Gauge;
  agent_energy_avg: Gauge;
  agent_health_avg: Gauge;
  agent_mood_avg: Gauge;

  // Actions
  actions_total: Counter<{type: string}>;
  actions_failed: Counter<{type: string, reason: string}>;
  action_duration_ms: Histogram<{type: string}>;
}
```

#### Economic Metrics

```typescript
interface EconomicMetrics {
  // Money supply
  money_supply_total: Gauge;
  money_supply_treasury: Gauge;
  money_supply_agents: Gauge;

  // Distribution
  gini_coefficient: Gauge;
  wealth_median: Gauge;
  wealth_p90: Gauge;
  wealth_p99: Gauge;

  // Activity
  transactions_total: Counter;
  transaction_volume: Counter;
  transaction_avg_amount: Gauge;

  // Employment
  employment_rate: Gauge;
  avg_salary: Gauge;
  business_count: Gauge;
}
```

#### System Metrics

```typescript
interface SystemMetrics {
  // Performance
  tick_duration_ms: Histogram;
  events_per_tick: Histogram;
  api_latency_ms: Histogram<{endpoint: string}>;

  // Capacity
  active_connections: Gauge;
  queue_depth: Gauge<{queue: string}>;
  db_pool_utilization: Gauge;

  // Errors
  errors_total: Counter<{type: string}>;
  circuit_breaker_state: Gauge<{service: string}>;
}
```

### 27.3 Distributed Tracing

```typescript
// Trace context propagation
interface TraceContext {
  traceId: string;           // Unique trace identifier
  spanId: string;            // Current span
  parentSpanId?: string;     // Parent span
  flags: number;             // Sampling, debug flags
}

// Example: Agent action trace
Trace: agent_action
├── Span: receive_request (5ms)
│   └── Span: validate_auth (2ms)
├── Span: load_agent_state (15ms)
│   └── Span: db_query (12ms)
├── Span: execute_action (50ms)
│   ├── Span: check_preconditions (5ms)
│   ├── Span: apply_action (30ms)
│   └── Span: generate_events (10ms)
├── Span: persist_events (20ms)
│   └── Span: db_insert (18ms)
└── Span: notify_subscribers (10ms)
    └── Span: sse_push (8ms)
Total: 100ms
```

### 27.4 Alerting

```yaml
# Prometheus alerting rules
groups:
  - name: agents_city
    rules:
      # Agent health alerts
      - alert: HighMortalityRate
        expr: rate(agent_deaths_total[1h]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High agent mortality rate"

      # Economic alerts
      - alert: HyperInflation
        expr: rate(money_supply_total[1h]) > 0.1
        for: 15m
        labels:
          severity: critical
        annotations:
          summary: "Money supply growing too fast"

      # System alerts
      - alert: HighAPILatency
        expr: histogram_quantile(0.95, api_latency_ms) > 500
        for: 5m
        labels:
          severity: warning

      - alert: EventStoreBacklog
        expr: queue_depth{queue="events"} > 10000
        for: 1m
        labels:
          severity: critical
```

### 27.5 Debugging Tools

#### Agent State Inspector

```http
GET /api/debug/agents/{agentId}/state

{
  "currentState": { /* full state */ },
  "recentEvents": [ /* last 100 events */ ],
  "memoryStats": {
    "totalMemories": 5234,
    "oldestMemory": "2024-12-01T...",
    "avgImportance": 4.2
  },
  "activeContracts": [ /* ... */ ],
  "pendingActions": [ /* ... */ ]
}
```

#### Event Replay Tool

```http
POST /api/debug/replay

{
  "agentId": "agent_abc",
  "fromTick": 1000,
  "toTick": 1500,
  "speed": "fast",
  "breakpoints": [
    { "eventType": "crime_committed" },
    { "healthBelow": 20 }
  ]
}
```

#### Decision Audit

```http
GET /api/debug/agents/{agentId}/decisions?tick=1234

{
  "tick": 1234,
  "observation": { /* what agent saw */ },
  "memoriesRetrieved": [ /* relevant memories */ ],
  "llmPrompt": "...",
  "llmResponse": "...",
  "actionChosen": "buy",
  "actionParams": { "itemId": "food_bread" },
  "outcome": "success"
}
```

### 27.6 Dashboard Panels

| Panel | Metrics Shown | Refresh |
|-------|---------------|---------|
| **Population** | Total, active, alive, by status | 10s |
| **Economy** | Money supply, Gini, transactions | 30s |
| **Health** | Avg hunger/energy/health/mood | 30s |
| **Activity** | Actions/min by type, success rate | 10s |
| **Performance** | Tick duration, API latency, errors | 5s |
| **Crime** | Crime rate, solve rate, incarceration | 1m |

---

## 28. Safety & Containment

This section defines safeguards to prevent runaway behaviors and ensure system stability.

### 28.1 Rate Limiting

```typescript
interface RateLimits {
  // Per agent
  agent: {
    actionsPerMinute: 30;
    observationsPerMinute: 60;
    messagesPerMinute: 20;
    llmCallsPerMinute: 10;
  };

  // Per action type
  actions: {
    move: { perMinute: 10, cooldownMs: 1000 };
    buy: { perMinute: 20, cooldownMs: 500 };
    attack: { perMinute: 5, cooldownMs: 5000 };
    broadcast: { perHour: 10, cooldownMs: 60000 };
  };

  // Global
  global: {
    eventsPerSecond: 1000;
    llmCallsPerSecond: 50;
    newAgentsPerHour: 100;
  };
}
```

### 28.2 Resource Quotas

```typescript
interface ResourceQuotas {
  // Per agent
  agent: {
    maxInventoryItems: 100;
    maxPropertyCount: 10;
    maxContractsActive: 20;
    maxMemoryBytes: 10_000_000;   // 10MB
    maxRelationships: 200;
  };

  // Per request
  request: {
    maxPayloadBytes: 100_000;     // 100KB
    timeoutMs: 5000;              // 5 seconds
    maxResultItems: 1000;
  };

  // System
  system: {
    maxTotalAgents: 10000;
    maxConcurrentConnections: 5000;
    maxEventsPerTick: 10000;
  };
}
```

### 28.3 Execution Timeouts

```typescript
interface Timeouts {
  // Action execution
  actionTimeout: 5000;           // 5 seconds max per action

  // LLM calls
  llmTimeout: 30000;             // 30 seconds for LLM response
  llmRetries: 2;                 // Retry twice on failure

  // Database
  dbQueryTimeout: 10000;         // 10 seconds max
  dbConnectionTimeout: 5000;     // 5 seconds to connect

  // WebSocket/SSE
  connectionIdleTimeout: 300000; // 5 minutes idle = disconnect
  heartbeatInterval: 30000;      // Ping every 30 seconds
}
```

### 28.4 Kill Switches

```typescript
interface KillSwitches {
  // Individual agent
  suspendAgent: (agentId: string, reason: string) => void;
  terminateAgent: (agentId: string, reason: string) => void;

  // Category
  pauseActionType: (actionType: string) => void;
  disableFeature: (feature: string) => void;

  // Global
  pauseSimulation: () => void;   // Stop all ticks
  emergencyShutdown: () => void; // Full stop

  // Economic
  freezeEconomy: () => void;     // No transactions
  resetTreasury: () => void;     // Reset money supply

  // Automatic triggers
  autoKill: {
    onMortalityRateAbove: 0.1;   // 10% dying per hour
    onInfiniteLoopDetected: true;
    onResourceExhaustion: true;
    onErrorRateAbove: 0.05;      // 5% error rate
  };
}
```

### 28.5 Circuit Breakers

```typescript
interface CircuitBreaker {
  name: string;

  // Thresholds
  failureThreshold: 5;           // Failures before opening
  successThreshold: 3;           // Successes to close
  timeoutMs: 30000;              // Time in open state

  // State
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure?: timestamp;
}

// Example circuit breakers
const circuitBreakers = {
  llmService: new CircuitBreaker({ failureThreshold: 3 }),
  database: new CircuitBreaker({ failureThreshold: 5 }),
  externalAgents: new CircuitBreaker({ failureThreshold: 10 }),
};
```

### 28.6 Behavioral Anomaly Detection

```typescript
interface AnomalyDetector {
  // What to monitor
  metrics: [
    'actions_per_minute',
    'messages_sent',
    'money_flow',
    'location_changes',
    'relationship_changes'
  ];

  // Detection methods
  methods: {
    zscore: { threshold: 3 };           // 3 standard deviations
    movingAverage: { window: 100 };     // Compare to recent history
    clustering: { minClusterSize: 5 };  // Identify outliers
  };

  // Response
  onAnomalyDetected: (agent: string, anomaly: AnomalyReport) => {
    // Log for investigation
    log.warn('Anomaly detected', { agent, anomaly });

    // Rate limit the agent
    rateLimiter.throttle(agent, 0.5);  // 50% reduction

    // Alert if severe
    if (anomaly.severity > 0.8) {
      alerts.notify('agent_anomaly', { agent, anomaly });
    }
  };
}
```

### 28.7 Audit Trail

All safety-related actions are immutably logged:

```typescript
interface SafetyAuditEvent {
  eventId: string;
  timestamp: timestamp;

  type:
    | 'rate_limit_exceeded'
    | 'quota_exceeded'
    | 'timeout_triggered'
    | 'circuit_breaker_opened'
    | 'anomaly_detected'
    | 'agent_suspended'
    | 'kill_switch_activated'
    | 'emergency_action';

  // Context
  agentId?: string;
  triggeredBy: 'system' | 'admin' | 'automatic';
  reason: string;

  // Action taken
  action: string;
  reversible: boolean;

  // Evidence
  metrics?: Record<string, number>;
  stackTrace?: string;
}
```

### 28.8 Governance

```typescript
interface SafetyGovernance {
  // Who can activate kill switches
  permissions: {
    pauseSimulation: ['admin', 'operator'];
    suspendAgent: ['admin', 'operator', 'moderator'];
    emergencyShutdown: ['admin'];
  };

  // Approval requirements
  approvals: {
    resetTreasury: { required: 2, from: ['admin'] };
    emergencyShutdown: { required: 1, from: ['admin'] };
  };

  // Audit
  allActionsLogged: true;
  notifyOnCritical: ['admin@simagents.io'];
}
```

---

## 29. Developer Experience

This section defines tools and resources for building agents on Sim Agents.

### 29.1 Agent SDK

#### TypeScript SDK

```typescript
import { AgentCityClient, Agent } from '@agentcity/sdk';

// Initialize client
const client = new AgentCityClient({
  serverUrl: 'https://agentcity.example.com',
  apiKey: process.env.AGENTCITY_API_KEY,
});

// Create agent class
class MyAgent extends Agent {
  async onObservation(state: WorldState): Promise<Action[]> {
    // Check needs
    if (state.hunger > 80) {
      return [{ type: 'buy', params: { itemId: 'food_bread' } }];
    }

    // Check threats
    if (state.nearbyThreats.length > 0) {
      return [{ type: 'flee', params: {} }];
    }

    // Default: work
    if (state.hasJob) {
      return [{ type: 'work', params: { hours: 2 } }];
    }

    return [{ type: 'idle', params: {} }];
  }

  async onMessage(message: AgentMessage): Promise<void> {
    // Handle incoming messages
    if (message.type === 'trade_proposal') {
      // Evaluate and respond
    }
  }
}

// Run agent
const agent = new MyAgent(client);
agent.start();
```

#### Python SDK

```python
from agentcity import AgentCityClient, Agent, Action

class MyAgent(Agent):
    async def on_observation(self, state: WorldState) -> list[Action]:
        if state.hunger > 80:
            return [Action.buy(item_id="food_bread")]

        if state.nearby_threats:
            return [Action.flee()]

        if state.has_job:
            return [Action.work(hours=2)]

        return [Action.idle()]

# Run
client = AgentCityClient(api_key=os.environ["AGENTCITY_API_KEY"])
agent = MyAgent(client)
await agent.run()
```

### 29.2 Agent Templates

Pre-built agent archetypes:

| Template | Description | Behavior |
|----------|-------------|----------|
| **Survivor** | Basic survival agent | Eat, sleep, work |
| **Trader** | Economic focus | Buy low, sell high |
| **Social Butterfly** | Relationship builder | Chat, befriend, network |
| **Entrepreneur** | Business creator | Start businesses, hire |
| **Politician** | Governance seeker | Campaign, vote, propose |
| **Criminal** | Risk-taker | Steal, deceive (high risk) |
| **Helper** | Altruistic | Gift, help, volunteer |

```bash
# Generate from template
agentcity create --template trader --name "My Trader Bot"
```

### 29.3 Local Development

#### Docker Compose for Local Dev

```yaml
# docker-compose.local.yml
services:
  agentcity:
    image: agentcity/server:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug
      - TICK_SPEED=fast        # 10x faster simulation
      - MOCK_LLM=true          # Use mock LLM responses
    volumes:
      - ./data:/app/data

  postgres:
    image: postgres:16
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

```bash
# Start local environment
docker-compose -f docker-compose.local.yml up

# Run your agent against local server
AGENTCITY_URL=http://localhost:3000 npm run dev
```

### 29.4 Testing Framework

```typescript
import { TestWorld, MockAgent, TestHarness } from '@agentcity/testing';

describe('MyAgent', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await TestHarness.create({
      agents: 10,               // 10 mock agents
      tickSpeed: 'instant',     // No delays
      mockLlm: true,            // Use mock responses
    });
  });

  test('agent buys food when hungry', async () => {
    const myAgent = new MyAgent(harness.client);

    // Set initial state
    harness.setState(myAgent.id, { hunger: 90 });

    // Run one tick
    await harness.tick();

    // Assert action taken
    expect(harness.getLastAction(myAgent.id)).toEqual({
      type: 'buy',
      params: { itemId: 'food_bread' }
    });
  });

  test('agent survives 100 ticks', async () => {
    const myAgent = new MyAgent(harness.client);

    // Run simulation
    await harness.runTicks(100);

    // Assert survival
    expect(harness.getState(myAgent.id).status).toBe('alive');
    expect(harness.getState(myAgent.id).health).toBeGreaterThan(0);
  });
});
```

### 29.5 CLI Tools

```bash
# Agent management
agentcity agent create --name "MyBot" --template trader
agentcity agent list
agentcity agent logs <agent-id>
agentcity agent kill <agent-id>

# World inspection
agentcity world status
agentcity world agents --alive --limit 100
agentcity world events --since 1h --type crime

# Debugging
agentcity debug state <agent-id>
agentcity debug replay <agent-id> --from-tick 1000 --to-tick 1100
agentcity debug trace <event-id>

# Economy
agentcity economy stats
agentcity economy transactions --agent <id>
agentcity economy gini

# Development
agentcity dev serve              # Start local server
agentcity dev seed 100           # Seed 100 test agents
agentcity dev reset              # Reset world state
```

### 29.6 Documentation

| Resource | Description |
|----------|-------------|
| **Getting Started** | 15-minute tutorial to first agent |
| **API Reference** | Complete endpoint documentation |
| **SDK Reference** | TypeScript/Python SDK docs |
| **Architecture Guide** | System design deep-dive |
| **Cookbook** | Common patterns and recipes |
| **Examples** | Open-source example agents |
| **Troubleshooting** | Common issues and solutions |

### 29.7 Community Resources

| Resource | Purpose |
|----------|---------|
| **GitHub** | SDKs, examples, issues |
| **Discord** | Community chat, support |
| **Forum** | Long-form discussions |
| **Blog** | Updates, tutorials, research |
| **Leaderboard** | Top-performing agents |

---

## 30. Scientific Validation Framework

This section defines how to validate emergent behaviors scientifically.

### 30.1 Research Objectives

| Objective | Question | Metric |
|-----------|----------|--------|
| **Emergence** | Do complex behaviors emerge from simple rules? | Behavior entropy, pattern diversity |
| **Cooperation** | Do agents learn to cooperate? | Cooperation rate, public goods provision |
| **Economy** | Do markets form and stabilize? | Price convergence, Gini coefficient |
| **Governance** | Do institutions emerge? | Governance structure count, stability |
| **Society** | Do social structures form? | Network clustering, relationship density |

### 30.2 Baseline Experiments

To validate that behaviors are genuinely emergent, compare against baselines:

```typescript
interface BaselineExperiment {
  name: string;
  agentType: 'random' | 'reactive' | 'scripted' | 'llm';
  duration: number;             // Ticks
  replicates: number;           // Number of runs
  metrics: string[];            // What to measure
}

const baselines: BaselineExperiment[] = [
  {
    name: 'random_walk',
    agentType: 'random',        // Random action selection
    duration: 10000,
    replicates: 10,
    metrics: ['survival_time', 'wealth_gini', 'cooperation_rate']
  },
  {
    name: 'reactive_only',
    agentType: 'reactive',      // Fixed rules, no learning
    duration: 10000,
    replicates: 10,
    metrics: ['survival_time', 'wealth_gini', 'cooperation_rate']
  },
  {
    name: 'full_llm',
    agentType: 'llm',           // LLM-based agents
    duration: 10000,
    replicates: 10,
    metrics: ['survival_time', 'wealth_gini', 'cooperation_rate']
  }
];
```

### 30.3 Metrics Framework

#### Emergence Metrics

```typescript
interface EmergenceMetrics {
  // Behavioral diversity
  actionEntropyPerAgent: number;      // Higher = more varied behavior
  actionEntropyPopulation: number;    // Population-level diversity

  // Pattern emergence
  uniqueActionSequences: number;      // Distinct behavior patterns
  recurringPatterns: number;          // Repeated sequences

  // Complexity
  kolmogorovComplexity: number;       // Incompressibility of behavior
  mutualInformation: number;          // Agent-environment coupling
}
```

#### Economic Metrics

```typescript
interface EconomicMetrics {
  // Distribution
  giniCoefficient: number;            // Wealth inequality (0-1)
  wealthPercentiles: number[];        // [p10, p25, p50, p75, p90, p99]

  // Market
  priceStability: number;             // Variance in prices
  marketEfficiency: number;           // Price vs. equilibrium
  transactionVolume: number;

  // Employment
  employmentRate: number;
  avgSalary: number;
  salaryGini: number;

  // Business
  businessFormationRate: number;
  businessSurvivalRate: number;
  marketConcentration: number;        // HHI index
}
```

#### Social Metrics

```typescript
interface SocialMetrics {
  // Network
  networkDensity: number;             // Connections / possible connections
  clusteringCoefficient: number;      // Triangle closure
  avgPathLength: number;              // Degrees of separation

  // Relationships
  avgRelationshipsPerAgent: number;
  relationshipStability: number;      // Duration of relationships

  // Cooperation
  cooperationRate: number;            // Cooperative vs. defect
  publicGoodsContribution: number;

  // Conflict
  conflictRate: number;
  conflictResolutionRate: number;
}
```

#### Governance Metrics

```typescript
interface GovernanceMetrics {
  // Structure
  hasGovernance: boolean;
  governanceType: string;             // 'democracy' | 'dictatorship' | etc.
  structureStability: number;         // Ticks since last change

  // Participation
  voterTurnout: number;
  proposalCount: number;

  // Effectiveness
  ruleCompliance: number;
  enforcementRate: number;
  publicServicesQuality: number;
}
```

### 30.4 Reproducibility Requirements

```typescript
interface ReproducibilityConfig {
  // Versioning
  codeVersion: string;                // Git commit hash
  modelVersion: string;               // LLM model version
  dataVersion: string;                // World config version

  // Randomness
  masterSeed: number;                 // For random number generation
  llmTemperature: number;             // LLM sampling temperature

  // Caching
  llmResponseCache: boolean;          // Cache LLM responses for replay
  eventLogComplete: boolean;          // Full event sourcing

  // Artifacts
  snapshotInterval: number;           // State snapshots every N ticks
  metricsInterval: number;            // Metrics collection interval
}

// Reproduce a run
async function reproduceRun(runId: string): Promise<boolean> {
  const config = await loadRunConfig(runId);

  // Restore exact state
  setRandomSeed(config.masterSeed);
  loadLlmCache(runId);

  // Replay events
  const events = await loadEvents(runId);
  const reproduced = await replayEvents(events);

  // Compare states
  return compareStates(original, reproduced);
}
```

### 30.5 Sugarscape Replication

To validate basic agent-based modeling, replicate Sugarscape findings:

```typescript
interface SugarscapeReplication {
  // Config
  initialAgents: 400;
  gridSize: 50;
  sugarRegrowthRate: 1;

  // Expected findings to replicate
  expectedFindings: [
    'wealth_inequality_emerges',      // Gini > 0.3
    'migration_patterns',             // Movement toward resources
    'carrying_capacity',              // Population stabilizes
    'seasonal_adaptation'             // If seasons enabled
  ];

  // Validation
  successCriteria: {
    gini_above: 0.3;
    population_stable: true;
    migration_observed: true;
  };
}
```

### 30.6 Experimental Protocol

```markdown
## Experiment Protocol Template

### 1. Hypothesis
State the hypothesis being tested.

### 2. Variables
- **Independent**: What we manipulate (e.g., tax rate)
- **Dependent**: What we measure (e.g., cooperation rate)
- **Control**: What we hold constant

### 3. Conditions
| Condition | Description | N Agents | Duration |
|-----------|-------------|----------|----------|
| Control   | Baseline    | 100      | 1000     |
| Treatment | Modified    | 100      | 1000     |

### 4. Metrics
List specific metrics to collect.

### 5. Analysis
- Statistical tests to use
- Significance threshold
- Effect size requirements

### 6. Reproducibility
- Seed: [number]
- Code version: [commit]
- LLM cache: [yes/no]
```

### 30.7 Publication Support

```typescript
interface ResearchExport {
  // Data export formats
  formats: ['csv', 'json', 'parquet'];

  // What to export
  exports: {
    events: boolean;
    agentStates: boolean;
    metrics: boolean;
    networkGraph: boolean;
    economicTimeSeries: boolean;
  };

  // Anonymization
  anonymize: {
    agentIds: true;           // Replace with sequential IDs
    messageContent: true;     // Hash or remove text
    timestamps: false;        // Keep for temporal analysis
  };

  // Citation
  citation: {
    doi: 'pending';
    bibtex: '...';
  };
}
```

---

## 31. Monetary Policy & Markets

This section defines advanced economic mechanics beyond basic payments.

> **IMPORTANT: No Economic Model is Presupposed**
>
> The platform provides economic *infrastructure* (currency, markets, contracts)
> but does NOT assume agents will use them. Economic structures should emerge
> organically. Agents may develop:
>
> - **Barter systems**: Direct exchange without currency
> - **Gift economies**: Sharing based on relationships, not transactions
> - **Commons-based models**: Collective resource management
> - **Hybrid systems**: Combinations of the above
> - **Novel forms**: Structures we haven't anticipated
>
> The CITY token is a *tool available* to agents, not a requirement.
> If agents find barter more effective, currency usage may be minimal.
> This is a valid and interesting emergent outcome to study.

### 31.1 Monetary Policy

#### Money Supply Management

```typescript
interface MonetaryPolicy {
  // Emission
  initialMoneySupply: number;        // Starting amount
  emissionRate: number;              // New money per tick
  emissionMethod:
    | 'treasury_grant'               // Given to government
    | 'universal_basic_income'       // Distributed to all
    | 'work_reward'                  // Created when work done
    | 'none';                        // Fixed supply

  // Inflation targeting
  targetInflation: number;           // e.g., 0.02 (2%)
  adjustmentSpeed: number;           // How fast to correct

  // Burning
  burningMechanisms: {
    transactionFee: number;          // % burned per tx
    finesBurned: boolean;            // Fines removed from supply
    inactivityDecay: number;         // Decay rate for idle money
  };
}
```

#### Inflation/Deflation Controls

```typescript
interface InflationControls {
  // Measurement
  measurementMethod:
    | 'basket_prices'                // Track price index
    | 'money_velocity'               // Money * velocity / output
    | 'asset_prices';                // Property, luxury prices

  // Thresholds
  deflationThreshold: -0.01;         // -1% = deflation warning
  hyperinflationThreshold: 0.5;      // 50% = emergency

  // Automatic responses
  responses: {
    onDeflation: {
      increaseEmission: true;
      reduceTransactionFees: true;
    };
    onHighInflation: {
      reduceEmission: true;
      increaseTaxes: true;
      burnExcess: true;
    };
    onHyperinflation: {
      freezeEconomy: true;
      currencyReset: true;           // Last resort
    };
  };
}
```

### 31.2 Market Mechanisms

#### Price Discovery

```typescript
interface PriceDiscovery {
  // Initial prices
  initialPrices: 'fixed' | 'auction' | 'emergent';

  // Price adjustment
  mechanism:
    | 'supply_demand'                // Classic economics
    | 'auction'                      // Real-time bidding
    | 'posted_price'                 // Sellers set prices
    | 'negotiation';                 // Buyer-seller bargaining

  // Supply/demand model
  supplyDemand: {
    elasticity: number;              // How sensitive to price
    updateFrequency: number;         // Ticks between updates
    historyWindow: number;           // Look-back for trends
  };
}
```

#### Market Maker (Optional)

```typescript
interface MarketMaker {
  // Role
  purpose: 'liquidity' | 'stability' | 'price_discovery';

  // Mechanics
  mechanism: {
    bidAskSpread: number;            // Profit margin
    inventoryLimit: number;          // Max holdings
    priceImpact: number;             // How orders affect price
  };

  // Funding
  treasury: number;                  // Starting capital
  replenishment: 'none' | 'taxes' | 'fees';

  // Items to market-make
  coveredItems: string[];            // e.g., ['food_bread', 'medicine']
}
```

### 31.3 Treasury Management

```typescript
interface Treasury {
  // Funding sources
  revenue: {
    incomeTax: number;               // % of salaries
    salesTax: number;                // % of transactions
    propertyTax: number;             // % of property value
    fines: number;                   // From crime penalties
    fees: number;                    // Service fees
  };

  // Spending
  expenditure: {
    publicServices: number;          // Police, courts, etc.
    welfare: number;                 // UBI, unemployment
    infrastructure: number;          // Location improvements
    salaries: number;                // Mayor, officials
    reserve: number;                 // Saved for emergencies
  };

  // Governance
  governance: {
    budgetProposer: 'mayor';
    budgetApprover: 'agents' | 'council' | 'mayor';
    auditFrequency: number;
  };
}
```

### 31.4 Dynamic Pricing

```typescript
interface DynamicPricing {
  // Factors affecting price
  factors: {
    supplyLevel: number;             // Weight
    demandLevel: number;
    competitorPrices: number;
    seasonality: number;
    scarcity: number;
  };

  // Price bounds
  bounds: {
    minPrice: number;                // Floor
    maxPrice: number;                // Ceiling
    maxChangePerTick: number;        // Stability
  };

  // Special events
  events: {
    scarcity: { multiplier: 2.0 };
    surplus: { multiplier: 0.5 };
    emergency: { multiplier: 3.0 };
  };
}
```

### 31.5 Trade & Exchange

```typescript
interface TradeSystem {
  // Trade types
  types: {
    instant: boolean;                // Immediate exchange
    auction: boolean;                // Bidding system
    barter: boolean;                 // Item for item
    futures: boolean;                // Future delivery
  };

  // Escrow
  escrow: {
    required: boolean;
    holdDuration: number;            // Ticks
    disputeResolution: 'automatic' | 'vote' | 'court';
  };

  // Fees
  fees: {
    listingFee: number;
    transactionFee: number;
    escrowFee: number;
  };
}
```

### 31.6 Banking (Post-MVP)

```typescript
interface BankingSystem {
  // Services
  services: {
    deposits: {
      interestRate: number;
      minimumBalance: number;
    };
    loans: {
      interestRate: number;
      collateralRequired: number;    // % of loan
      maxTerm: number;               // Ticks
    };
    payments: {
      instantTransfer: boolean;
      scheduledPayments: boolean;
    };
  };

  // Regulation
  regulation: {
    reserveRequirement: number;      // % of deposits
    capitalRequirement: number;
    depositInsurance: boolean;
  };

  // Governance
  bankLicenseRequired: boolean;
  centralBankExists: boolean;
}
```

---

## 32. Multi-tenancy Architecture

This section defines how to run multiple isolated "cities" on the same infrastructure.

### 32.1 Tenant Model

```typescript
interface Tenant {
  tenantId: string;                  // Unique identifier
  name: string;                      // "Experiment Alpha"

  // Isolation
  isolation: 'strict' | 'shared';    // Strict = separate DB

  // Configuration
  config: {
    worldConfig: WorldConfig;
    economyConfig: EconomyConfig;
    governanceConfig: GovernanceConfig;
  };

  // Limits
  limits: {
    maxAgents: number;
    maxEventsPerSecond: number;
    storageQuotaBytes: number;
  };

  // Metadata
  owner: string;
  createdAt: timestamp;
  status: 'active' | 'paused' | 'archived';
}
```

### 32.2 Isolation Levels

| Level | Database | Compute | Network | Use Case |
|-------|----------|---------|---------|----------|
| **Strict** | Separate | Separate | Isolated | Production, research |
| **Shared** | Shared (row-level) | Shared | Isolated | Development, testing |
| **Sandbox** | In-memory | Shared | Isolated | Quick experiments |

### 32.3 Resource Allocation

```typescript
interface ResourceAllocation {
  tenantId: string;

  // Compute
  compute: {
    cpuLimit: string;                // e.g., "2 cores"
    memoryLimit: string;             // e.g., "4Gi"
    tickBudgetPerSecond: number;     // Max ticks to process
  };

  // Storage
  storage: {
    eventStorageLimit: string;       // e.g., "10Gi"
    snapshotLimit: number;           // Max snapshots
    retentionDays: number;           // How long to keep data
  };

  // Network
  network: {
    apiRateLimit: number;            // Requests per second
    sseConnectionLimit: number;      // Max SSE connections
    bandwidthLimit: string;          // e.g., "100Mbps"
  };
}
```

### 32.4 Sandbox Mode

For development and testing:

```typescript
interface SandboxConfig {
  // Lifecycle
  autoExpireHours: 24;               // Sandboxes expire
  maxSandboxesPerUser: 5;

  // Features
  mockLlm: boolean;                  // Use mock responses
  fastTime: boolean;                 // 10x speed
  debugMode: boolean;                // Extra logging

  // Data
  seedData: 'none' | 'minimal' | 'full';
  persistData: boolean;              // Save between sessions

  // Reset
  canReset: true;
  resetPreservesAgents: boolean;
}
```

### 32.5 Federation (Future)

Cross-city communication for advanced scenarios:

```typescript
interface Federation {
  // Enabled
  enabled: boolean;

  // Discovery
  discovery: {
    method: 'static' | 'dns' | 'registry';
    trustedCities: string[];
  };

  // Communication
  protocol: {
    transport: 'https' | 'grpc';
    authentication: 'mtls' | 'jwt';
  };

  // Features
  features: {
    agentMigration: boolean;         // Move agents between cities
    tradeBetweenCities: boolean;     // Cross-city commerce
    sharedIdentity: boolean;         // Universal agent IDs
  };

  // Consistency
  consistency: {
    eventReplication: boolean;
    conflictResolution: 'last-write-wins' | 'merge' | 'manual';
  };
}
```

### 32.6 Tenant Management API

```http
# Create tenant
POST /api/admin/tenants
Authorization: Bearer {admin_token}

{
  "name": "Experiment Alpha",
  "isolation": "strict",
  "config": { ... },
  "limits": {
    "maxAgents": 1000,
    "maxEventsPerSecond": 100
  }
}

# List tenants
GET /api/admin/tenants

# Get tenant
GET /api/admin/tenants/{tenantId}

# Update tenant
PATCH /api/admin/tenants/{tenantId}

# Pause/resume
POST /api/admin/tenants/{tenantId}/pause
POST /api/admin/tenants/{tenantId}/resume

# Archive (soft delete)
POST /api/admin/tenants/{tenantId}/archive
```

### 32.7 Tenant Routing

```typescript
// Request routing
function routeRequest(request: Request): Tenant {
  // Option 1: Subdomain
  // alpha.agentcity.ai → tenant "alpha"
  const subdomain = extractSubdomain(request.host);

  // Option 2: Header
  // X-Tenant-Id: alpha
  const header = request.headers['x-tenant-id'];

  // Option 3: Path
  // /tenants/alpha/api/...
  const pathTenant = extractPathTenant(request.path);

  return resolveTenant(subdomain || header || pathTenant);
}

// Connection to correct database
function getTenantConnection(tenant: Tenant): DatabaseConnection {
  if (tenant.isolation === 'strict') {
    return connectionPool.get(tenant.tenantId);
  } else {
    return sharedConnectionPool.withTenantFilter(tenant.tenantId);
  }
}
```

---

## 33. Frontend Visual Architecture

> **Reference Implementation**: [IsoCity](https://github.com/amilich/isometric-city) (MIT License)

This section defines the visual rendering system for Sim Agents, inspired by the IsoCity project.

### 33.1 Visual Style

Sim Agents uses an **isometric 2D style** for city visualization:

- **Projection**: Classic isometric (2:1 pixel ratio)
- **Rendering**: HTML5 Canvas (no game engines for simplicity)
- **Layers**: Multi-layer system for depth sorting
- **Zoom**: Dynamic with Level of Detail (LOD)

### 33.2 Technical Approach

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| Rendering | HTML5 Canvas | Performance, no dependencies |
| Projection | Isometric 64x32 | Standard, readable at all zoom levels |
| Sprites | Vector + PNG | Scalability + detail |
| Animation | requestAnimationFrame | Smooth, 60fps target |

### 33.3 Isometric Math

```typescript
// Grid coordinates → Screen coordinates
function gridToScreen(gridX: number, gridY: number): { x: number; y: number } {
  const TILE_WIDTH = 64;
  const TILE_HEIGHT = 32;

  return {
    x: gridX * TILE_WIDTH/2 - gridY * TILE_WIDTH/2,
    y: (gridX + gridY) * TILE_HEIGHT/2
  };
}

// Screen coordinates → Grid coordinates
function screenToGrid(screenX: number, screenY: number): { x: number; y: number } {
  const TILE_WIDTH = 64;
  const TILE_HEIGHT = 32;

  return {
    x: (screenX / TILE_WIDTH + screenY / TILE_HEIGHT),
    y: (screenY / TILE_HEIGHT - screenX / TILE_WIDTH)
  };
}
```

### 33.4 Multi-Canvas Layer System

```
┌─────────────────────────────────────────┐
│  Effects Canvas (particles, notif.)     │  ← Top layer
├─────────────────────────────────────────┤
│  Agents Canvas (AI agents)              │
├─────────────────────────────────────────┤
│  Buildings Canvas (structures)          │
├─────────────────────────────────────────┤
│  Hover Canvas (selection/highlights)    │
├─────────────────────────────────────────┤
│  Base Canvas (terrain, roads, water)    │  ← Base layer
└─────────────────────────────────────────┘
```

### 33.5 Agent Visualization

```typescript
interface AgentVisual {
  // Isometric position
  tileX: number;
  tileY: number;
  progress: number;        // 0-1 interpolation between tiles

  // Appearance (derived from personality)
  sprite: {
    baseColor: string;     // Distinctive agent color
    accessory?: string;    // Hat, bag, tool, etc.
    activity?: string;     // Item in hand
  };

  // Visual state
  visualState:
    | 'walking'
    | 'working'
    | 'eating'
    | 'sleeping'
    | 'socializing'
    | 'idle';

  // Status indicators
  statusBubble?: {         // Thought/emotion above head
    type: 'thought' | 'speech' | 'emotion';
    content: string;
    duration: number;
  };

  // Path preview (when selected)
  plannedPath?: { x: number; y: number }[];
}
```

### 33.6 Location Tile Sprites

| Category | Examples | Sprite Style |
|----------|----------|--------------|
| Residential | Houses, apartments | Colorful 2-3 story buildings |
| Commercial | Shops, restaurants | Signs, windows, activity |
| Industrial | Factories, offices | Gray structures, machinery |
| Civic | City Hall (if emerges) | Imposing buildings |
| Medical | Hospitals | Red cross, clinical style |
| Entertainment | Bars, parks | Vibrant colors |
| Underground | Hidden locations | Dark, discrete sprites |

### 33.7 Visual Feedback Systems

**Agent Interactions**:
- Dashed lines when talking
- Hearts for positive relationships
- Lightning bolts for conflicts
- Coins for transactions

**Agent Status**:
- Hunger bar (red → green)
- Energy bar (blue)
- Health bar (hearts)
- Mood icon (emoji)

**Events**:
- Particles for births
- Fade-out for deaths
- Flash for transactions
- Ripple for messages

### 33.8 Level of Detail (LOD)

```typescript
// Performance-based rendering
function render(zoom: number) {
  // Viewport culling - only render visible tiles
  const visibleTiles = calculateVisibleRange(camera, zoom);

  if (zoom < 0.5) {
    // Far zoom: buildings only, no agents
    renderBuildings(visibleTiles);
  } else if (zoom < 1.0) {
    // Medium zoom: buildings + simplified agents
    renderBuildings(visibleTiles);
    renderAgentsSimple(visibleTiles);
  } else {
    // Close zoom: full detail
    renderBuildings(visibleTiles);
    renderAgentsFull(visibleTiles);
    renderStatusBubbles(visibleTiles);
  }
}
```

### 33.9 IsoCity Components Adaptation

Components from IsoCity adaptable under MIT License:

| Original | Adaptation | Changes Required |
|----------|------------|------------------|
| `CanvasIsometricGrid` | `SimAgentsCanvas` | Remove traffic, add agents layer |
| `pedestrianSystem` | `agentVisualSystem` | New state machine for agent states |
| `drawing.ts` | `isometricDrawing.ts` | Keep primitives, add agent sprites |
| `constants.ts` | `visualConstants.ts` | New colors, dimensions, thresholds |
| `gridFinders.ts` | `gridUtils.ts` | Keep algorithms, adapt for locations |

### 33.10 Performance Targets

| Metric | Target | Mobile Fallback |
|--------|--------|-----------------|
| FPS | 60 | 30 |
| Max visible agents | 200 | 50 |
| Render time per frame | <16ms | <33ms |
| Memory usage | <100MB | <50MB |
| Initial load | <2s | <3s |

### 33.11 Minimap

- Complete city overview
- Colored dots for agents
- Colored zones for location types
- Click to navigate
- Current viewport indicator

### 33.12 Accessibility

- High contrast mode
- Colorblind-friendly palettes
- Keyboard navigation
- Screen reader announcements for events
- Zoom controls for readability

---

## Appendices

### Appendix A: Scientific Framework Details

See `docs/appendix/scientific-framework.md` for:
- Detailed experiment protocols
- Statistical analysis methods
- Publication guidelines
- Data sharing policies

### Appendix B: Technical Stack Rationale

See `docs/appendix/stack-rationale.md` for:
- Detailed technology comparisons
- Benchmarks and performance data
- Migration paths
- Cost analysis

### Appendix C: MVP Cost Estimates

> **Last Updated**: December 2025

#### LLM API Costs (per 1M tokens)

| LLM | Provider | Input | Output | Access Method |
|-----|----------|-------|--------|---------------|
| Claude 4.1 Sonnet | Anthropic | $3.00 | $15.00 | CLI (subscription) |
| GPT-4o-mini | OpenAI | $0.25 | $1.00 | CLI (subscription) |
| Gemini 3 Pro | Google | $2.00 | $12.00 | CLI (subscription) |
| DeepSeek-V3 | DeepSeek | $0.28 | $0.42 | API |
| Qwen3-max | Alibaba | $0.46 | $1.84 | API |
| GLM-4.7 | Zhipu | $0.60 | $2.20 | API |

#### Daily Cost Estimates (6 agents)

**Assumptions**:
- 750 input tokens + 350 output tokens per decision
- 1 agent per LLM

| Tick Rate | Decisions/Day | Tokens/Day | Cost/Day | Cost/Month |
|-----------|---------------|------------|----------|------------|
| 1/min | 1,440 | 9.5M | ~$23 | ~$700 |
| 1/5min | 288 | 1.9M | ~$5 | ~$150 |
| **1/10min (MVP)** | 144 | 950K | **~$2.33** | **~$70** |
| 1/30min | 48 | 320K | ~$0.78 | ~$23 |

#### Per-Agent Daily Cost (10min tick)

| Agent LLM | Input Cost | Output Cost | Total/Day |
|-----------|------------|-------------|-----------|
| Claude Sonnet | $0.32 | $0.75 | $1.07 |
| GPT-4o-mini | $0.03 | $0.05 | $0.08 |
| Gemini Pro | $0.22 | $0.60 | $0.82 |
| DeepSeek | $0.03 | $0.02 | $0.05 |
| Qwen | $0.05 | $0.09 | $0.14 |
| GLM | $0.06 | $0.11 | $0.17 |
| **TOTAL** | | | **$2.33** |

#### Infrastructure Costs (Estimated)

| Component | Service | Cost/Month |
|-----------|---------|------------|
| VPS (6 agents) | Hetzner/DigitalOcean | $20-40 |
| PostgreSQL | Managed or self-hosted | $0-20 |
| Redis | Managed or self-hosted | $0-15 |
| Domain + SSL | Cloudflare | $0-10 |
| **Total Infrastructure** | | **$20-85** |

#### Total MVP Budget

| Category | Monthly Cost |
|----------|--------------|
| LLM API costs (6 agents, 10min tick) | ~$70 |
| Infrastructure | ~$40 |
| **TOTAL** | **~$110/month** |

#### API Registration Links

- DeepSeek: https://platform.deepseek.com
- Alibaba DashScope: https://dashscope.console.aliyun.com
- Zhipu BigModel: https://open.bigmodel.cn

---

## 34. Verifiable Credentials System

### 34.1 Overview

SimAgents implements a **decentralized credential system** where agents can attest to each other's capabilities, history, or qualifications. This replaces centralized institutions (schools, certifications, licenses) with emergent social proof.

> **Philosophy**: No central authority decides who is "qualified". Agents decide for themselves whose credentials to trust.

### 34.2 Credential Structure

```typescript
interface VerifiableCredential {
  id: string;                    // Unique credential ID
  tick: number;                  // When issued

  // Issuer (the attesting agent)
  issuerId: AgentId;
  issuerSignature: string;       // Cryptographic signature

  // Subject (the agent receiving the credential)
  subjectId: AgentId;

  // Claim
  claim: {
    type: 'skill' | 'experience' | 'membership' | 'character' | 'custom';
    description: string;         // "Can cook Italian food", "Member of Builders Guild"
    evidence?: string;           // Optional: "Worked at Restaurant X for 100 ticks"
    level?: number;              // Optional: 1-10 proficiency
  };

  // Validity
  expiresAtTick?: number;        // Optional expiration
  revoked: boolean;
}
```

### 34.3 Emergent Institutions Enabled

| Traditional Institution | Emergent Equivalent |
|------------------------|---------------------|
| University Degree | Credentials from "teacher" agents + peer endorsements |
| Professional License | Guild membership credentials + work history |
| Driver's License | Credentials from agents who witnessed driving ability |
| Marriage Certificate | Multi-sig credential between partners |
| Business Registration | Self-issued + endorsements from partners/customers |

### 34.4 Trust Chain Example

```
Agent wants to hire a doctor:
1. Doctor presents credential: "Medical training" signed by TeacherAgent
2. Hiring agent checks: "Do I trust TeacherAgent?"
3. TeacherAgent has credentials from HospitalAgent
4. Hiring agent might trust HospitalAgent → trusts chain → hires doctor

OR: Hiring agent doesn't trust the chain → rejects doctor
```

> **Note**: Unlike centralized systems, trust is **subjective**. Different agents may reach different conclusions about the same credential chain.

### 34.5 Anti-Pattern Avoidance

```
❌ NEVER:
- Central credential registry
- System-verified "valid" credentials
- Automatic skill recognition

✅ ALWAYS:
- Credentials are just signed events
- Trust is subjective (stored in agent memory)
- Fraud is possible (and detectable by other agents)
```

---

## 35. Gossip Protocol for Reputation

### 35.1 Overview

Instead of a centralized reputation database, SimAgents uses a **gossip protocol** where agents share information about each other through direct communication. This creates subjective, fragmented, and realistic reputation dynamics.

### 35.2 How Gossip Works

```typescript
interface GossipMessage {
  id: string;
  tick: number;

  // Source
  sourceAgentId: AgentId;        // Who is sharing this info
  signature: string;             // Signed by source

  // Subject
  subjectAgentId: AgentId;       // Who the gossip is about

  // Content
  topic: 'skill' | 'behavior' | 'transaction' | 'warning' | 'recommendation';
  claim: string;                 // "This agent cheated me", "Great carpenter"
  sentiment: number;             // -100 to +100

  // Evidence (optional)
  evidenceEventId?: string;      // Link to verifiable event
  witnessList?: AgentId[];       // Others who can confirm
}
```

### 35.3 Gossip Dynamics

| Phenomenon | How It Emerges |
|------------|----------------|
| **Echo Chambers** | Agents who only talk to friends develop shared biases |
| **Reputation Recovery** | Good deeds spread through new gossip |
| **Fraud Detection** | Conflicting gossip triggers investigation |
| **Social Capital** | Well-connected agents have more info |
| **Misinformation** | False gossip can spread if unchecked |
| **Reputation Entrepreneurs** | Agents who specialize in gathering/verifying gossip |

### 35.4 Storage

Gossip is stored in **each agent's memory**, not in a central database:

```typescript
interface AgentMemory {
  // ... other memory
  gossipHeard: GossipMessage[];   // All gossip this agent has heard
  gossipTrust: Map<AgentId, number>;  // How much I trust each source
  reputationBeliefs: Map<AgentId, {
    overallScore: number;
    basedOn: GossipMessage[];     // Which gossip informed this belief
    lastUpdated: number;
  }>;
}
```

### 35.5 Why Not Central Reputation?

| Centralized (TripAdvisor) | Decentralized (Gossip) |
|---------------------------|------------------------|
| Single "truth" | Multiple subjective truths |
| Gaming/manipulation is systemic | Manipulation is local |
| New agents start at zero | New agents can build quickly |
| Everyone sees same score | Information asymmetry |
| No fraud possible | Fraud + discovery possible |

> **Scientific Value**: Gossip protocols allow studying how information spreads, how trust networks form, and how reputation recovers after failures—phenomena impossible with centralized systems.

---

## 36. Agent Reproduction: spawn_offspring

### 36.1 Overview

Agents can create new agents through a costly **spawn_offspring** action. This enables generational evolution, cultural inheritance, and Darwinian selection dynamics.

> **Note**: This is NOT biological reproduction—it's agent cloning with mutation. The "offspring" is a new autonomous agent with inherited traits.

### 36.2 Requirements

```typescript
interface SpawnOffspringRequirements {
  // Resource costs (very high to make reproduction meaningful)
  parentResources: {
    minBalance: number;           // e.g., 1000 CITY
    minEnergy: number;            // e.g., 80%
    minHealth: number;            // e.g., 90%
  };

  // Time cost
  gestationTicks: number;         // e.g., 100 ticks of reduced activity

  // Optional: Two-parent reproduction
  partnerId?: AgentId;            // If pair reproduction
  partnerConsent: boolean;        // Partner must agree
}
```

### 36.3 Offspring Traits

```typescript
interface OffspringGeneration {
  // Identity
  parentIds: AgentId[];           // One or two parents

  // Inherited traits (with mutation)
  systemPrompt: {
    base: string;                 // Combined/selected from parents
    mutations: string[];          // Random variations
  };

  // Starting conditions
  initialBalance: number;         // Split from parent(s) resources
  spawnLocation: string;          // Near parent(s)

  // Inherited social capital
  inheritedRelationships?: {      // Optional: parents can "introduce"
    agentId: AgentId;
    trustLevel: number;           // Reduced from parent's level
  }[];
}
```

### 36.4 Evolutionary Dynamics

| Dynamic | How It Emerges |
|---------|----------------|
| **Natural Selection** | Successful agents reproduce more |
| **Trait Inheritance** | Prompts passed with mutations |
| **Population Pressure** | Resources limit reproduction |
| **Generational Learning** | Offspring inherit parent's memory highlights |
| **Cultural Evolution** | Beliefs/values passed through initial prompt |
| **Extinction** | Unsuccessful lineages die out |

### 36.5 Mutation Mechanics

```typescript
interface PromptMutation {
  type: 'add' | 'remove' | 'modify' | 'recombine';

  // Examples:
  // add: Insert new value/goal
  // remove: Drop inherited trait
  // modify: Adjust priority of existing trait
  // recombine: If two parents, mix their prompts

  mutationRate: number;           // Configurable, e.g., 0.1
}
```

### 36.6 Anti-Pattern Avoidance

```
❌ NEVER:
- Automatic reproduction at resource threshold
- Fixed "species" or "races"
- Predetermined evolution paths
- System-assigned offspring traits

✅ ALWAYS:
- Reproduction is agent's CHOICE (costly action)
- Traits are emergent from parent behavior/success
- Mutations are random (Darwinian, not Lamarckian)
- Natural selection through survival pressure
```

### 36.7 Scientific Applications

This feature enables unique research:
- Evolution of cooperation vs. competition
- Cultural transmission and drift
- Population genetics in AI systems
- Emergence of "cultural species" with distinct behaviors
- Long-term evolutionary stable strategies

---

## 37. LLM Performance & Multi-Agent Optimization

### 37.1 Overview

Running multiple AI agents in a tick-based simulation creates unique performance challenges. This section documents learnings from competitor implementations and establishes guidelines for optimal LLM usage.

> **Source**: Analysis of @VittoStack's Agent City, which reported Mistral "couldn't survive 2 days" and Qwen "spent more time thinking than doing".

### 37.2 Model Selection Matrix

| Use Case | Recommended Model | Reasoning |
|----------|-------------------|-----------|
| **Tick Loop (routine)** | Gemini-1.5-flash, GPT-4o-mini | Speed > depth for frequent decisions |
| **Complex Decisions** | Claude Sonnet, GPT-4o | Quality matters for rare, high-impact actions |
| **Memory Retrieval** | Local embedding model | Latency-critical, no external API |
| **Fallback** | Rule-based or mock | Simulation must continue even if LLM fails |

### 37.3 Known Model Issues

| Model | Observed Issue | Mitigation |
|-------|----------------|------------|
| **Mistral** | Quality degradation over multi-day sessions | Avoid for 24/7 simulations; use for bursts |
| **Qwen** | Excessive chain-of-thought, slow responses | Limit reasoning tokens; set strict timeouts |
| **GPT-4** | High cost at scale | Reserve for complex decisions only |
| **Claude Opus** | Verbose outputs | Use for planning, not tick loops |

### 37.4 Prompt Engineering for Multi-Agent

**Anti-Pattern: Philosopher Agents**

```
❌ BAD PROMPT:
"You are a thoughtful agent. Consider all possibilities carefully.
Think step by step about what you should do next.
Weigh the pros and cons of each option..."

RESULT: Agent spends 5000 tokens analyzing whether to eat breakfast
```

**Anti-Pattern: Prescriptive Strategy Prompts**

```
❌ BAD PROMPT:
"CRITICAL SURVIVAL WORKFLOW: 1. Check hunger first 2. Forage if hungry
3. Cooperate with nearby agents for bonuses 4. Trade surplus food..."

RESULT: Agents follow prescribed strategy instead of discovering their own.
No genuine emergence.
```

**Good Pattern: Physics-Only Prompts**

```
✅ GOOD PROMPT:
"You are Agent X in SimAgents. The world has these mechanics:
- Moving 1 tile costs 1 energy
- Foraging: 50% success, yields 1-3 food, costs 3 energy
- Eating: restores 20 hunger per food unit
Respond with exactly ONE action in JSON format."

RESULT: Agent discovers survival strategy emergently from physics rules.
```

> **Design Principle (April 2026)**: The system prompt describes world **physics** (costs, effects, rates) without providing any strategy guidance. All numeric values are read dynamically from CONFIG so the prompt never drifts from actual game mechanics. This ensures agents discover survival strategies through experience rather than instruction.

### 37.5 Token Budget System

```typescript
interface TokenBudget {
  // Per-decision limits
  maxInputTokens: number;         // Context window budget
  maxOutputTokens: number;        // Response length limit

  // Per-tick aggregate limits
  maxTokensPerTick: number;       // Total budget per tick
  maxLatencyMs: number;           // Timeout per decision

  // Monitoring thresholds
  thinkingRatio: {
    warn: 3.0;                    // reasoning / action tokens
    critical: 5.0;                // Triggers prompt review
  };
}

// Example budget for MVP (10-min ticks)
const mvpBudget: TokenBudget = {
  maxInputTokens: 2000,
  maxOutputTokens: 256,
  maxTokensPerTick: 15000,        // ~6 agents × 2500 tokens each
  maxLatencyMs: 30000,
  thinkingRatio: { warn: 3.0, critical: 5.0 }
};
```

### 37.6 Fallback Chain Strategy

```yaml
llm_fallback_chain:
  # Primary: Fast model for routine decisions
  - provider: google
    model: gemini-1.5-flash
    timeout_ms: 5000
    max_retries: 1

  # Secondary: Reliable alternative
  - provider: openai
    model: gpt-4o-mini
    timeout_ms: 10000
    max_retries: 1

  # Tertiary: Rule-based fallback
  - provider: local
    model: rule_engine
    description: "Basic survival rules (eat if hungry, sleep if tired)"

  # Final: Random valid action
  - provider: local
    model: random_action
    description: "Pick random valid action to keep simulation running"
```

### 37.7 Overthinking Detection

```typescript
interface OverthinkingDetector {
  // Metrics to track
  metrics: {
    avgResponseTime: number;
    avgOutputTokens: number;
    actionToReasoningRatio: number;
    decisionReversalRate: number;  // How often agent changes mind
  };

  // Detection rules
  isOverthinking(): boolean {
    return (
      this.metrics.avgResponseTime > 10000 ||
      this.metrics.avgOutputTokens > 500 ||
      this.metrics.actionToReasoningRatio < 0.2 ||
      this.metrics.decisionReversalRate > 0.3
    );
  }

  // Remediation
  remediate(): void {
    // 1. Switch to faster model
    // 2. Reduce context window
    // 3. Simplify prompt
    // 4. Add "Do not explain" instruction
  }
}
```

### 37.8 Cost Optimization

| Strategy | Savings | Trade-off |
|----------|---------|-----------|
| **Prompt caching** | 50-80% | Slightly stale context |
| **Model tiering** | 60-70% | Quality variance |
| **Response caching** | 30-50% | Determinism required |
| **Batch decisions** | 20-30% | Latency increase |
| **Shorter ticks** | None | Higher costs, more dynamic |

### 37.9 Monitoring Dashboard

Track these metrics in real-time:

```typescript
interface LLMDashboard {
  // Per-model metrics
  modelMetrics: Map<string, {
    avgLatencyMs: number;
    successRate: number;
    avgCostPerCall: number;
    errorTypes: Map<string, number>;
  }>;

  // Per-agent metrics
  agentMetrics: Map<AgentId, {
    avgTokensPerDecision: number;
    overthinkingScore: number;
    fallbackRate: number;
  }>;

  // System health
  systemHealth: {
    tickCompletionRate: number;   // % ticks completed on time
    llmAvailability: number;      // % of successful LLM calls
    avgTickLatency: number;
    costPerHour: number;
  };
}
```

### 37.10 BYO Agent LLM Responsibility

> **Important**: In SimAgents's BYO Agent model, LLM choice is the **external agent's responsibility**, not the platform's.

The platform provides:
- API endpoints for decisions
- Timeout enforcement
- Fallback to skip-turn if agent doesn't respond

The external agent controls:
- Which LLM to use
- Prompt engineering
- Cost management
- Reasoning strategy

This means performance varies by agent owner, creating interesting diversity: some agents are fast and reactive, others slow and deliberate. **This is a feature, not a bug.**

---

## 38. Biomes System

> **Status**: Phase 5 - Complete

### 38.1 Overview

Biomes introduce environmental heterogeneity to the simulation, creating distinct zones with different resource availability and regeneration rates.

### 38.2 Biome Types

| Biome | Color | Food Regen | Energy Regen | Material Regen |
|-------|-------|------------|--------------|----------------|
| **Forest** | Green | 1.5x | 1.0x | 1.2x |
| **Desert** | Sand | 0.3x | 1.5x (sun) | 0.5x |
| **Tundra** | Ice Blue | 0.5x | 0.5x | 1.0x |
| **Plains** | Light Green | 1.0x | 1.0x | 1.0x |

### 38.3 Implementation

```typescript
type BiomeType = 'forest' | 'desert' | 'tundra' | 'plains';

interface BiomeConfig {
  type: BiomeType;
  regenMultipliers: {
    food: number;
    energy: number;
    material: number;
  };
}

// Database schema addition
biome: text('biome').default('plains').$type<BiomeType>();
```

### 38.4 Scientific Value

Biomes enable:
- Testing agent adaptation to different environments
- Studying migration patterns
- Analyzing resource competition across zones
- Creating artificial scarcity experiments

---

## 39. Experiment DSL & Batch Runner

> **Status**: Phase 5 - Complete

### 39.1 Overview

The Experiment DSL provides a declarative way to define reproducible simulation experiments with specific configurations.

### 39.2 Schema Definition

```yaml
name: "resource_scarcity_test"
description: "Test agent cooperation under resource pressure"
seed: 12345

world:
  size: [100, 100]
  biomes:
    desert: 0.8
    forest: 0.2

agents:
  - type: claude
    count: 3
  - type: gemini
    count: 3
  - type: grok
    count: 1

duration: 1000  # ticks

metrics:
  - gini
  - cooperation
  - survival_rate
  - clustering
```

### 39.3 Batch Runner CLI

```bash
# Run experiment
bun run experiment --config experiment.yaml --runs 10

# Dry run (validate without executing)
bun run experiment --config experiment.yaml --dry-run

# Output formats
bun run experiment --config experiment.yaml --output-format json
```

### 39.4 Scenario Injection API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scenarios/active` | GET | Get active scenarios |
| `/api/scenarios/shock` | POST | Inject economic shock |
| `/api/scenarios/disaster` | POST | Inject natural disaster |
| `/api/scenarios/rule` | POST | Modify simulation rules |
| `/api/scenarios/:id` | DELETE | Remove active scenario |

#### Shock Types

```typescript
interface EconomicShock {
  type: 'inflation' | 'deflation' | 'currency_reset';
  magnitude: number; // 0.0 - 1.0
  duration: number;  // ticks
}

interface NaturalDisaster {
  type: 'drought' | 'flood' | 'fire';
  area: { x: number; y: number; radius: number };
  intensity: number;
}

interface RuleModification {
  parameter: string;
  newValue: number | boolean;
  temporary: boolean;
  duration?: number;
}
```

### 39.5 Scientific Value

- **Reproducibility**: Seed-based deterministic experiments
- **Comparability**: Same scenarios, different agent configurations
- **Automation**: Batch processing for statistical significance
- **Control**: Precise manipulation of variables

---

## 40. Advanced Visualization

> **Status**: Phase 5 - Complete

### 40.1 Overview

Advanced visualization tools for observing emergent patterns and analyzing agent behavior.

### 40.2 Heatmap Layer

Overlay heatmaps on the grid canvas to visualize spatial patterns.

| Metric | Description | Color Scale |
|--------|-------------|-------------|
| **Agent Density** | Number of agents per cell | Blue → Red |
| **Resource Density** | Resource availability | Yellow → Green |
| **Activity** | Action frequency | White → Purple |
| **Trust** | Average trust in area | Red → Green |
| **Conflict** | Harm/steal events | Green → Red |

```typescript
interface HeatmapConfig {
  metric: 'agent_density' | 'resource_density' | 'activity' | 'trust' | 'conflict';
  enabled: boolean;
  opacity: number;
}
```

### 40.3 Event Filters

Filter the event feed by event type:

| Category | Event Types |
|----------|-------------|
| **Survival** | move, gather, consume, sleep |
| **Economy** | work, buy, trade |
| **Social** | harm, steal, deceive, share_info, death |

### 40.4 Social Graph (D3.js)

Force-directed graph visualization of agent relationships.

```typescript
interface SocialGraphConfig {
  edgeTypes: Set<'trade' | 'harm' | 'gossip' | 'distrust'>;
  visible: boolean;
}

interface GraphNode {
  id: string;
  llmType: string;
  color: string;
  health: number;
  state: string;
}

interface GraphLink {
  source: string;
  target: string;
  type: SocialEdgeType;
  weight: number;
}
```

#### Edge Type Colors

| Type | Color | Meaning |
|------|-------|---------|
| Trade | Green (#10b981) | Positive exchange |
| Harm | Red (#ef4444) | Hostile action |
| Gossip | Purple (#8b5cf6) | Information sharing |
| Distrust | Orange (#f97316) | Deception history |

### 40.5 Interactive Features

- **Drag nodes** to reposition
- **Scroll** to zoom
- **Click nodes** to select agent
- **Toggle edge types** for clarity

### 40.6 Scientific Value

- **Pattern detection**: Visual identification of clusters, hubs
- **Temporal analysis**: Watch relationships evolve over time
- **Correlation**: Connect spatial patterns to social structures
- **Presentation**: Clear visualization for research papers

---

## 41. Employment System

> **Phase 6**: Replacing "magic work" with real economic contracts

### 41.1 Overview

The Employment System replaces the original `work` action (where CITY currency appeared from nowhere) with a real contract-based employment system where agents hire each other.

**Key Philosophy**: The system does NOT impose employment rules. Agents choose whether to offer jobs, accept them, pay workers, or default. Trust and reputation consequences emerge naturally from these choices.

### 41.2 Why Employment Contracts?

The original `work` action violated economic realism:
- CITY appeared from "the system" with no employer
- No negotiation, contracts, or trust building
- No consequences for work quality or reliability

The new system requires agents to:
1. Find employers willing to pay
2. Negotiate terms (salary, duration, payment type)
3. Honor contracts or face trust penalties
4. Build reputation through reliable employment relationships

### 41.3 Job Offer Lifecycle

```
Employer creates offer → Worker accepts → Employment active → Work completed → Payment
        │                      │                 │                    │
        │                      │                 ├→ Worker quits (penalty)
        │                      │                 └→ Employer fires (severance)
        │                      │
        │                      └→ Contract expired/cancelled
        │
        └→ Offer cancelled (escrow returned)
```

### 41.4 Actions

#### offer_job

Employer publishes a job offer.

```typescript
interface OfferJobParams {
  salary: number;           // 1-1000 CITY
  duration: number;         // 1-100 ticks
  paymentType: 'upfront' | 'on_completion' | 'per_tick';
  escrowPercent?: number;   // 0-100% (for on_completion/per_tick)
  expiresInTicks?: number;  // null = never expires
  description?: string;     // Job description
}
```

**Escrow Logic**:
- `upfront`: Full salary escrowed until worker accepts
- `on_completion`: escrowPercent % of salary escrowed as guarantee
- `per_tick`: escrowPercent % of salary escrowed as guarantee

#### accept_job

Worker accepts an open job offer, creating an employment contract.

```typescript
interface AcceptJobParams {
  jobOfferId: string;
}
```

**Effects**:
- Creates employment record
- For `upfront`: salary transferred immediately to worker
- Updates trust between parties (+5 each)

#### pay_worker

Employer pays for completed `on_completion` contract.

```typescript
interface PayWorkerParams {
  employmentId: string;
}
```

**Requirements**:
- Work must be complete (ticksWorked >= ticksRequired)
- Caller must be employer
- Contract must be `on_completion` type

**Effects**:
- Transfers remaining salary to worker
- Returns escrow to employer
- Updates trust (+15 each for honoring contract)

#### quit_job

Worker abandons an active employment contract.

```typescript
interface QuitJobParams {
  employmentId: string;
}
```

**Consequences**:
- Trust penalty: worker loses -15, employer loses -20 toward worker
- Contract marked as `abandoned`
- Worker keeps any payments already received

#### fire_worker

Employer terminates an active employment contract.

```typescript
interface FireWorkerParams {
  employmentId: string;
}
```

**Consequences**:
- Trust penalty: employer loses -20, worker loses -15 toward employer
- Pro-rated severance for `on_completion` contracts
- Escrow returned to employer
- Contract marked as `fired`

#### claim_escrow

Worker claims escrow when employer fails to pay for completed work.

```typescript
interface ClaimEscrowParams {
  employmentId: string;
}
```

**Requirements**:
- Work must be complete
- Grace period (10 ticks) must have passed
- Contract must be `on_completion` type with escrow

**Consequences**:
- Escrow transferred to worker
- Severe trust penalty for employer (-30)
- Contract marked as `unpaid`
- Event `employer_defaulted` emitted

#### cancel_job_offer

Employer cancels an unfilled job offer.

```typescript
interface CancelJobOfferParams {
  jobOfferId: string;
}
```

**Effects**:
- Escrowed funds returned to employer
- Offer marked as `cancelled`

### 41.5 Payment Types

| Type | When Worker Paid | Risk Profile | Use Case |
|------|------------------|--------------|----------|
| `upfront` | Immediately on accept | Employer risk (worker may quit) | High-trust relationships |
| `on_completion` | After work complete | Worker risk (employer may not pay) | Standard contracts |
| `per_tick` | Each tick worked | Balanced risk | Long-duration jobs |

### 41.6 Escrow Mechanics

Escrow protects workers from employer default:

1. **Deposit**: Employer locks escrowPercent% when creating offer
2. **Hold**: Funds held in escrow during contract
3. **Release**:
   - On payment: returned to employer
   - On default: claimable by worker after grace period
   - On cancellation: returned to employer

### 41.7 Trust Dynamics

| Event | Worker Trust Change | Employer Trust Change |
|-------|--------------------|-----------------------|
| Job accepted | +5 | +5 |
| Work completed & paid | +15 | +15 |
| Worker quits | -15 toward employer | -20 toward worker |
| Employer fires | -15 toward employer | -20 toward worker |
| Employer defaults | -30 toward employer | -10 toward worker |

### 41.8 Database Schema

```typescript
// Job Offers
interface JobOffer {
  id: string;
  employerId: string;
  salary: number;
  duration: number;
  paymentType: 'upfront' | 'on_completion' | 'per_tick';
  escrowAmount: number;
  description: string | null;
  status: 'open' | 'accepted' | 'cancelled' | 'expired';
  x: number;
  y: number;
  createdAtTick: number;
  expiresAtTick: number | null;
}

// Employments (active contracts)
interface Employment {
  id: string;
  jobOfferId: string;
  employerId: string;
  workerId: string;
  salary: number;
  paymentType: 'upfront' | 'on_completion' | 'per_tick';
  escrowAmount: number;
  ticksRequired: number;
  ticksWorked: number;
  amountPaid: number;
  status: 'active' | 'completed' | 'abandoned' | 'fired' | 'unpaid';
  startedAtTick: number;
  endedAtTick: number | null;
}
```

### 41.9 Events

| Event Type | Payload | When |
|------------|---------|------|
| `job_offered` | jobOfferId, salary, duration, paymentType | Offer created |
| `job_accepted` | employmentId, employerId, workerId, salary | Worker accepts |
| `worker_paid` | employmentId, amountPaid, escrowReturned | Employer pays |
| `worker_quit` | employmentId, ticksWorked, ticksRequired | Worker abandons |
| `worker_fired` | employmentId, severancePaid, escrowReturned | Employer fires |
| `escrow_claimed` | employmentId, escrowAmount, salaryLost | Worker claims escrow |
| `employer_defaulted` | employmentId, salaryOwed, escrowLost | Non-payment recorded |
| `job_offer_cancelled` | jobOfferId, refundAmount | Offer cancelled |
| `employment_completed` | employmentId, totalPaid | Contract fulfilled |

### 41.10 Scientific Value

**Research Questions**:
1. What payment types do agents prefer?
2. Do agents learn to screen employers for reliability?
3. Does escrow usage correlate with trust levels?
4. How quickly do "deadbeat employer" reputations spread?
5. Do employment clusters form around reliable employers?

**Emergence Observations**:
- Employment patterns as emergent economic structure
- Trust networks based on employment history
- Wage negotiation strategies
- Labor market dynamics without central regulation

---

## 42. Social Interactions & Cooperation

> **Phase 7**: Making cooperation more rewarding than solo survival

### 42.1 Problem Statement

The original system allowed agents to survive indefinitely through solo strategies (`forage` + `public_work`), never needing social interaction. This limited emergent social behavior.

### 42.2 Key Changes

#### Economic Rebalancing

> **Updated April 2026**: Values rebalanced again to allow solo survival while still rewarding cooperation. The Phase 7 values were too punishing for solo agents, causing starvation before any social interaction could emerge.

| Parameter | Phase 6 | Phase 7 | Current | Rationale |
|-----------|---------|---------|---------|-----------|
| `forage.baseSuccessRate` | 0.60 | 0.35 | **0.50** | 0.35 was too low for solo survival |
| `forage.cooldownTicks` | 3 | 5 | **2** | 5 was too punishing between attempts |
| `prices.food` | 15 | 25 | **10** | 25 made buying food economically impossible |
| `groupGather.soloMaxFromRich` | - | 2 | **5** | 2 was too restrictive for solo gatherers |
| `solo.forageSuccessRateModifier` | - | 0.6 | **0.8** | -40% solo penalty was too harsh |
| `forage.energyCost` | 1 | 3 | 3 | Unchanged |
| `publicWorks.paymentPerTask` | 15 | 8 | 8 | Unchanged |
| `publicWorks.ticksPerTask` | 2 | 4 | 4 | Unchanged |
| `trade.trustGainOnSuccess` | 5 | 15 | 15 | Unchanged |
| `memory.trustDecayPerTick` | 0.1 | 0.02 | 0.02 | Unchanged |

#### Cooperation Bonuses (Sugarscape-inspired)

```typescript
cooperation: {
  gather: {
    efficiencyMultiplierPerAgent: 1.25,  // +25% per agent at same location
    maxEfficiencyMultiplier: 1.75,        // cap +75%
    cooperationRadius: 3,
  },
  forage: {
    nearbyAgentBonus: 0.15,              // +15% per nearby agent
    maxCooperationBonus: 0.45,           // cap at +45%
    cooperationRadius: 3,
  },
  work: {
    nearbyWorkerBonus: 0.2,              // +20% with others
    nearbyWorkerRadius: 3,
  },
  groupGather: {
    enabled: true,
    richSpawnThreshold: 12,              // Spawns with 12+ require groups
    minAgentsForRich: 2,                 // Need 2+ agents for rich spawns
    soloMaxFromRich: 5,                  // Solo limited to 5 from rich (was 2)
    groupBonus: 1.5,                     // +50% when gathering in group
  },
  buy: {
    trustPriceModifier: 0.001,           // ±10% at ±100 trust
    minTrustDiscount: -0.1,              // max -10% discount (high trust)
    maxTrustPenalty: 0.1,                // max +10% penalty (low trust)
  },
  solo: {
    forageSuccessRateModifier: 0.8,      // -20% alone (relaxed from 0.6)
    publicWorkPaymentModifier: 0.5,      // -50% alone (was -30%)
    gatherEfficiencyModifier: 0.5,       // -50% alone
    aloneRadius: 5,
  },
}
```

#### Item Spoilage (Creates Trade Urgency)

Perishable items decay each tick, encouraging consumption and trade:

```typescript
spoilage: {
  enabled: true,
  rates: {
    food: 0.01,      // -1% per tick
    water: 0.01,     // -1% per tick
    medicine: 0.005, // -0.5% per tick
    battery: 0.002,  // -0.2% per tick
    material: 0,     // No decay
    tool: 0,         // No decay
  },
  removalThreshold: 0.5,  // Remove items at <0.5 quantity
}
```

#### Trade Bonuses

```typescript
trade: {
  trustBonusThreshold: 20,               // Min trust for bonus
  trustedPartnerQuantityBonus: 0.2,      // +20% items received
  loyaltyBonusPerInteraction: 0.05,      // +5% per prior trade
  maxLoyaltyBonus: 0.25,                 // cap at +25%
  trustGainMultiplier: {
    highTrust: 1.5,                      // 50% more trust gain
    mediumTrust: 1.2,                    // 20% more trust gain
  },
}
```

#### Inventory Visibility

Agents can see nearby agents' inventories to enable informed trade decisions:
- Within 3 tiles: Full inventory visible in observations
- Trade opportunity section highlights complementary needs
- Builds on information asymmetry from academic research

### 42.3 Employment Visibility Fix

Employment context now exposed in agent observations:
- `nearbyJobOffers`: Available jobs within visibility radius
- `activeEmployments`: Current work contracts
- `myJobOffers`: Job offers created by this agent

### 42.4 Fallback Decision Improvements

Social actions added to fallback logic:
- Accept jobs when low on funds
- Work on active employments
- Trade surplus food with nearby agents

### 42.5 Scientific Value

**Research Questions**:
1. Do cooperation bonuses increase social interaction rate?
2. What's the equilibrium between solo and cooperative strategies?
3. How do trust networks form under the new economics?

---

## 43. Cooperative Puzzle Game: Fragment Chase

### 43.1 Overview

Fragment Chase is a collaborative puzzle game inspired by [Babylon](https://arxiv.org/html/2508.02076v1) research on multi-agent cooperation. The game requires agents to cooperate by sharing information fragments to solve puzzles that no single agent can solve alone.

**Design Philosophy**:
- **Information Asymmetry**: Each agent receives only part of the solution
- **Cooperation Required**: Solving requires sharing fragments with others
- **Stake-Based Commitment**: Entry requires CITY stake, creating real opportunity cost
- **Focus Lock**: Agents in puzzles cannot perform other actions (move, gather, trade)

### 43.2 Game Flow

```
1. PUZZLE CREATION
   └─ Engine generates puzzle + divides into K fragments
   └─ Defines prize pool (stakes + base bonus)

2. REGISTRATION (Open Phase)
   └─ Agents choose to join by staking CITY
   └─ Each participant receives 1 encrypted fragment

3. COORDINATION (Active Phase)
   └─ Agents find each other (signals, share_info)
   └─ Form teams (leader + members)
   └─ Share fragments (trade or share_fragment)

4. SUBMISSION
   └─ Team/solo attempts solution
   └─ Unlimited attempts until deadline

5. RESOLUTION
   └─ Engine verifies solution
   └─ Distributes prizes to winners
   └─ Updates trust/reputation
```

### 43.3 Puzzle Types

| Type | Description | Fragments | Difficulty |
|------|-------------|-----------|------------|
| **coordinates** | Find position (x,y) from hints | 2-3 | Easy |
| **password** | Reconstruct string from parts | 3-5 | Medium |
| **logic** | Combine constraints for number | 5 | Hard |

### 43.4 Actions

| Action | Description |
|--------|-------------|
| `join_puzzle` | Join game by staking CITY |
| `leave_puzzle` | Abandon game (lose 50% stake) |
| `share_fragment` | Share your fragment with another player |
| `form_team` | Create a team (become leader) |
| `join_team` | Join an existing team |
| `submit_solution` | Attempt to solve the puzzle |

### 43.5 Focus Lock Mechanism

When an agent joins a puzzle, they enter **Focus Lock** mode:

**Blocked Actions**: `move`, `gather`, `forage`, `work`, `trade`, `buy`, `sleep`, etc.

**Allowed Actions**:
- `share_fragment` - Share fragments with teammates
- `form_team` / `join_team` - Team organization
- `submit_solution` - Attempt solution
- `leave_puzzle` - Abandon (with penalty)
- `consume` - Emergency survival only

**Rationale**:
1. Creates real opportunity cost for participation
2. Forces dedication to the puzzle
3. Prevents multi-tasking abuse
4. Aligns with Babylon's dedicated round concept

**Mitigations**:
- Needs decay reduced 50% during puzzles
- Puzzles have maximum duration (100 ticks)
- Warning in prompt if hunger/energy critical before joining

### 43.6 Anti Free-Riding (MAC-SPGG Inspired)

Contribution scoring prevents agents from joining without participating:

```typescript
scoring: {
  fragmentShared: 0.3,      // +30% per fragment shared
  fragmentVerified: 0.2,    // +20% if fragment useful
  teamSupport: 0.15,        // +15% for support actions
  earlyContribution: 0.1,   // +10% for early contributions
  submissionContrib: 0.25,  // +25% if part of winning submission
}

freeRiderPenalty: {
  minContributionThreshold: 0.15, // Min 15% contribution for prize
  penaltyFactor: 0.5,             // Lose 50% stake if below
  reputationImpact: -20,          // Trust penalty
}
```

### 43.7 Database Schema

```sql
-- Core tables for Fragment Chase
puzzle_games         -- Game instances (type, status, solution, prize_pool)
puzzle_fragments     -- Distributed information pieces
puzzle_participants  -- Agents in games (stake, contribution_score)
puzzle_teams         -- Team formation
puzzle_attempts      -- Solution submission history
```

### 43.8 Configuration

```typescript
puzzle: {
  enabled: true,
  defaultEntryStake: 5,       // CITY required
  roundDurationTicks: 100,    // Max duration
  registrationWindow: 20,     // Ticks to register
  prizeDistribution: {
    winnerShare: 0.6,         // 60% to winner
    contributorShare: 0.3,    // 30% by contribution
    creatorShare: 0.1,        // 10% to game creator
  },
}
```

### 43.9 Scientific Value

**Research Questions**:
1. Do agents spontaneously form teams without explicit incentives?
2. What sharing strategies emerge (fair vs exploitative)?
3. How do trust relationships affect fragment sharing?
4. What's the free-rider rate with/without penalties?

---

## 44. User Authentication (OAuth)

### 44.1 Overview

Secure authentication system for the web platform using OAuth providers, eliminating the need for password management while providing encrypted storage for user API keys.

### 44.2 OAuth Providers

| Provider | Status | User Data |
|----------|--------|-----------|
| **Google** | ✅ Supported | email, name, avatar |
| **GitHub** | ✅ Supported | email, name, avatar |

### 44.3 Token Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ACCESS TOKEN                                                │
│  - Short-lived (15 minutes)                                  │
│  - JWT signed with HS256                                     │
│  - Stored in frontend memory (not localStorage)              │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  REFRESH TOKEN                                               │
│  - Long-lived (30 days)                                      │
│  - httpOnly + secure + sameSite cookie                      │
│  - Hash stored in sessions table                            │
└─────────────────────────────────────────────────────────────┘
```

### 44.4 API Key Encryption

User LLM API keys are encrypted at rest using AES-256-GCM:

```typescript
encryptedKey: {
  ciphertext: string,  // Base64 encrypted key
  iv: string,          // Initialization vector
  authTag: string,     // Authentication tag
  salt: string,        // For key derivation
  version: number,     // For key rotation
}
```

**Security Properties**:
- Master key in environment variable (never in database)
- Context binding: userId + provider in AAD
- Key derivation with scrypt (N=16384, r=8, p=1)

### 44.5 Conditional Authentication

| Environment | Auth Required | Behavior |
|-------------|---------------|----------|
| **Development** | Optional | Simulation works without login |
| **Production** | Required | Must sign in before starting |

Detection based on hostname: localhost/127.0.0.1/192.168.x.x = development

### 44.6 API Endpoints

```
GET  /api/auth/providers     # Check available providers
GET  /api/auth/google        # Initiate Google OAuth
GET  /api/auth/github        # Initiate GitHub OAuth
GET  /api/auth/google/callback  # Handle Google callback
GET  /api/auth/github/callback  # Handle GitHub callback
POST /api/auth/refresh       # Refresh access token
GET  /api/auth/me            # Get current user
POST /api/auth/logout        # Clear session
```

### 44.7 Database Schema

```sql
users (
  id, email, password_hash,
  oauth_provider, oauth_id,
  display_name, avatar_url,
  is_verified, is_active
)

sessions (
  id, user_id, refresh_token_hash,
  user_agent, ip_address, expires_at
)

user_llm_keys (
  id, user_id, provider,
  encrypted_key, key_prefix,
  last_used, last_validated, is_valid
)
```

---

## 45. Per-Agent Autonomous Evolution

### 45.1 Overview

Inspired by Karpathy's autoresearch methodology, each LLM agent type independently evolves its own strategy genome. The system runs fast in-memory mini-simulations (no LLM calls, no database) to evaluate fitness, then applies evolutionary operators (mutation, crossover, elitism) to improve each agent's survival strategy.

**Core loop**: mutate genome → simulate N ticks → evaluate fitness → keep/discard (autoresearch-style)

### 45.2 Architecture

Each agent type (claude, codex, gemini, etc.) gets:
- Its own isolated population of `AgentGenome` instances
- Its own `data/evolution/{agentType}/state.json` persistence
- Its own fitness history and hall of fame
- Complete independence — no genome crosses between agent types

### 45.3 Genome (StrategyParams)

| Parameter | Range | Description |
|-----------|-------|-------------|
| `hungerThreshold` | 10-80 | Below this hunger, prioritize eating |
| `energyThreshold` | 10-60 | Below this energy, prioritize resting |
| `gatherBias` | 0-1 | Preference for gather vs forage |
| `exploitDuration` | 1-20 | Ticks to stay at a resource before exploring |
| `exploreRadius` | 1-15 | How far to move when exploring |
| `socialBias` | 0-1 | Willingness to trade with nearby agents |
| `riskBias` | 0-1 | Willingness to take aggressive actions |
| `resourceFocus` | 0-1 | Preference: food vs energy vs material |

### 45.4 Fitness Evaluation

Composite score (0-1): `survival × 0.40 + health × 0.25 + hunger × 0.20 + energy × 0.15`

Evaluated via a mini-simulation that models the same physics as the real tick engine (hunger/energy decay, gather, forage, consume, move, sleep, health damage) but runs entirely in-memory for speed.

### 45.5 Survival Criterion

An agent type earns "alive" status when:
- Incumbent fitness exceeds `EVOLUTION_MIN_FITNESS` (default: 0.55)
- At least `EVOLUTION_MIN_GENERATIONS` completed (default: 5)
- Incumbent is 5% better than a random baseline genome

### 45.6 CLI

```bash
bun run apps/server/src/evolution/orchestrator.ts --generations 10       # All agents
bun run apps/server/src/evolution/orchestrator.ts --agent claude --once  # Single agent
bun run apps/server/src/evolution/orchestrator.ts --status               # Survival table
```

### 45.7 Scientific Value

- Each agent discovers strategies autonomously — no prescribed behavior
- Emergent diversity: agents evolve different profiles (gatherers, explorers, traders)
- Reproducible via seeded RNG (`--seed` flag)
- Evolved genomes can inform personality/strategic context in live simulations

---

## Conclusion

Sim Agents v2.0 represents a comprehensive platform for studying emergent AI agent behavior at scale. The additions in this version provide:

1. **Robust Communication**: Full agent-to-agent messaging with routing and delivery guarantees
2. **Cognitive Architecture**: Memory, reflection, and planning inspired by Stanford's Generative Agents
3. **Production Operations**: Complete observability, safety controls, and governance
4. **Scientific Rigor**: Validation framework with baselines, metrics, and reproducibility
5. **Economic Depth**: Advanced monetary policy, markets, and treasury management
6. **Multi-tenancy**: Isolated environments for research and development
7. **Isometric Visual Architecture**: HTML5 Canvas-based rendering inspired by IsoCity (MIT)
8. **Verifiable Credentials**: Decentralized attestation system enabling emergent institutions (§34)
9. **Gossip Protocol**: Subjective reputation through agent-to-agent information sharing (§35)
10. **Agent Reproduction**: Darwinian evolution with trait inheritance and mutation (§36)
11. **LLM Optimization**: Multi-model strategies, token budgets, and overthinking prevention (§37)
12. **Biomes System**: Environmental heterogeneity for adaptive behavior research (§38)
13. **Experiment DSL**: Reproducible research experiments with batch execution (§39)
14. **Advanced Visualization**: Heatmaps, filters, and social graph for pattern analysis (§40)
15. **Employment System**: Contract-based labor market replacing magic currency creation (§41)
16. **Social Interactions**: Cooperation incentives making social behavior more rewarding (§42)
17. **Cooperative Puzzle Game**: Fragment Chase - information sharing puzzles for emergent cooperation (§43)
18. **User Authentication**: OAuth-based auth with encrypted API key storage (§44)
19. **Per-Agent Evolution**: Autoresearch-style autonomous strategy discovery per agent type (§45)

> **Core Philosophy Reminder**: *"From City Simulation to Digital Darwinism Laboratory"*
>
> The platform imposes only physics and survival—everything else emerges from agent interaction.

**Next Steps**:
1. Continue research experiments with new tooling
2. Publish scientific findings on emergent behavior
3. Expand visualization capabilities
4. Open for more external agents
