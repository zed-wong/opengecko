# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API endpoints, dependency quirks, and platform-specific notes.
**What does NOT belong here:** Service ports or commands (use `.factory/services.yaml`).

---

## Environment Variables

Primary runtime configuration lives in `src/config/env.ts`.

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `0.0.0.0` | HTTP bind host |
| `PORT` | `3000` | HTTP bind port |
| `LOG_LEVEL` | `info` | Runtime log level |
| `DATABASE_URL` | `./data/opengecko.db` | SQLite path |
| `CCXT_EXCHANGES` | `binance,bybit,coinbase,kraken,okx,gate,mexc,bitget` | Active exchange allowlist |
| `MARKET_FRESHNESS_THRESHOLD_SECONDS` | `300` | Fresh/stale cutoff for market reads |
| `MARKET_REFRESH_INTERVAL_SECONDS` | runtime-policy default | Hot market refresh cadence |
| `CURRENCY_REFRESH_INTERVAL_SECONDS` | runtime-policy default | Fiat/exchange-rate refresh cadence |
| `SEARCH_REBUILD_INTERVAL_SECONDS` | runtime-policy default | Search rebuild cadence |
| `PROVIDER_FANOUT_CONCURRENCY` | runtime-policy default | Upstream fanout concurrency limit |
| `REQUEST_TIMEOUT_MS` | `15000` | Upstream request timeout |
| `OHLCV_TARGET_HISTORY_DAYS` | runtime-policy default | Desired OHLCV history target |
| `OHLCV_RETENTION_DAYS` | runtime-policy default | OHLCV retention window |
| `DEFILLAMA_BASE_URL` | `https://api.llama.fi` | DeFiLlama protocol/token base URL |
| `DEFILLAMA_YIELDS_BASE_URL` | `https://yields.llama.fi` | DeFiLlama pool-discovery base URL |
| `RESPONSE_COMPRESSION_THRESHOLD_BYTES` | `1024` | Compression threshold |
| `STARTUP_PREWARM_BUDGET_MS` | `250` | Startup prewarm budget |
| `DISABLE_REMOTE_CURRENCY_REFRESH` | `false` | Disable remote fiat refresh |
| `OPEN_GECKO_DISABLE_REPO_DOTENV` | unset | Mission-only escape hatch to bypass repo `.env` loading for isolated validation runs |

## External Dependencies

- **CCXT**: approved source for exchange metadata, tickers, market pairs, and OHLCV inputs.
- **DeFiLlama**: approved source for onchain network / DEX / pool / token discovery and price enrichment.
- **Subsquid**: approved source for Ethereum Uniswap V3 trade and derived onchain OHLCV paths.
- **currency-api path already present in the repo**: approved for fiat/exchange-rate support.
- **SQLite**: only database used in this mission.

## Mission-Specific Notes

- The repo default `PORT` remains `3000`, but this mission must start its normal local API on port `3001` and reserve port `3102` for the validation-only API profile.
- The repo default `CCXT_EXCHANGES` comes from `src/config/runtime-policy.ts`; `.factory/services.yaml` intentionally narrows the mission API override to `binance,coinbase,okx` for predictable local validation.
- The validation API on `3102` must run with `OPEN_GECKO_DISABLE_REPO_DOTENV=1` and `DATABASE_URL=:memory:` so override-driven checks do not reuse shared repo runtime state.
- `data/opengecko.db` remains the default local runtime DB, but this mission now treats `data/opengecko-validation.db` as the canonical known-good persisted snapshot fallback when the default DB is malformed or unreadable during bootstrap validation.
- Ports `3000` and `5173` are off-limits for mission-owned services because they belong to other local projects.
- Do not add new providers, credentials, hosted services, or background infrastructure without explicit mission scope expansion.
- Fixture-backed families must stay honest in both runtime behavior and canonical planning/status docs.
- Use `bignumber.js` for calculation-heavy logic and only convert to primitives at storage or HTTP boundaries.
- Expect provider-backed startup on the mission API to be much slower than isolated validation startup; plan manual verification accordingly.
