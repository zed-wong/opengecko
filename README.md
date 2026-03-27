# OpenGecko

> The CoinGecko API you've been using — but open, self-hosted, and yours forever.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Tests](https://img.shields.io/badge/Tests-343%20passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)

A drop-in, open-source replacement for the CoinGecko API. Swap the base URL and your existing integration keeps working.

---

## Quick Start

```bash
git clone https://github.com/zed-wong/OpenGecko
cd OpenGecko
bun install
bun run dev
```

The API is available at `http://localhost:3000`. See `docs/execution/INTENT_ARCHITECTURE_VALIDATION_AND_ENTITIES.md` for full endpoint documentation.

---

## Features

| | |
|---|---|
| **~76 Endpoints** | CoinGecko-compatible REST surface — simple, coins, exchanges, derivatives, onchain DEX. |
| **60s Fresh Data** | Hot snapshot layer refreshed every 60 seconds. Every read is fast and current. |
| **Zero Rate Limits** | Run your own instance. No API key, no quota, no surprises. |
| **SQLite + CCXT** | Hot snapshot in SQLite, live data from Binance, Coinbase, Kraken, OKX, and every exchange CCXT supports. |
| **Observable Freshness** | Every response carries provenance — `initialSyncCompleted` and `allowStaleLiveService` tell you exactly where the data came from. |
| **Runtime Diagnostics** | `/diagnostics/runtime`, `/metrics`, and `/health` expose readiness, degraded-state, and transport health. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Compatibility API                       │
│            (CoinGecko-compatible REST surface)            │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                    Domain Services                       │
│          (freshness rules, response shaping)             │
└──────────────────────────┬─────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          │                                  │
┌─────────▼─────────┐            ┌───────────▼────────────┐
│      SQLite        │            │          CCXT           │
│   (hot snapshot)   │            │  (Binance, Coinbase,    │
│    60s refresh     │            │   Kraken, OKX, ...)     │
└───────────────────┘            └────────────────────────┘
```

OpenGecko exposes the CoinGecko REST surface unchanged — same paths, same parameters, same field names where possible. Business logic lives in domain services. Beneath that, SQLite holds the hot snapshot refreshed every 60 seconds, while CCXT fetches live data from connected exchanges on demand.

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

| Endpoint | Purpose |
|---|---|
| `GET /diagnostics/runtime` | Readiness, degraded-state, transport health, cache behavior |
| `GET /metrics` | Prometheus-compatible metrics surface |
| `GET /health` | Basic liveness probe |

---

## Tech Stack

`Bun` · `TypeScript` · `tsx` · `Fastify` · `better-sqlite3` · `Drizzle ORM` · `CCXT` · `Vitest` · `Zod`

---

## Contributing

OpenGecko welcomes contributors. If you want to add providers, exchanges, or chain adapters, the architecture is designed to make that straightforward. See the planning docs in `docs/plans/` for context on current priorities.

---

## License

[MIT](LICENSE)
