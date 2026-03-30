# Architecture

Worker-facing architecture for the approved data-fidelity mission. Focus on the stable system shape, source-of-truth ownership, route-family boundaries, and the honesty rules that separate live, hybrid, and fixture-backed behavior.

Unless a section explicitly says **mission target**, statements below should be read as the **current-state architecture and contract baseline** that workers must execute against today.

---

## System Shape

OpenGecko is a modular monolith with four runtime layers:

1. **Provider ingress** pulls public data from approved upstreams.
2. **Normalization and persistence** convert upstream payloads into canonical ids and SQLite-backed state.
3. **Background workers** keep hot snapshots, search indexes, and historical series fresh over time.
4. **Compatibility routes** read persisted state and shape it into CoinGecko-compatible HTTP contracts.

The mission’s central rule is: **HTTP compatibility does not imply live fidelity**. Routes may match CoinGecko paths, params, and field names even when their backing data is live, hybrid, seeded, synthetic, or fixture-backed. Worker changes must preserve that distinction instead of smoothing it over.

### Current-state vs mission-target reading rule

- **Current-state architecture** means what runtime behavior, tests, and validator-facing contracts already expose now.
- **Mission target** means a planned destination described by the mission/tracker, not something workers may assume is already true.
- When writing code or updating worker-facing status, do not collapse these two timelines. A route family can be mission-target live while still current-state hybrid or fixture-backed.
- If a sentence would affect validation, assume it must describe the **current state** unless it is explicitly labeled as a mission target.

## Approved Data Sources

The current approved live-provider set is intentionally small:

- **CCXT**: centralized exchange metadata, market pairs, tickers, volumes, and OHLCV inputs
- **DeFiLlama**: onchain network / DEX / pool / token discovery and Ethereum pool enrichment
- **Subsquid**: Ethereum Uniswap V3 swap-log-backed onchain trades
- **currency-api**: fiat / FX support for exchange-rate style conversions

Everything else should be assumed seeded, synthetic, or fixture-backed unless the tracker or mission explicitly says otherwise. Workers should not infer additional live ownership just because a neighboring route family is live.

## Core Runtime Components

- **Provider adapters** fetch upstream exchange and onchain data.
- **Catalog normalization** maps provider-native symbols, contracts, venues, and chain labels onto canonical coin ids, platform ids, exchange ids, network ids, and DEX ids.
- **SQLite** is the system-of-record for runtime state: market snapshots, exchange ticker state, accumulated chart points, discovery catalogs, and seeded reference data.
- **Refresh / ingestion workers** populate and maintain that state:
  - hot market snapshot refresh
  - exchange ticker ingestion
  - OHLCV worker and chart backfill
  - search rebuild
- **Fastify route modules** expose the compatibility surface and apply route-level validation, filtering, shaping, and fallback semantics.
- **Diagnostics surfaces** expose readiness, degraded mode, freshness, and other runtime state needed by validators and operators.

Relationship summary:

`providers -> normalization -> SQLite -> route modules -> CoinGecko-compatible responses`

Docs and tracker sit beside this path as a contract boundary: if runtime behavior is hybrid or fixture-backed, the canonical status artifacts must describe it the same way.

## Primary Data Flows

### 1. Centralized market flow

1. CCXT fetches exchange metadata, tickers, quote volumes, and chart inputs.
2. Services normalize symbols and venue data into canonical coins, markets, and exchanges.
3. SQLite stores hot market snapshots plus exchange-scoped accumulated history.
4. Routes such as `/simple/*`, `/coins/markets`, `/exchanges/*`, `/global`, and parts of `/search` read from that persisted state.

Important invariant: **fresh-by-default market reads come from internal snapshots, not direct per-request provider calls**.

### 2. Catalog and platform flow

1. Exchange-market metadata and seeded reference catalogs feed canonical coin / platform / contract resolution.
2. Normalization suppresses duplicate alias leakage at discovery surfaces while preserving supported downstream alias resolution.
3. The resulting canonical ids drive `/asset_platforms`, `/coins/list`, `/coins/list/new`, token-list exports, `/search`, and contract-address routes.

Important invariant: **discovery endpoints publish routing state**. If a platform or coin id is emitted by discovery, adjacent detail and contract-resolution surfaces must understand it.

### 3. Onchain discovery flow

1. DeFiLlama provides network, dex, pool, and token discovery inputs, with the strongest live enrichment currently centered on Ethereum.
2. Subsquid provides live trade inputs for supported Ethereum pools.
3. SQLite-backed normalized onchain resources are served through `/onchain/*`.
4. Some analytics families remain fixture-only even when discovery and pool detail are partially live.

Important invariant: **network scoping is strict**. Wrong-network token/pool requests must fail cleanly rather than silently cross-resolving.

### 4. Historical chart flow

1. Hot market refresh and OHLCV ingestion provide current and historical candle inputs.
2. The OHLCV worker persists candles over time with the repository’s **top-100-first** policy.
3. Chart routes shape stored series into `/history`, `/market_chart*`, `/ohlc*`, and related contract-address chart responses.
4. When persisted real candles are missing, fallback behavior may exist but must stay explicit and bounded.

