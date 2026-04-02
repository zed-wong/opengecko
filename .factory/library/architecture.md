# Architecture

Worker-facing architecture for the approved **trust-slice hardening mission**.

This mission is intentionally narrow. It does not redesign OpenGecko as a whole. It hardens one shared hot-market slice:

- `/simple/price`
- `/coins/markets`
- `/coins/{id}`
- `/diagnostics/runtime`

The key architectural goal is to make these four surfaces tell the same truth about market freshness, provenance, degraded service, and bootstrap behavior.

---

## Mission Target

Workers should optimize for this outcome:

1. A single shared snapshot-admissibility model drives all scoped surfaces.
2. Provenance and trust tiering become explicit for the scoped slice.
3. `/diagnostics/runtime` is the operator-readable truth source for that slice.
4. The repository test gate becomes green without widening scope into unrelated platform work.

This mission is **not**:
- a whole-platform fidelity uplift
- a service split
- a search/global redesign
- an onchain/treasury/derivatives expansion

## Current System Shape

OpenGecko is a modular monolith with four layers:

1. **Provider ingress**: CCXT, DeFiLlama, Subsquid, and exchange-rate sources fetch public data.
2. **Normalization + persistence**: services map upstream payloads onto canonical ids and SQLite-backed state.
3. **Background runtime**: startup sync, market refresh, OHLCV worker, and search rebuild maintain persisted state.
4. **Compatibility routes**: Fastify handlers shape that persisted state into CoinGecko-style HTTP responses.

Relationship summary:

`providers -> normalization -> SQLite -> route modules -> compatibility responses`

For this mission, the important detail is that the scoped routes are not independent features. They are different projections over the same runtime state.

## Trust Slice Components

### 1. Shared runtime state

Primary files:
- `src/services/market-runtime-state.ts`
- `src/services/market-runtime.ts`
- `src/services/initial-sync.ts`
- `src/services/market-refresh.ts`

This state controls whether the system is:
- still booting
- serving fresh live data
- serving stale live data
- serving bootstrap snapshots
- serving degraded seeded bootstrap
- in zero-live completed-boot failure

### 2. Snapshot admissibility policy

Primary file:
- `src/modules/market-freshness.ts`

This is the central trust gate for the mission.

It decides whether a snapshot is usable for the public contract. Workers must extend or fix this policy centrally instead of duplicating freshness logic per route.

### 3. Shared market snapshot ownership

Primary files:
- `src/services/market-snapshots.ts`
- `src/db/schema.ts`

Important tables / concepts:
- `market_snapshots`
- `source_count`
- `source_providers_json`
- persisted bootstrap/live snapshot rows

Mission rule: workers should reuse existing ownership/provenance signals instead of inventing a second provenance model.

Minimum mission requirement: provenance/tiering must be externally observable at least through `/diagnostics/runtime`, and it must materially affect scoped route shaping such as whether market fields are populated, nulled, omitted, or rejected. Workers should not add a second per-route provenance vocabulary; they should drive route behavior from the shared live-vs-seeded ownership model plus freshness/admissibility state.

### 4. Scoped route surfaces

Primary files:
- `src/modules/simple.ts`
- `src/modules/coins.ts`
- `src/modules/coins/market-data.ts`
- `src/modules/coins/detail.ts`
- `src/modules/diagnostics.ts`
- `src/services/runtime-diagnostics.ts`

These surfaces must agree on:
- whether data is usable
- whether stale data is allowed
- whether bootstrap data is being served
- whether service is degraded
- what timestamp/provenance evidence is exposed

## Runtime State Model

The mission should preserve or sharpen the following machine-readable states.

```text
fresh_live
  -> normal ready service

stale_live
  -> only acceptable when stale-live serving is explicitly enabled

seeded_bootstrap
  -> startup/bootstrap readability before initial sync completes

degraded_seeded_bootstrap
  -> fallback service with reduced trust and reduced field completeness

zero_live_completed_boot
  -> initial sync finished with no usable live snapshots; explicit failure path

unavailable
  -> no effective shared snapshot is admissible; diagnostics must report explicit unavailability, and scoped routes must follow their route-specific failure/null/omission semantics
```

Important rule: diagnostics and public route behavior must describe the **same** state, not adjacent approximations.

