# openGecko

> The CoinGecko API you've been using — but open, self-hosted, and yours forever.

openGecko is a drop-in, open-source replacement for the CoinGecko API. Deploy it anywhere, own your infrastructure, and never hit a rate limit again.

---

## Features

| | |
|---|---|
| **~76 Endpoints** | Full CoinGecko-compatible surface — simple, coins, exchanges, derivatives, onchain DEX. |
| **60s Fresh Data** | Hot snapshot layer refreshed every 60 seconds. Every read is fast AND current. |
| **Zero Rate Limits** | Run your own instance. Scale it yourself. No API key, no quota, no surprises. |
| **Self-Hosted** | Deploy on Fly.io, Railway, your own VM. One command to start, SQLite under the hood. |
| **CCXT-Powered** | Aggregates data from Binance, Coinbase, Kraken, OKX, and every exchange CCXT supports. |
| **110+ Tests** | Integration-tested against live exchange data. Production-ready from day one. |

---

## Quick Start

### Docker

```bash
docker run -p 3000:3000 opengecko
```

### From Source

```bash
git clone https://github.com/your-org/opengecko
cd opengecko
bun install
bun run dev
```

The API is available at `http://localhost:3000`. See `docs/execution/INTENT_ARCHITECTURE_VALIDATION_AND_ENTITIES.md` for full endpoint documentation.

---

## Why openGecko

**No rate limits.** Stop watching the clock. Self-host and call the API as much as your infrastructure can handle.

**No vendor lock-in.** Your app breaks when CoinGecko changes pricing or deprecates endpoints. openGecko gives you full control over your data layer.

**Fresh data by default.** A 60-second refresh cadence on market data — your users see what's happening now, not what happened minutes ago.

**Observable freshness.** Every response carries data provenance. Know exactly how old your prices are and when they were last synced.

**Transparent by design.** Every intentional divergence from CoinGecko behavior is documented. No black boxes.

---

## Built With

`Bun` · `TypeScript` · `Fastify` · `SQLite` · `Drizzle ORM` · `CCXT`

---

## Architecture

openGecko is built in three layers. The **Compatibility API** layer exposes the CoinGecko-compatible REST surface — same paths, same parameters, same field names where possible. The **Domain Services** layer handles business logic, freshness rules, and response shaping. The **Storage / Provider** layer keeps a hot snapshot in SQLite (refreshed every 60s) and pulls live data from CCXT-connected exchanges.

```
┌──────────────────────────────────────────────────────────┐
│                   Compatibility API                       │
│            (CoinGecko-compatible REST surface)            │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                    Domain Services                        │
│          (freshness rules, response shaping)             │
└──────────────────────────┬─────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          │                                  │
┌─────────▼─────────┐            ┌───────────▼────────────┐
│      SQLite        │            │          CCXT           │
│   (hot snapshot)   │            │  (Binance, Coinbase,   │
│    60s refresh    │            │   Kraken, OKX, ...)   │
└───────────────────┘            └────────────────────────┘
```

---

## Endpoint Families

| Family | Endpoints | Status |
|---|---|---|
| Simple + General | `/ping`, `/simple/*`, `/asset_platforms`, `/exchange_rates`, `/search`, `/global` | Stable |
| Coins + Contracts | `/coins/*`, `/contracts/*` | Stable |
| Exchanges + Derivatives | `/exchanges/*`, `/derivatives/*` | Stable |
| Public Treasury | `/entities/*`, `/public_treasury/*` | Stable |
| Onchain DEX | `/onchain/*` | In Progress |

---

## Roadmap

- Expanding onchain DEX coverage — more networks and aggregators
- Broader OHLCV history ingestion with deeper coin coverage
- Additional CCXT exchange integrations

---

## Contributing

openGecko welcomes contributors. If you want to add providers, exchanges, or chain adapters, the architecture is designed to make that straightforward. See the planning docs in `docs/plans/` for context on current priorities.

---

## License

[MIT](LICENSE)
