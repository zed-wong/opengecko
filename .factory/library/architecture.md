# Architecture

Architecture facts, decisions, and extension notes for workers.

**What belongs here:** route/module layout, service boundaries, data flow notes, architectural constraints discovered during mission work.
**What does NOT belong here:** per-feature TODOs or mission status.

---

- OpenGecko is a Bun + TypeScript + Fastify API with SQLite/Drizzle persistence.
- Existing route families live under `src/modules/`.
- Contract compatibility takes priority over internal elegance.
- Reuse existing patterns for validation, route registration, and DB access before introducing new abstractions.
- This mission hardens runtime behavior for the existing API surface; it is not an endpoint-expansion mission.
- Keep provider seams replaceable; do not couple new routes tightly to a single source unless unavoidable and surfaced to the orchestrator.

- For Drizzle join/select work, define explicit row types when needed and expect table-name keys in joined results unless you alias them yourself.
- When Drizzle `count()` inference becomes brittle in this codebase, a simpler select-and-`.length` pattern is acceptable if the query scope is bounded and behavior remains clear.
- Put provider concurrency, failure control, and degraded-boot logic in provider/runtime services rather than route-local code.
- Treat cache work as route-facing infrastructure: normalize only contract-safe request differences, and isolate every shape-altering parameter in the cache key.
- Stabilize hot query shapes before adding indexes; do not optimize temporary query patterns.
- Runtime-status and diagnostics surfaces must align with the actual behavior seen on `/simple/price` and `/coins/markets`.
- Final-phase refactors must be characterization-first and behavior-preserving, especially for `src/modules/coins.ts` and `src/services/market-refresh.ts`.
