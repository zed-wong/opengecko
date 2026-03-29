# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Environment Variables

All defined in `src/config/env.ts` with defaults unless noted otherwise.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port (mission validation uses `3100`) |
| `HOST` | `0.0.0.0` | Bind host |
| `DATABASE_URL` | `./data/opengecko.db` | SQLite path |
| `CCXT_EXCHANGES` | `binance,bigone,mexc,gate,okx` | Exchange set; mission live validation uses `binance,coinbase,okx` for a more stable core subset |
| `MARKET_FRESHNESS_THRESHOLD_SECONDS` | `300` | Stale data threshold |
| `DEFILLAMA_BASE_URL` | `https://api.llama.fi` | Base URL for DeFiLlama protocol, overview, and price requests |
| `THEGRAPH_API_KEY` | (none) | Legacy path only; do not introduce new The Graph dependencies for the data-fidelity mission |
| `COINGECKO_API_KEY` | (none) | Not required for the data-fidelity uplift mission |

## External Dependencies

- **CCXT**: Live exchange APIs for exchange metadata, tickers, and market snapshots. No auth needed.
- **DeFiLlama**: Use `https://api.llama.fi/` for protocol/overview/price surfaces and `https://yields.llama.fi/` for free yield-pool discovery.
- **SQD/Subsquid**: `https://v2.archive.subsquid.io/network/ethereum-mainnet` for approved Ethereum trade/OHLCV recovery paths.
- **The Graph**: Legacy path only; not an approved new dependency for this mission.
- **SQLite**: File-based at `DATABASE_URL`. No external database service.

## Mission-Specific Notes

- This mission validates real provider-backed fidelity on port `3100`; expect slower boot and occasional upstream flakiness.
- Do not add new providers or credentials unless the orchestrator explicitly expands mission scope.
- Fixture-backed families must remain honest in canonical docs even when runtime routes stay reachable.
