# Architecture

Worker-facing architecture for the data-fidelity uplift mission. Focus on where truth comes from, how it moves through the system, and which surfaces must stay explicitly live, hybrid, or fixture-backed.

---

## System Shape

OpenGecko has three architectural layers that matter for this mission:

1. **Ingress and refresh workers** discover exchanges, coins, platforms, networks, pools, and chart history from public providers.
2. **SQLite-backed runtime state** stores the normalized catalogs, hot market snapshots, and historical series that the API serves.
3. **Compatibility routes** reshape that stored state into CoinGecko-compatible contracts without changing route, parameter, or field semantics.

The key invariant is that compatibility shaping must not invent fidelity. Routes may reshape, filter, and aggregate stored data, but they must remain honest about whether a surface is live-backed, hybrid-from-live, or intentionally fixture-backed.

Workers should assume neighboring surfaces may still have different fidelity classes until the mission explicitly upgrades them. In particular, exchange lists/detail, exchange tickers, exchange volume history, search/trending, categories, supply charts, treasury, and onchain analytics must be treated as separately classified surfaces rather than as one uniform "live" family.

## Core Components and Relationships

- **CCXT exchange provider** is the source of truth for centralized exchange metadata, tickers, volumes, market pairs, and platform hints derivable from exchange markets.
- **Onchain discovery providers** are the source of truth for supported networks, DEXes, pools, token references, and pool-level market context.
- **Catalog and market services** normalize provider output into canonical coin ids, platform ids, exchange ids, and network ids that can be reused across route families.
- **Historical chart pipeline** turns refreshed market and OHLCV inputs into persisted time-series data for `/history`, `/market_chart*`, `/ohlc*`, and related exchange chart routes.
- **Compatibility modules** serve HTTP responses by reading normalized state from SQLite and applying CoinGecko contract semantics.
- **Canonical docs and tracker** define the honesty boundary: if runtime is fixture-backed or intentionally partial, docs must say so explicitly.

## Exchange Refresh Flow

The exchange-fidelity path is:

1. **Exchange discovery and market refresh** pull live exchange metadata and ticker snapshots from CCXT.
2. **Normalization** maps exchange-native symbols and markets onto canonical exchange ids, coin ids, and quote/base relationships.
3. **Persistence** writes the latest ticker/market snapshot plus accumulated volume-history inputs into SQLite.
4. **Serving layer** uses that persisted state for `/exchanges/{id}`, `/exchanges/{id}/tickers`, `/exchanges/{id}/volume_chart`, search/trending inputs, and related aggregate views.

Mission invariant: exchange tickers and exchange volume history must share the same live-refresh ownership window. If tickers are live-backed, adjacent exchange history surfaces cannot silently fall back to unrelated seeded data.

## Platform and Catalog Discovery

Platform and catalog discovery provide the canonical routing vocabulary used by both REST discovery endpoints and contract-address routes.

1. **Platform discovery** derives stable asset-platform ids and chain identifiers from **CCXT-backed exchange market metadata** and other CEX catalog hints already approved for this mission.
2. **Coin/catalog discovery** updates the canonical coin list, including new-listing activation timing used by `/coins/list/new`.
3. **Normalization** removes legacy alias leakage where canonical ids are available.
4. **Propagation** makes the same canonical ids usable across `/asset_platforms`, `/token_lists/{platform}/all.json`, `/coins/list`, `/search`, and `/coins/{platform}/contract/{address}`.

Mission invariant: discovery outputs are not just descriptive; they are routing state. A platform or coin id published by discovery must be consumable by the adjacent route families that depend on it.

## Onchain Discovery

Onchain architecture is split between discovery surfaces that should become live-backed and analytics surfaces that remain intentionally narrow unless a real source exists.

1. **Network and DEX discovery** come from the approved onchain providers for this mission, primarily **DeFiLlama** for network, dex, pool, and token discovery.
2. **Pool and token discovery** provide pool inventories, token detail anchors, and network-scoped resolution.
3. **Onchain market serving** exposes those normalized resources through the JSON:API-style `/onchain/*` family.
4. **Analytics exceptions** such as top holders, top traders, and holders charts remain explicitly fixture-only where no affordable live source exists.

Mission invariant: network scoping must stay strict. Unsupported network/token combinations must fail explicitly or return empty analytics collections rather than fabricating broad coverage.

## Chart History Pipeline

Coin chart history and exchange volume history are adjacent but not identical pipelines.

### Coin History and OHLCV

1. **Hot refresh inputs** provide current prices and market context.
2. **OHLCV ingestion and backfill workers** accumulate persisted candles over time, prioritizing the top-100-first policy for recent and historical coverage.
3. **History shaping** derives CoinGecko-compatible point-in-time and range responses for `/history`, `/market_chart*`, and `/ohlc*`.
4. **Fallback behavior** is allowed only when real candles are absent, and it must remain visibly bounded rather than implying deep historical truth that does not exist.

### Exchange Volume History

1. **Ticker refresh inputs** provide exchange-level market and quote-volume snapshots.
2. **Volume accumulation** writes timestamped exchange volume points into SQLite on the same ownership path as live exchange ticker refresh.
3. **Route shaping** serves `/exchanges/{id}/volume_chart*` from those accumulated points without borrowing coin OHLCV semantics.

Mission invariant: synthetic or degraded chart responses are compatibility fallbacks, not silent substitutes for real history. They must stay narrow and honest.

## Fixture Honesty and Documentation Boundaries

Some families remain intentionally fixture-backed in this mission:

- derivatives
- treasury/public-disclosure routes
- onchain holder/trader analytics and holders charts
- seeded categories unless explicitly reclassified by the mission
- unresolved supply-chart surfaces unless they are explicitly stubbed or reclassified by the mission
- other explicitly documented seeded or unresolved surfaces

These boundaries matter architecturally because runtime, tests, and canonical docs must agree on the same classification.

Mission invariant:

1. **Runtime** must keep fixture-backed families reachable and contract-compatible.
2. **API behavior** must not imply those families are live-powered.
3. **Canonical docs/status artifacts** must describe the same surfaces as fixture-backed, hybrid, or live so workers and validators can trust the classification.

## Worker Guidance

When changing this mission area, reason in this order:

1. What is the source of truth for the surface?
2. Where is it normalized and persisted?
3. Which other route families reuse the same canonical ids or stored history?
4. Is the result live, hybrid-from-live, or fixture-backed?
5. Do runtime behavior and canonical docs still tell the same story?
6. If the change performs arithmetic, use `bignumber.js` for the calculation path and only convert back to primitive values at the storage or HTTP boundary where the contract requires it.
