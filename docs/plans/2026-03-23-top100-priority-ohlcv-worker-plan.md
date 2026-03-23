# Top-100-Priority OHLCV Worker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace startup-blocking OHLCV backfill with a continuous, restart-safe worker that prioritizes top-100 coins, keeps recent history current, and gradually deepens historical coverage over time.

**Architecture:** Introduce a persistent OHLCV sync-target table that stores per-coin worker state, including priority tier, latest/oldest synced timestamps, retry metadata, and chosen exchange/symbol. Move heavy historical ingestion out of startup and into a dedicated runtime/worker loop with two scheduling modes: forward catch-up for fresh recent candles and backward deepening for older history. Keep API reads sourced from local `ohlcvCandles`; the worker owns ingestion durability and restart continuity.

**Tech Stack:** Bun, TypeScript, Fastify, SQLite, Drizzle, better-sqlite3, CCXT, Vitest.

---

### Task 1: Add the persistent OHLCV sync-target schema

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/00xx_ohlcv_sync_targets.sql`
- Modify: `src/db/client.ts`
- Test: `tests/ohlcv-worker-state.test.ts`

**Step 1: Write the failing test**

Add a schema/repository-level test that expects a persistent target row to be readable/writable with priority and cursor fields.

```ts
it('stores OHLCV sync target state with cursors and retry metadata', () => {
  const row = insertSyncTarget({
    coinId: 'bitcoin',
    exchangeId: 'binance',
    symbol: 'BTC/USDT',
    interval: '1d',
    priorityTier: 'top100',
    latestSyncedAt: new Date('2026-03-22T00:00:00.000Z'),
    oldestSyncedAt: new Date('2025-03-22T00:00:00.000Z'),
    targetHistoryDays: 365,
    status: 'idle',
  });

  expect(row.priorityTier).toBe('top100');
  expect(row.targetHistoryDays).toBe(365);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/ohlcv-worker-state.test.ts`
Expected: FAIL because the table/schema helpers do not exist yet.

**Step 3: Write minimal implementation**

Add an `ohlcv_sync_targets` table with these columns at minimum:

- `coin_id`
- `exchange_id`
- `symbol`
- `vs_currency` default `usd`
- `interval` default `1d`
- `priority_tier` (`top100`, `requested`, `long_tail`)
- `latest_synced_at`
- `oldest_synced_at`
- `target_history_days`
- `status` (`idle`, `running`, `failed`)
- `last_attempt_at`
- `last_success_at`
- `last_error`
- `failure_count`
- `next_retry_at`
- `last_requested_at`
- `created_at`
- `updated_at`

Use a stable unique key on `coin_id + exchange_id + symbol + interval + vs_currency`.

**Step 4: Run test to verify it passes**

Run: `bun test tests/ohlcv-worker-state.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/db/schema.ts src/db/client.ts drizzle/ tests/ohlcv-worker-state.test.ts
git commit -m "feat: add persistent ohlcv sync target state"
```

### Task 2: Extract and test target-discovery logic with priority tiers

**Files:**
- Create: `src/services/ohlcv-targets.ts`
- Modify: `src/services/initial-sync.ts`
- Modify: `src/services/ohlcv-backfill.ts`
- Test: `tests/ohlcv-targets.test.ts`

**Step 1: Write the failing test**

Add tests for:
- selecting one canonical market per coin with `USDT` before `USD`
- tagging top-100 coins as `top100`
- leaving other discovered coins as `long_tail`

```ts
it('prefers USDT over USD and marks top-100 targets first', async () => {
  const targets = await buildOhlcvSyncTargets(database, ['binance'], new Set(['bitcoin']));

  expect(targets).toContainEqual(expect.objectContaining({
    coinId: 'bitcoin',
    symbol: 'BTC/USDT',
    priorityTier: 'top100',
  }));
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/ohlcv-targets.test.ts`
Expected: FAIL because the extracted builder does not exist.

**Step 3: Write minimal implementation**

Create a shared target builder used by both startup sync and worker logic. Keep the existing canonical market-selection rule, but return richer metadata:

- `coinId`
- `exchangeId`
- `symbol`
- `priorityTier`
- `targetHistoryDays`

Do not add request-triggered promotion in this task.

**Step 4: Run test to verify it passes**

Run: `bun test tests/ohlcv-targets.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/ohlcv-targets.ts src/services/initial-sync.ts src/services/ohlcv-backfill.ts tests/ohlcv-targets.test.ts
git commit -m "refactor: extract ohlcv target discovery"
```

### Task 3: Add repository helpers for sync-target leasing and cursor updates

**Files:**
- Create: `src/services/ohlcv-worker-state.ts`
- Test: `tests/ohlcv-worker-state.test.ts`

**Step 1: Write the failing test**

Add tests for:
- leasing the next `top100` target before `long_tail`
- skipping targets still under backoff
- updating `latestSyncedAt` and `oldestSyncedAt`
- recording failure metadata and retry time

```ts
it('leases top100 targets before long-tail targets', () => {
  seedTarget({ coinId: 'bitcoin', priorityTier: 'top100', nextRetryAt: null });
  seedTarget({ coinId: 'some-microcap', priorityTier: 'long_tail', nextRetryAt: null });

  const leased = leaseNextOhlcvTarget(database, now);

  expect(leased?.coinId).toBe('bitcoin');
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/ohlcv-worker-state.test.ts`
Expected: FAIL because leasing/update helpers do not exist.

**Step 3: Write minimal implementation**

Implement helpers to:
- upsert discovered targets
- lease one eligible target at a time
- mark `running`
- mark success and update cursors
- mark failure and exponential backoff
- promote a target priority later without recreating it

Keep selection deterministic: `top100` first, then `requested`, then `long_tail`, with the oldest stale `last_success_at` first inside each tier.

**Step 4: Run test to verify it passes**

Run: `bun test tests/ohlcv-worker-state.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/ohlcv-worker-state.ts tests/ohlcv-worker-state.test.ts
git commit -m "feat: add ohlcv worker leasing and cursor updates"
```

### Task 4: Split ingestion into forward catch-up and backward deepening units

**Files:**
- Create: `src/services/ohlcv-sync.ts`
- Modify: `src/services/ohlcv-backfill.ts`
- Modify: `src/services/candle-store.ts`
- Test: `tests/ohlcv-sync.test.ts`

**Step 1: Write the failing test**

Add tests for two units:
- `syncRecentOhlcvWindow()` fetches from `latestSyncedAt + 1d` to current day
- `deepenHistoricalOhlcvWindow()` fetches backward from `oldestSyncedAt` until target depth is reached

```ts
it('continues recent sync from latestSyncedAt instead of refetching a full year', async () => {
  await syncRecentOhlcvWindow(database, target, now);

  expect(fetchExchangeOHLCV).toHaveBeenCalledWith('binance', 'BTC/USDT', '1d', expectedSince);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/ohlcv-sync.test.ts`
Expected: FAIL because the split sync functions do not exist.

**Step 3: Write minimal implementation**

Implement:
- `syncRecentOhlcvWindow()` for "up to now"
- `deepenHistoricalOhlcvWindow()` for "further into history"
- shared candle persistence using `upsertCanonicalOhlcvCandle`

Rules:
- Use `1d` only in this phase
- If no cursors exist, seed recent coverage first instead of full 365-day blocking backfill
- Keep writes idempotent

**Step 4: Run test to verify it passes**

Run: `bun test tests/ohlcv-sync.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/ohlcv-sync.ts src/services/ohlcv-backfill.ts src/services/candle-store.ts tests/ohlcv-sync.test.ts
git commit -m "feat: split ohlcv sync into recent and historical modes"
```

### Task 5: Build the long-running OHLCV worker runtime

**Files:**
- Create: `src/services/ohlcv-runtime.ts`
- Modify: `src/services/market-runtime.ts`
- Test: `tests/ohlcv-runtime.test.ts`

**Step 1: Write the failing test**

Add tests for:
- polling the next target continuously
- processing `top100` before `long_tail`
- running recent catch-up before historical deepening for the same target
- continuing from persisted cursors after restart

```ts
it('prioritizes top100 recent catch-up before long-tail historical deepening', async () => {
  await runtime.tick();

  expect(syncRecentOhlcvWindow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ priorityTier: 'top100' }), expect.any(Date));
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/ohlcv-runtime.test.ts`
Expected: FAIL because the runtime does not exist.

**Step 3: Write minimal implementation**

Create a serialized worker runtime that:
- refreshes/merges discovered targets
- leases one target per tick
- executes recent catch-up first
- only deepens history when recent coverage is current enough
- records success/failure state
- supports `start()`, `stop()`, and a testable `tick()`

Do not parallelize yet; start with one in-flight OHLCV target at a time.

**Step 4: Run test to verify it passes**

Run: `bun test tests/ohlcv-runtime.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/ohlcv-runtime.ts src/services/market-runtime.ts tests/ohlcv-runtime.test.ts
git commit -m "feat: add continuous ohlcv worker runtime"
```

### Task 6: Remove startup-blocking OHLCV backfill from initial sync

**Files:**
- Modify: `src/services/initial-sync.ts`
- Modify: `src/services/market-runtime.ts`
- Modify: `src/server.ts`
- Test: `tests/initial-sync.test.ts`
- Test: `tests/market-runtime.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- startup no longer waits for full OHLCV history completion
- initial sync still completes exchange/coin/chain/snapshot responsibilities
- the OHLCV worker is scheduled after startup instead

```ts
it('starts serving without waiting for full ohlcv history backfill', async () => {
  await runtime.start();

  expect(runInitialMarketSync).toHaveBeenCalled();
  expect(startOhlcvRuntime).toHaveBeenCalled();
  expect(runInitialMarketSync).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ blockingBackfill: true }));
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/initial-sync.test.ts tests/market-runtime.test.ts`
Expected: FAIL because startup still performs blocking OHLCV work.

**Step 3: Write minimal implementation**

Change startup behavior so `runInitialMarketSync()` stops after:
- exchanges
- coin catalog
- chain catalog
- market snapshots

Move OHLCV work kickoff into the continuous worker startup path.

Update the startup progress UI so it no longer implies that full historical backfill must finish before serving.

**Step 4: Run test to verify it passes**

Run: `bun test tests/initial-sync.test.ts tests/market-runtime.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/initial-sync.ts src/services/market-runtime.ts src/server.ts tests/initial-sync.test.ts tests/market-runtime.test.ts
git commit -m "feat: move ohlcv history sync out of startup"
```

### Task 7: Add top-100 selection and tier refresh

**Files:**
- Create: `src/services/ohlcv-priority.ts`
- Modify: `src/services/market-snapshots.ts` or relevant snapshot query service
- Modify: `src/services/ohlcv-runtime.ts`
- Test: `tests/ohlcv-priority.test.ts`

**Step 1: Write the failing test**

Add tests that:
- compute a deterministic top-100 set from current market snapshot ranking
- re-tier an existing target from `long_tail` to `top100`
- preserve existing cursors during retiering

```ts
it('promotes ranked coins into the top100 worker tier without losing cursors', () => {
  const topIds = selectTopOhlcvCoins(database, 100);
  expect(topIds).toContain('bitcoin');
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/ohlcv-priority.test.ts`
Expected: FAIL because ranking-based retiering does not exist.

**Step 3: Write minimal implementation**

Use current market-snapshot ranking as the first top-100 source. On each refresh cycle, recompute the set and update worker tiers in place.

Do not build manual allowlists or request-promotion yet.

**Step 4: Run test to verify it passes**

Run: `bun test tests/ohlcv-priority.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/ohlcv-priority.ts src/services/ohlcv-runtime.ts tests/ohlcv-priority.test.ts
git commit -m "feat: prioritize ohlcv sync for top100 coins"
```

### Task 8: Add operational CLI job entrypoint for the worker

**Files:**
- Create: `src/jobs/run-ohlcv-worker.ts`
- Modify: `package.json`
- Test: `tests/ohlcv-runtime.test.ts`

**Step 1: Write the failing test**

Add a test that verifies the worker entrypoint initializes the database and starts the runtime cleanly.

```ts
it('starts the ohlcv worker job entrypoint', async () => {
  await runOhlcvWorkerJob();
  expect(createOhlcvRuntime).toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/ohlcv-runtime.test.ts`
Expected: FAIL because no dedicated worker job exists.

**Step 3: Write minimal implementation**

Add a standalone job entrypoint and package script such as `ohlcv:worker`. This should allow future deployment as either:
- in-process startup sidecar for local dev
- separate worker process for hosted environments

**Step 4: Run test to verify it passes**

Run: `bun test tests/ohlcv-runtime.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/jobs/run-ohlcv-worker.ts package.json tests/ohlcv-runtime.test.ts
git commit -m "feat: add ohlcv worker job entrypoint"
```

### Task 9: Add observability and health reporting for OHLCV progress

**Files:**
- Modify: `src/modules/diagnostics.ts`
- Modify: `src/services/ohlcv-runtime.ts`
- Test: `tests/app.test.ts`
- Test: `tests/ohlcv-runtime.test.ts`

**Step 1: Write the failing test**

Add tests for a diagnostics surface that exposes:
- top-100 coverage count
- targets waiting / running / failed
- oldest lag for recent catch-up
- oldest gap for historical deepening

```ts
it('returns ohlcv worker lag and failure metrics', async () => {
  const response = await app.inject({ method: 'GET', url: '/diagnostics/ohlcv_sync' });
  expect(response.statusCode).toBe(200);
  expect(response.json().data).toHaveProperty('top100.ready');
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/app.test.ts tests/ohlcv-runtime.test.ts`
Expected: FAIL because no OHLCV worker diagnostics surface exists.

**Step 3: Write minimal implementation**

Add a diagnostics endpoint and service summary showing worker health and backlog. Keep it read-only.

**Step 4: Run test to verify it passes**

Run: `bun test tests/app.test.ts tests/ohlcv-runtime.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/modules/diagnostics.ts src/services/ohlcv-runtime.ts tests/app.test.ts tests/ohlcv-runtime.test.ts
git commit -m "feat: add ohlcv worker diagnostics"
```

### Task 10: Update planning and status documents to reflect the new runtime model

**Files:**
- Modify: `docs/status/implementation-tracker.md`
- Modify: `docs/plans/2026-03-20-opengecko-engineering-execution-plan.md`
- Modify: `CLAUDE.md`

**Step 1: Write the failing test**

No automated test. Instead, create a checklist in the PR description or working notes:

- startup no longer claims blocking OHLCV backfill ownership
- historical durability now references a continuous worker model
- active decisions mention top-100-first OHLCV scheduling

**Step 2: Verify current docs are outdated**

Read:
- `docs/status/implementation-tracker.md`
- `docs/plans/2026-03-20-opengecko-engineering-execution-plan.md`
- `CLAUDE.md`

Expected: they still describe boot-time OHLCV backfill as the current model.

**Step 3: Write minimal implementation**

Update docs so they describe:
- startup sync for hot snapshots only
- continuous OHLCV worker for historical durability
- top-100 priority tier as the initial scheduling policy

Update `CLAUDE.md` only if project direction/architecture guidance should explicitly mention the worker runtime model.

**Step 4: Verify docs are aligned**

Run: `bun run typecheck`
Expected: PASS.

Manually confirm the checklist items are true in the edited docs.

**Step 5: Commit**

```bash
git add docs/status/implementation-tracker.md docs/plans/2026-03-20-opengecko-engineering-execution-plan.md CLAUDE.md
git commit -m "docs: update ohlcv runtime architecture"
```

### Task 11: Full verification pass

**Files:**
- Test: `tests/ohlcv-worker-state.test.ts`
- Test: `tests/ohlcv-targets.test.ts`
- Test: `tests/ohlcv-sync.test.ts`
- Test: `tests/ohlcv-runtime.test.ts`
- Test: `tests/initial-sync.test.ts`
- Test: `tests/market-runtime.test.ts`
- Test: `tests/app.test.ts`

**Step 1: Run targeted service tests**

Run:

```bash
bun test tests/ohlcv-worker-state.test.ts tests/ohlcv-targets.test.ts tests/ohlcv-sync.test.ts tests/ohlcv-runtime.test.ts
```

Expected: PASS.

**Step 2: Run startup/runtime regression tests**

Run:

```bash
bun test tests/initial-sync.test.ts tests/market-runtime.test.ts tests/app.test.ts
```

Expected: PASS, subject to the current Bun vs `better-sqlite3` limitation in this environment. If that limitation remains, run the same suites in the repository’s supported test environment and record the exact command/output.

**Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

**Step 4: Run final diff review**

Run:

```bash
git diff --stat
git diff -- src/services src/jobs src/db docs tests
```

Expected: diff only contains the planned OHLCV worker/runtime/doc updates.

**Step 5: Final commit**

```bash
git add src/jobs src/services src/db docs tests package.json
git commit -m "feat: add top100-priority continuous ohlcv worker"
```

## Notes For The Implementer

- Keep `1d` candles as the only scope for this plan. Do not add minute/hour intervals yet.
- Do not add request-time upstream OHLCV fetching in this plan.
- Do not parallelize the worker until cursor correctness and retry behavior are covered by tests.
- Keep API reads local-first from `ohlcvCandles`.
- Use TDD strictly for each task: red, verify red, green, verify green.
- Prefer small commits after each task, not one large batch.

Plan complete and saved to `docs/plans/2026-03-23-top100-priority-ohlcv-worker-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