Important invariant: **persisted real history takes precedence over bootstrap, seeded, or synthetic history** whenever it exists.

## Route Families and Fidelity Boundaries

Workers should reason about route families by fidelity class, not just by URL prefix.

### Mostly live

- `/ping`
- `/simple/price`
- `/simple/token_price`
- `/exchange_rates`
- `/asset_platforms`
- live-backed portions of `/exchanges`
- ETH-patched portions of `/onchain/networks/eth/pools`
- live-trade portions of `/onchain/networks/eth/pools/*/trades`

### Hybrid

- `/coins/{id}` and related coin detail/history/chart surfaces
- `/global`
- `/search` and `/search/trending`
- `/token_lists/{asset_platform_id}/all.json`
- `/exchanges/{id}/volume_chart*`
- `/onchain/networks`
- `/onchain/networks/*/tokens/*`
- `/public_treasury/*` where live USD valuation is combined with seeded holdings/transactions

### Fixture / seeded / synthetic

- `/derivatives*`
- `/public_treasury/*/holding_chart`
- `/public_treasury/*/transaction_history`
- `/onchain/*/top_holders`
- `/onchain/*/top_traders`
- `/onchain/*/holders_chart`
- fallback onchain pool OHLCV / trade payloads when live data is absent
- `/coins/list/new` until live new-listing discovery lands
- `/coins/*/circulating_supply_chart*`
- `/coins/*/total_supply_chart*`
- `/global/market_cap_chart`
- seeded categories unless reclassified by mission work

Neighboring endpoints can belong to different classes. Do not upgrade or reinterpret one family based on another family’s current state.

These classifications are **current-state** unless a mission artifact explicitly reclassifies them after shipped runtime changes.

## Runtime and Readiness Invariants

- **Compatibility-first**: route path, query semantics, and field names must stay CoinGecko-compatible.
- **Freshness-first for hot reads**: market-facing live routes should serve persisted fresh snapshots or fail/degrade honestly.
- **Readiness must be machine-readable**: runtime diagnostics must expose the implemented readiness contract in a validator-visible way. Current-state readiness is anchored by the existing machine-readable diagnostics surfaces, not by inventing new enum states in docs.
- **Zero-live must be observable without overclaiming the enum**: “startup finished but no usable live snapshots exist” is a real validator-relevant condition, but current-state contract work treats it as something exposed through diagnostics combinations/booleans and downstream hot-path behavior, not as a guaranteed separate readiness enum value unless runtime/test evidence says so.
- **Degraded behavior must stay explicit**: stale-live or fallback serving cannot masquerade as ordinary fresh operation.
- **Validation flow depends on an externally started server**: smoke scripts and validator flows assume the API is already running and reachable at `localhost:3000` unless overridden.
- **`/health` vs `/ping` is a baseline execution trap**: workers must not assume deploy/readiness docs, smoke flows, and runtime probes are already reconciled. The mission and validation contract explicitly call out that `/health` may still be documented while current runtime behavior only guarantees `/ping`, with readiness actually evaluated through `/diagnostics/runtime`.

## Cross-Family Coupling to Watch

- **Canonical ids** connect `/asset_platforms`, `/coins/list`, `/search`, token lists, contract-address routes, and onchain/token surfaces.
- **Exchange ticker ingestion** feeds both exchange detail/ticker responses and exchange volume-chart accumulation.
- **Coin snapshot and candle storage** feed `/simple`, `/coins/markets`, coin detail market_data, `/history`, `/market_chart*`, and `/ohlc*`.
- **Onchain network/pool/token identity** must remain consistent across pool detail, token detail, trades, and OHLCV routes.
- **Runtime honesty metadata and diagnostics** must tell the same story as the HTTP payload class and the implementation tracker.

## Worker Rules of Thumb

When changing a surface, check these in order:

1. What upstream or seed source actually owns the data?
2. Where is the canonical identity decided?
3. What SQLite state or persisted series does the route read from?
4. Which adjacent route families reuse the same ids, snapshots, or history?
5. Is the route meant to be live, hybrid, or fixture-backed today?
6. Does the HTTP behavior remain honest about that class?
7. If arithmetic is involved, keep calculation paths on `bignumber.js` until the storage or response boundary requires primitives.

## Conflict Resolution When Artifacts Disagree

When runtime, tracker, docs, and worker library text disagree, trust them in this order:

1. **Runtime-observable contract and tests** (`src` behavior plus validator-relevant tests)
2. **Mission-specific validation contract**
3. **Implementation tracker / mission artifacts**
4. **Worker library summaries and broader docs**

Execution rule:

- Never let a doc or tracker statement overrule an already observable runtime/tested contract.
- Never let a broad architecture summary erase a narrower mission validation rule.
- If docs advertise behavior the runtime does not implement yet (example: `/health` vs `/ping`), treat that mismatch as an execution hazard to preserve or resolve explicitly, not as permission to assume the documented behavior is real.
