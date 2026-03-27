# OpenGecko

> The CoinGecko API you've been using — but open, self-hosted, and yours forever.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![Tests](https://img.shields.io/badge/Tests-343%20passing-brightgreen)

A drop-in, open-source replacement for the CoinGecko API. Swap the base URL and your existing integration keeps working. Deploy it anywhere, own your infrastructure, and never hit a rate limit again.

---

## Features

| | |
|---|---|
| **~76 Endpoints** | CoinGecko-compatible REST surface — simple, coins, exchanges, derivatives, onchain DEX. |
| **60s Fresh Data** | Hot snapshot layer refreshed every 60 seconds. Every read is fast and current. |
| **Zero Rate Limits** | Run your own instance. No API key, no quota, no surprises. |
| **343 Tests** | Integration-tested and contract-validated across runtime, compatibility, and frontend-critical API flows. |
| **SQLite + CCXT** | Hot snapshot in SQLite, live data from Binance, Coinbase, Kraken, OKX, and every exchange CCXT supports. |
| **Observable Freshness** | Every response carries data provenance — know exactly how old your prices are and when they were last synced. |
| **Runtime Diagnostics** | `/diagnostics/runtime` and `/metrics` expose readiness, degraded-state, transport, and cache behavior. |

---

## Quick Start

```bash
git clone https://github.com/zed-wong/OpenGecko
cd OpenGecko
bun install
bun run dev
```

> [!TIP]
> The API is available at `http://localhost:3000`. See `docs/execution/INTENT_ARCHITECTURE_VALIDATION_AND_ENTITIES.md` for full endpoint documentation.

---

## Why OpenGecko

**No rate limits.** Stop watching the clock. Self-host and call the API as much as your infrastructure can handle.

**No vendor lock-in.** Your app breaks when CoinGecko changes pricing or deprecates endpoints. OpenGecko gives you full control over your data layer.

**Fresh data by default.** A 60-second refresh cadence on market data — your users see what's happening now, not what happened minutes ago.

**Two-dimensional freshness.** Responses include `initialSyncCompleted` and `allowStaleLiveService` flags so you know whether data came from the hot snapshot or live transport, and whether stale-while-revalidate is active.

**Transparent by design.** Every intentional divergence from CoinGecko behavior is documented. No black boxes.

---

## Architecture

OpenGecko is built in three layers. The **Compatibility API** layer exposes the CoinGecko-compatible REST surface — same paths, same parameters, same field names where possible. The **Domain Services** layer handles business logic, freshness rules, and response shaping. The **Storage / Provider** layer keeps a hot snapshot in SQLite (refreshed every 60s) and pulls live data from CCXT-connected exchanges.

```
┌──────────────────────────────────────────────────────────┐
│                   Compatibility API                       │
│            (CoinGecko-compatible REST surface)            │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                    Domain Services                      │
│          (freshness rules, response shaping)             │
└──────────────────────────┬─────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          │                                  │
┌─────────▼─────────┐            ┌───────────▼────────────┐
│      SQLite        │            │          CCXT           │
│   (hot snapshot)   │            │  (Binance, Coinbase,   │
│    60s refresh     │            │   Kraken, OKX, ...)    │
└───────────────────┘            └────────────────────────┘
```

---

## Endpoint Families

| Family | Endpoints | Phase | Status |
|---|---|---|---|
| Simple + General | `/ping`, `/simple/*`, `/asset_platforms`, `/exchange_rates`, `/search`, `/global` | R0 | Stable |
| Coins + Contracts | `/coins/*`, `/contracts/*` | R1 | Stable |
| Exchanges + Derivatives | `/exchanges/*`, `/derivatives/*` | R2 | Stable |
| Public Treasury | `/entities/*`, `/public_treasury/*` | R3 | Stable |
| Onchain DEX | `/onchain/*` | R4 | In Progress |

---

## Observability

OpenGecko exposes machine-readable diagnostics for production use:

| Endpoint | Purpose |
|---|---|
| `GET /diagnostics/runtime` | Readiness, degraded-state, transport health, cache behavior |
| `GET /metrics` | Prometheus-compatible metrics surface |
| `GET /health` | Basic liveness probe |

---

## Built With

`Bun` · `TypeScript` · `tsx` · `Fastify` · `better-sqlite3` · `Drizzle ORM` · `CCXT` · `Vitest` · `Zod`

---

## Contributing

OpenGecko welcomes contributors. If you want to add providers, exchanges, or chain adapters, the architecture is designed to make that straightforward. See the planning docs in `docs/plans/` for context on current priorities.

---

## License

[MIT](LICENSE)
