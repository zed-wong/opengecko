# User Testing

Testing surface, validation tooling, and concurrency guidance for the data-fidelity uplift mission.

---

## Validation Surface

- **Primary surface**: REST API endpoints
- **Primary tool**: `curl`
- **Primary mission server**: `PORT=3100 HOST=127.0.0.1 CCXT_EXCHANGES=binance,coinbase,okx LOG_LEVEL=error bun run src/server.ts`
- **Secondary isolated server**: `PORT=3102 HOST=127.0.0.1 DATABASE_URL=:memory: CCXT_EXCHANGES='' LOG_LEVEL=error bun run src/server.ts`
- **Database**: SQLite only

Use the live mission API on `3100` for fidelity assertions that depend on provider-backed refresh/discovery behavior. Use `3102` only for isolated structural checks that do not require the live-provider path.

## Milestone Validation Focus

### exchange-live-fidelity

- `/exchanges/binance`
- `/exchanges/binance/tickers`
- `/exchanges/binance/volume_chart`
- `/exchanges/binance/volume_chart/range`
- `/search/trending`

### platform-and-catalog-discovery

- `/asset_platforms`
- `/token_lists/ethereum/all.json`
- `/coins/list/new`
- `/coins/list`
- `/search`
- `/coins/{id}`
- `/coins/{platform}/contract/{address}`

### onchain-discovery-uplift

- `/onchain/networks`
- `/onchain/networks/eth/dexes`
- `/onchain/networks/eth/pools`
- `/onchain/networks/eth/tokens/{address}`
- `/onchain/networks/eth/tokens/{address}/top_holders`
- `/onchain/networks/eth/tokens/{address}/top_traders`
- `/onchain/networks/eth/tokens/{address}/holders_chart`

### coin-enrichment-and-chart-fidelity

- `/coins/bitcoin`
- `/coins/bitcoin/history`
- `/coins/bitcoin/market_chart`
- `/coins/bitcoin/market_chart/range`
- `/coins/bitcoin/ohlc`
- `/coins/bitcoin/ohlc/range`
- `/coins/ethereum/contract/{address}/market_chart/range`

### fixture-doc-honesty

- `/derivatives`
- `/derivatives/exchanges`
- `/derivatives/exchanges/binance_futures`
- `/public_treasury/strategy`
- `/public_treasury/strategy/bitcoin/holding_chart`
- `/public_treasury/strategy/transaction_history`
- `/coins/categories`
- `/coins/categories/list`
- `/diagnostics/runtime`
- Canonical docs named in `validation-contract.md`

## Validation Concurrency

- **Machine**: 8 CPU cores, ~31 GB RAM
- **Observed live API boot cost**: slow startup with enabled providers; dry run consumed ~2.7 GB of available memory headroom during boot and validation
- **Max concurrent validators for the live API surface**: `1`
- **Repo-level automated checks**: targeted Bun/Vitest commands are allowed alongside curl checks, but do not run multiple full-suite jobs concurrently

Reasoning: live-provider startup is the dominant resource and flakiness risk, so validators should serialize real API flows.

## Known Mission Constraints

- Live-provider startup can take roughly a minute; wait for `/ping` before declaring failure.
- The mission manifest intentionally uses a narrower stable CCXT subset (`binance,coinbase,okx`) for live validation to avoid slow/failing bootstrap on less reliable exchanges.
- Upstream CCXT providers can still be flaky or region-blocked. Report provider outages as blockers instead of silently switching to mocks.
- The shared SQLite file can report `database is locked` if another writer is active. Ensure only one mission-owned live API/process is using the shared DB during 3100 validation, or fall back to the isolated 3102 profile when the assertion does not require shared persistent state.
- DeFiLlama-backed onchain discovery is stronger on Ethereum than on non-Ethereum networks.
- Holder/trader analytics remain intentionally fixture-backed.
- Categories and supply-chart surfaces may remain seeded or stubbed depending on the assigned feature; validate them against the canonical docs, not assumptions.

## Flow Validator Guidance: api

- Start exactly one mission-owned live API on `3100` when validating fidelity assertions.
- If a separate validation instance is needed for isolated checks, use `3102`.
- Do not use ports outside `3100-3199`.
- Save evidence only under the assigned mission validation directory.
- Do not edit repository files while validating.
- Prefer exact `curl` requests from `validation-contract.md` so evidence stays auditable.

## Flow Validator Guidance: repo-validations

- Run targeted tests first, then `bun run typecheck`.
- Reserve `bun run test` for milestone scrutiny or when the assigned feature explicitly requires a broader suite.
- Validation workers may inspect source/tests to map assertions to coverage, but must not modify source code.