## Route-Level Responsibilities

### `/simple/price`
- keyed quote payload
- omission semantics for unusable coins
- explicit 503 on zero-live completed boot
- optional field toggles and precision-sensitive shaping

### `/coins/markets`
- row list / ordering / pagination semantics
- explicit-id behavior
- null-shape behavior when market fields are unusable
- sparkline / price-change field shaping

### `/coins/{id}`
- stable metadata shell
- `market_data` coherence with the shared hot snapshot
- explicit null/empty behavior for optional sections
- must not imply fresh/live completeness when runtime is degraded

### `/diagnostics/runtime`
- operator-visible truth source
- must expose readiness, degraded state, source class, freshness, and cache revision
- validation-only override routes must stay gated to validation mode
- validation override POST routes are test-only controls on port `3102`; for this mission follow-up they may expose `off`, `stale_disallowed`, `stale_allowed`, `degraded_seeded_bootstrap`, `seeded_bootstrap`, and `zero_live_completed_boot` so validators can exercise the locked contract states directly
- those validation-only bootstrap and zero-live controls must never be exposed on the normal mission API at `3001`

## Change Strategy for This Mission

Workers should prefer this order:

1. Fix shared runtime-state and snapshot-admissibility behavior.
2. Align `/diagnostics/runtime` with actual hot-path truth.
3. Align `/simple/price`, `/coins/markets`, and `/coins/{id}` to that shared truth.
4. Repair tests and harnesses until the main suite is green.

Workers should **not** start by:
- splitting services
- redesigning unrelated route families
- widening provider scope
- changing whole-platform fidelity classifications

## Coupling Hazards

These are the main ways workers can accidentally broaden scope or create regressions:

### 1. Route-local freshness fixes
If a worker patches `/simple/price` or `/coins/{id}` directly without going through shared freshness/runtime helpers, the trust slice will drift again.

### 2. Cache invalidation drift
`hotDataRevision` is part of the shared truth for hot endpoints. Runtime-state transitions must invalidate all affected hot-path caches together.

### 3. Detail-route independence
`/coins/{id}` composes more than just market data. Workers must keep the metadata shell stable while changing the `market_data` trust behavior.

### 4. Fixture honesty drift
Long-tail surfaces outside this mission remain hybrid or fixture-backed. Do not “upgrade” them implicitly while fixing the scoped slice.

## Required Architectural Invariants

Workers must preserve these:

1. **Compatibility first**: path, params, and field names stay CoinGecko-compatible for the scoped routes.
2. **Single trust model**: scoped routes share one admissibility policy.
3. **Diagnostics truthfulness**: `/diagnostics/runtime` must match what the hot endpoints actually do.
4. **No silent degradation**: degraded or bootstrap service must be externally visible.
5. **Minimal diff**: improve truth and observability without widening product scope.
6. **SQLite-first**: no new external infrastructure or service topology.
7. **Shared truth, route-specific envelopes**: the same runtime state may map to different HTTP behavior by route; `/simple/price` may return `503`, `/coins/markets` may retain identity rows with null market fields, `/coins/{id}` may preserve its metadata shell with `market_data: null`, and `/diagnostics/runtime` must describe the same condition explicitly.

## Validation Surfaces

The scoped architecture is validated primarily through:

- targeted Vitest suites
- `tests/app.test.ts`
- full `bun run test`
- `bun run build`
- `bun run typecheck`
- `curl` checks against the mission API on `3001` and the validation-only API on `3102` when exercising diagnostics override routes

No browser UI is part of this mission architecture.

The validation API on `127.0.0.1:3102` is a special bootstrap/validation runtime profile in this repo. Workers must preserve that assumption when changing startup, bootstrap snapshot import, or diagnostics override behavior, and they must not assume port `3001` exposes validation-mode routes.

## When Artifacts Disagree

Use this priority:

1. mission validation contract
2. current runtime-observable behavior and tests
3. mission artifacts and implementation tracker
4. broader docs

If runtime and the validation contract disagree, treat the contract as the acceptance target unless the mission explicitly says otherwise. If docs and runtime disagree, workers must treat that as a mission hazard to fix or preserve explicitly, not a reason to guess.
