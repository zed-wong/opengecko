# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Environment Variables

All defined in `src/config/env.ts` with defaults. A repo-root `.env` may be used for secrets such as `THEGRAPH_API_KEY`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind host |
| `DATABASE_URL` | `./data/opengecko.db` | SQLite path |
| `CCXT_EXCHANGES` | `binance,bigone,mexc,gate,okx` | Exchange set |
| `MARKET_FRESHNESS_THRESHOLD_SECONDS` | `300` | Stale data threshold |
| `DEFILLAMA_BASE_URL` | `https://api.llama.fi` | Base URL for DeFiLlama protocol, overview, and price requests |
| `THEGRAPH_API_KEY` | (none) | The Graph API key for onchain subgraph queries |

## External Dependencies

- **CCXT**: Live exchange APIs (binance, coinbase, kraken, okx). No auth needed.
- **DeFiLlama**: host split matters for live onchain work. Use `https://api.llama.fi/` for protocol/overview/price surfaces, and `https://yields.llama.fi/` for free yield-pool discovery. `https://api.llama.fi/yields/pools` currently 404s in practice.
- **The Graph**: `https://gateway.thegraph.com/api/` — requires API key, 100K free/month
- **SQLite**: File-based at `DATABASE_URL`. No external database service.
