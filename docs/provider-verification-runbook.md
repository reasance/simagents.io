# Genuine provider compatibility run

The versioned manifest is `provider-verification-manifest.json`. It is a draft, not authorization or certification. It covers the 11 text-protocol providers in the product (the Jev and Sage decision models are not carried by the official relay and stay outside this campaign), with two separate OpenAI protocol combinations: 12 combinations, each with one explicit connection probe and three actual simulation decisions (48 inference attempts total). Model IDs, exact endpoints, commercial/region scope, transport, proposed parameters, key references and pricing provenance are recorded before execution.

All verification fields remain unverified/null. Documentation establishes published IDs/rates, not account access, payload compatibility, model quality or a passed connection. No inference was sent while preparing the manifest.

## Before requesting approval

Freeze a clean candidate and record its commit, SPA/relay/admission artifacts, catalog, connection/schema versions and build-source receipt. Supply exact staging SPA/relay/admission origins and complete the genuine Turnstile/runtime gates. The public relay origin must remain fixed throughout the campaign. Each dedicated provider key must match the region and commercial plan in its row; do not reuse an unrelated experiment key or put keys in the manifest, repository, logs or shell history.

Refresh lifecycle/pricing/capability documentation immediately before execution. Some targets are dated snapshots, others are exact aliases whose returned version must be recorded. Claude Haiku's current published lifecycle window requires particular attention before release. Custom capability settings are proposed, not validated. Reject undocumented or incompatible parameters before sending; a failed preflight is recorded as not sent, never as a passed call.

Review the fully prepared manifest with the user. Its proposed ceiling is USD 5, with zero retries/fallbacks and a stop on the first error. The listed-rate estimate uses 65,536 input-token allowance and 1,024 output tokens per attempt, standard synchronous text prices, no cache/batch/promotional discount, and no tools. It is an estimate, not a guaranteed invoice cap; actual account/tax/fee conditions and hidden-token accounting must be reconciled. `approval` and `authorizedMaximum` must remain null until the user authorizes the finite campaign.

## Execution contract

For every attempt, append a durable journal entry before sending (the local `scripts/provider-attempt-journal.mjs` helper fsyncs intent/result records, locks the campaign, refuses duplicate/concurrent intents and stops on any failure; it sends no network requests): immutable attempt ID, candidate ID, manifest hash, row, phase, endpoint/model/protocol, sanitized parameter/prompt hashes, timestamp, intended cap and status. Never record credentials. Each fresh retry requires a new manifest entry and new action-time authority. No automatic retry, alternate model, alternate region, alternate relay or regional/commercial fallback is allowed. OpenRouter requests already disable provider fallbacks and require parameter support.

Run the probe through the production connection verifier. Run the next three requests through the production simulation on the declared one-agent, 1× world and exact custom prompt. Observe actual world action events and invariants; three extra standalone probes cannot satisfy the decision requirement. Capture requested and reported model separately, protocol/API version, sanitized outcome/error code, reported input/output/thinking/cache usage where available, monotonic end-to-end latency and relay/provider components when genuinely measurable. An absent usage/model component is unavailable, not zero or fabricated.

Stop on the first failure or budget limit. Record the actual billed/usage evidence before proposing another campaign. Final evidence must be archived against the same candidate. A verified model in a user's tab stays distinct from catalog certification; untested transports, regions, subscriptions and aliases remain explicitly unverified.

## Published sources checked for the draft

Prices in the manifest are USD per million text tokens under the row's conditions, retrieved 2026-10-04. They must be refreshed before spending or publication.

- [OpenAI GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini): dated snapshot, both protocols and standard text rates.
- [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [model IDs/lifecycle](https://platform.claude.com/docs/en/models/overview): first-party Haiku snapshot and global text rates.
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing): paid standard text input/output; thinking output included.
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/): current Flash slug, peak/cache-miss rates, off-peak differences and retired aliases.
- [Alibaba Model Studio pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing): Singapore international Qwen snapshot and non-thinking context tier. Other regions/Coding-style plans are not interchangeable.
- [Z.ai pricing](https://docs.z.ai/guides/overview/pricing): global pay-as-you-go GLM; Coding Plan remains a separate unverified variant.
- [xAI models](https://docs.x.ai/developers/models): current Grok text target and standard rates; tools excluded.
- [Mistral Small 4](https://docs.mistral.ai/models/mistral-small-4-0-26-03): exact snapshot slug and USD text prices. The guessed `/models/mistral-small-2603` link did not resolve; this model page is the checked replacement.
- [MiniMax pricing](https://platform.minimax.io/docs/guides/pricing-paygo): standard model tier; priority/highspeed rates excluded.
- [Kimi platform](https://platform.kimi.ai/), [K2.6 endpoint guide](https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart): model, uncached rates and international endpoint. The pricing explanation page's rendered table was incomplete; the platform model panel supplied the published rates, not a zero placeholder.
- [OpenRouter model page](https://openrouter.ai/openai/gpt-5.4-mini): model-specific base rates; credit/account fees and underlying provider/region are not inferred from the SKU.

The manifest is only preparation. Every real provider gate is still open.

The SPA's separate published-rate artifact is `packages/shared/src/provider-prices.json`, with runtime lookup/estimation and EN/IT source/condition displays. It does not promote any verification field in this manifest. A safe `ProviderAttemptJournal` is only a durable intent/result helper; it neither sends requests nor grants execution authority. Its lock prevents parallel campaign writers, intent/result records are fsynced, reservations are conservative, duplicate attempts are rejected and any uncertain/failed outcome stops the campaign. Existing recorded campaigns require reconciliation and cannot be silently reopened as retries.
