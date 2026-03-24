# User Testing

Validation surface findings and runtime testing notes.

**What belongs here:** user-testing surfaces, tools, setup steps, known gotchas, and resource classification.

---

## Validation Surface

- Surface: HTTP API only
- Tools: `curl`, existing shell endpoint scripts under `scripts/modules/*`, milestone scrutiny and user-testing validators
- Startup command proven during dry run: `PORT=3107 bun run src/server.ts`
- Representative dry-run checks that succeeded:
  - `GET /ping`
  - `GET /simple/supported_vs_currencies`
  - `GET /simple/price?...`
- Focused automated validation path is executable; a pre-existing timestamp-sensitive test drift exists in `tests/app.test.ts` and should be treated as mission work.

## Validation Concurrency

- Machine profile observed during planning: 8 CPU cores, ~30 GB RAM
- Conservative max concurrent validators: `3`
- Rationale: server startup triggers bootstrap sync and SQLite/network activity; 3-way parallelism leaves enough headroom while avoiding avoidable contention.

## Flow Validator Guidance: HTTP API

### Isolation Rules
- Validators can safely run concurrently against the same API instance
- HTTP GET requests are read-only and don't interfere with each other
- No shared mutable state between validators
- Use the same base URL but distinct test data/fixtures where appropriate

### Boundary Constraints
- Use only port 3102 (validation-api) for testing
- Do not access port 3100 (main API) or port 3101 (worker)
- Port 6379 is off-limits (already in use by another workload)

### Testing Approach
- Use `curl` for HTTP API assertions
- Base URL: `http://127.0.0.1:3102`
- Prefer `curl -s` for clean JSON output, `curl -i` when headers needed
- Use `jq` for JSON parsing and validation
- Save evidence (response excerpts) for each assertion tested

### Evidence Requirements
Each assertion should capture:
1. HTTP status code (via `curl -i` or `-w "%{http_code}"`)
2. Response body excerpt (first/last items, relevant fields)
3. For array responses: sample items from beginning, middle, and end
4. For validation errors: status code and error body structure

## Validation Notes

- Prefer targeted route-family checks while implementing features.
- Use curated fixture chains for cross-area assertions instead of one-off spot checks.
- For onchain responses, inspect `relationships` and `included` explicitly where the contract expects them.

## Runtime Validation Gotchas

- Prefer the validation API on port `3102` for manual curl checks if port `3100` is occupied by a stale server.
- Bun/Vitest fake-timer-heavy tests may need explicit microtask flushing between timer advances to avoid apparent hangs.
