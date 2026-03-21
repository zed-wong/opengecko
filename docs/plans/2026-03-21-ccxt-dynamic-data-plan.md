# 动态数据替代 Seeded 数据方案

## 现状分析

### 当前数据管道

```
Startup:
  seedReferenceData() -> SQLite (coins, market_snapshots[seeded], chart_points, ohlcv_candles, exchanges, coin_tickers)
  rebuildSearchIndex() -> FTS5

Background Loop (60s):
  CCXT (binance/coinbase/kraken) -> fetchExchangeTickers()
    -> quote_snapshots table
    -> market_snapshots (sourceCount > 0 = live)
    -> ohlcv_candles (1m + 1d)
    -> coin_tickers

API Request:
  SQLite -> market-freshness.ts (seeded/live/stale check) -> response
```

### 核心问题

1. **`sourceCount=0` 的 seeded 快照** 在 boot refresh 完成后会被拒绝（`allowSeededFallback=false`）
2. **coins 表** 只通过 `syncCoinCatalogWithBinance()` 从 Binance 同步，覆盖的币种有限
3. **exchanges 表** 完全来自 seed 常量，没有从 CCXT 动态获取
4. **chart_points / ohlcv_candles** 的历史数据来自 seed 常量（7天 * 8币种），backfill 脚本存在但未集成到启动流程
5. **coin_tickers** 一部分来自 seed，一部分来自 refresh 循环
6. **derivatives_exchanges / derivative_tickers** 完全来自 seed

### CCXT 可提供的数据

| 数据 | CCXT 方法 | 对应表 |
|------|-----------|--------|
| 交易所列表 | `exchange.markets` / `exchange.id` | `exchanges` |
| 币种列表 | `exchange.loadMarkets()` -> markets | `coins` |
| 实时行情 | `fetchTickers()` | `quote_snapshots`, `market_snapshots` |
| 历史 OHLCV | `fetchOHLCV(symbol, '1d', since)` | `ohlcv_candles` |
| 交易所元数据 | `exchange.name`, `exchange.urls` | `exchanges` |

### CCXT 无法提供的数据（仍需 seed 或其他来源）

- `asset_platforms` — 区块链平台注册表（需维护静态映射）
- `categories` — 币种分类（CCXT 无此概念）
- `treasury_*` — 公司/政府持仓（需外部数据源）
- `onchain_*` — 链上 DEX 数据（需 GeckoTerminal API 或类似源）
- 搜索索引 — 需在数据加载后重建

---

## 方案：三层改造

### 第一层：启动时阻塞式同步（最关键）

**目标：** 移除 seeded 市场数据，启动时必须先拿到真实数据再接受请求。

#### 1.1 改造启动流程

当前启动链路（`src/app.ts:23-57`）：
```
buildApp() [同步] -> initializeDatabase() -> seedReferenceData()
                  -> onReady hook: runtime.start() [异步]
```

**选定方案：阻塞同步放在 `onReady` hook 前半段。**

原因：`buildApp()` 是同步函数，Fastify 的 plugin 注册和路由注册都依赖这个约束。改成 async 会影响所有调用方。把阻塞逻辑放在 `onReady` 里是 Fastify 原生支持的异步 hook，语义清晰且不改变 `buildApp()` 的签名。

改造后：
```
buildApp() [同步，不变]
  -> initializeDatabase() -> seedStaticReferenceData()   // 只 seed 非市场数据
  -> onReady hook:
       await runInitialMarketSync()                      // 阻塞，确保有数据
       await rebuildSearchIndex()
       runtime.start()                                   // 后台刷新循环启动
```

`runInitialMarketSync()` 做的事：
1. 从 3 个 CCXT 交易所 loadMarkets，合并币种注册表（使用 `buildCoinId()`）
2. fetchTickers 获取全量行情
3. 写入 market_snapshots（sourceCount > 0）
4. 跑一次 backfill 获取历史 OHLCV（至少 30 天）

**接口变更明细：**

| 文件 | 变更 | 说明 |
|------|------|------|
| `src/app.ts:46-49` | 拆分 onReady hook | 先 `await runInitialMarketSync()` + `rebuildSearchIndex()`，再 `runtime.start()` |
| `src/services/market-runtime.ts` | `start()` 拆为 `runInitialSync()` + `startRefreshLoop()` | 或保留 `start()` 但内部先跑 initial sync |
| `src/db/client.ts` | `initializeDatabase()` 不再调用 `seedReferenceData()` | 改为只调用 `seedStaticReferenceData()` |
| 无 | `buildApp()` 签名不变 | 保持同步，不破坏调用方 |

#### 1.2 拆分 seedReferenceData()

当前 `seedReferenceData()` 在 `src/db/client.ts:66-1281` 内联了所有 seed 数据。

拆分为：
- `seedStaticReferenceData()` — 只保留非市场数据：
  - `asset_platforms`（3 条）
  - `categories`（2 条）
  - `treasury_entities`（2 条）
  - `treasury_holdings`（2 条）
  - `treasury_transactions`（6 条）
  - `onchain_networks`（2 条）
  - `onchain_dexes`（3 条）
- 移除所有市场数据 seed：
  - `seededCoins` → 改为从 CCXT loadMarkets 动态构建
  - `seededSnapshots` → 改为从 CCXT fetchTickers
  - `buildSeededChartPoints()` → 改为从 CCXT fetchOHLCV
  - `buildSeededOhlcvCandles()` → 同上
  - `seededExchanges` → 改为从 CCXT 动态构建
  - `seededCoinTickers` → 改为从 CCXT fetchTickers
  - `buildSeededExchangeVolumePoints()` → 改为从 CCXT fetchTickers 聚合

#### 1.3 币种注册表动态化

改造 `syncCoinCatalogWithBinance()` → `syncCoinCatalogFromExchanges()`：

**关键约束：必须复用现有 `buildCoinId()` + `COIN_ID_OVERRIDES` 映射（`src/services/coin-catalog-sync.ts:7-63`）。**

当前 `COIN_ID_OVERRIDES` 维护了 `BTC→bitcoin`、`DOGE→dogecoin`、`ADA→cardano` 等 28 条映射，`buildCoinId()` 的优先级是：override 表 > `slugify(baseName)` > `symbol.toLowerCase()`。直接用 `market.base.toLowerCase()` 会把 BTC 映射成 `btc` 而非 `bitcoin`，导致：
- `coin_tickers.coinGeckoUrl` 指向不存在的 CoinGecko 页面
- `market_snapshots` / `ohlcv_candles` 的 `coin_id` 外键断裂
- 与既有 seeded 数据中的 canonical id 不一致

改造策略：
1. 将 `buildCoinId()`、`buildCoinName()`、`COIN_ID_OVERRIDES`、`slugify()` 从 `coin-catalog-sync.ts` 提取到 `src/lib/coin-id.ts` 作为共享工具
2. 扩充 `COIN_ID_OVERRIDES`，覆盖所有交易所共有的主流币种
3. `syncCoinCatalogFromExchanges()` 从多交易所 loadMarkets 合并，但对每个 market.base 调用 `buildCoinId()` 生成 canonical id
4. 如果同一 canonical id 从多个交易所发现，保留第一个 name（或使用 override 表中的 name），不互相覆盖

```typescript
// src/lib/coin-id.ts — 从 coin-catalog-sync.ts 提取
export const COIN_ID_OVERRIDES = { BTC: 'bitcoin', DOGE: 'dogecoin', /* ...完整列表... */ };
export function buildCoinId(symbol: string, baseName: string | null): string { /* 现有逻辑 */ }
export function buildCoinName(symbol: string, baseName: string | null): string { /* 现有逻辑 */ }
```

```typescript
// src/services/coin-catalog-sync.ts — 改造后
import { buildCoinId, buildCoinName } from '../lib/coin-id';

export async function syncCoinCatalogFromExchanges(
  database: AppDatabase,
  exchangeIds: SupportedExchangeId[],
) {
  const discoveredCoins = new Map<string, typeof coins.$inferInsert>();
  const existingCoins = new Map(database.db.select().from(coins).all().map((c) => [c.id, c]));
  const now = new Date();

  for (const exchangeId of exchangeIds) {
    const markets = await fetchExchangeMarkets(exchangeId);
    for (const market of markets) {
      if (!market.active || !market.spot) continue;

      const coinId = buildCoinId(market.base, market.baseName);
      if (discoveredCoins.has(coinId)) continue;

      const existing = existingCoins.get(coinId);
      if (existing && existing.symbol.toLowerCase() !== market.base.toLowerCase()) continue;

      discoveredCoins.set(coinId, {
        id: coinId,
        symbol: market.base.toLowerCase(),
        name: buildCoinName(market.base, market.baseName),
        apiSymbol: coinId,
        /* ...保留现有字段默认值逻辑... */
      });
    }
  }

  // upsert — 保留与现有 syncCoinCatalogWithBinance 相同的 onConflictDoUpdate 策略
  for (const value of discoveredCoins.values()) {
    database.db.insert(coins).values(value).onConflictDoUpdate({ /* ... */ }).run();
  }
}
```

#### 1.4 交易所注册表动态化

从 CCXT 获取交易所元数据，替代 seed 常量：

```typescript
async function syncExchangesFromCCXT(exchangeId: SupportedExchangeId): Promise<void> {
  const exchange = createExchange(exchangeId);
  await exchange.loadMarkets();

  // 构建 exchange 记录
  const record = {
    id: exchangeId,
    name: exchange.name,
    url: exchange.urls?.www ?? '',
    // trust_score / trust_score_rank 需要从 CoinGecko API 或手动维护
    // 或者基于 sourceCount 和 ticker 数量自动生成
  };

  database.insert(exchanges).values(record).onConflictDoNothing().run();
}
```

### 第二层：OHLCV 历史数据

#### 2.1 集成 backfill 到启动流程

当前 backfill 是独立脚本 `src/jobs/backfill-ohlcv.ts`。

改为在启动时执行：
- 首次启动：获取 365 天历史
- 后续启动：获取最近 30 天（增量覆盖）
- 用 `replaceExisting: true` 确保数据最新

#### 2.2 交易所成交量

当前 `exchange_volume_points` 完全来自 seed。

**口径问题：** CCXT `ticker.quoteVolume` 是 **rolling 24h** 值，每分钟采集的值都不同，且不是"当日累计"。而 `ohlcv_candles` 的 volume 是日历日聚合，不同交易所可能是 base volume 或 quote volume。两者时间语义和单位不同，不可直接拼接成同一张时间序列表。

**方案：重新定义 `exchange_volume_points` 的语义，与 OHLCV volume 彻底分离。**

定义：`exchange_volume_points` 记录 **每次 market refresh 采集时的 snapshot**，即"此刻该交易所的 24h rolling volume (USD)"。它回答的问题是"这个时间点交易所的活跃成交量是多少"，而非"当日总成交"。

具体做法：
1. 每次 `runMarketRefreshOnce()` 中，对每个交易所聚合其所有 ticker 的 `quoteVolume`，写入 `exchange_volume_points` 一条记录（`exchange_id, timestamp, volume_usd`）
2. 这样表里会有每 60 秒一条的高频数据，volume_chart 端点按 `days` 参数做下采样（取每小时最后一条 / 每日最后一条）
3. 历史回填：从 OHLCV 的 daily volume 反推不可行（口径不同），历史数据只能从"首次部署后的 refresh 积累"获得。首次部署没有交易所维度的历史数据，这是可接受的降级。
4. **不在 `exchange_volume_points` 中混入 OHLCV volume**，避免图表失真

### 第三层：后台刷新加固

#### 3.1 启动时阻塞 vs 后台刷新

见 1.1 节。阻塞同步在 `onReady` hook 前半段完成，`runtime.start()`（后台刷新循环）在其后启动。

#### 3.2 Freshness / Access Policy 改造为两维度模型

当前模型（`src/modules/market-freshness.ts:12-59`）是一维的：
```typescript
type SnapshotAccessPolicy = { allowSeededFallback: boolean };
```
只区分 seeded vs live/stale，无法表达"live but stale on boot"这个场景。

**改造为两维度模型：**

```typescript
type SnapshotAccessPolicy = {
  initialSyncCompleted: boolean;   // 替代 allowSeededFallback
  allowStaleLiveService: boolean;  // 冷启动降级：允许用残留 live 数据启动
};
```

`getUsableSnapshot()` 判断逻辑：

```typescript
function getUsableSnapshot(snapshot, thresholdSeconds, accessPolicy, now) {
  if (!snapshot) return null;

  const ownership = getSnapshotOwnership(snapshot); // 'seeded' | 'live'

  // seeded 市场数据：全部拒绝（不再有 seeded market data）
  if (ownership === 'seeded') return null;

  // live 数据
  const isStale = getSnapshotFreshness(snapshot, thresholdSeconds, now).isStale;

  if (!isStale) return snapshot;                    // fresh → 通过
  if (accessPolicy.allowStaleLiveService) return snapshot;  // stale 但允许降级 → 通过
  return null;                                       // stale 且不允许 → 拒绝
}
```

**降级策略（对应风险 3）：**

| 场景 | `initialSyncCompleted` | `allowStaleLiveService` | 行为 |
|------|----------------------|----------------------|------|
| 正常启动，网络可用 | true (sync 后) | false | 只用 fresh live 数据 |
| 冷启动，SQLite 有残留 live 数据，网络不可用 | false | true | 用 stale live 数据，标记 warning |
| 冷启动，SQLite 空，网络不可用 | false | false | 启动失败，返回 503 |

`market-runtime-state.ts` 改造：

```typescript
type MarketDataRuntimeState = {
  initialSyncCompleted: boolean;       // 替代 hasCompletedBootMarketRefresh
  allowStaleLiveService: boolean;      // 冷启动降级开关
  syncFailureReason: string | null;    // 记录失败原因，供日志和 health 端点使用
};
```

所有消费 `getSnapshotAccessPolicy()` 的地方（`simple.ts`、`coins.ts`、`exchanges.ts`、`global.ts`、`conversion.ts`）都需要适配新签名。

#### 3.3 扩大刷新范围

当前只从 3 个交易所拉取。优化：
- 并发请求 3 个交易所（已经是）
- 增加 symbol 覆盖（当前只拉 USDT/USD/EUR quote 的）
- 对于 volume_chart，每次 refresh 写入当日数据点

---

## 实施步骤

### Phase 1: 启动时阻塞同步（1-2 天）

1. 在 `src/services/` 新增 `initial-sync.ts`
2. 实现 `runInitialMarketSync(database, config)`:
   - 调用 `syncCoinCatalogFromExchanges()` 替代 `syncCoinCatalogWithBinance()`
   - 对 3 个交易所调用 `fetchExchangeTickers()`
   - 写入 `market_snapshots`（sourceCount > 0）
   - 写入 `coin_tickers`
   - 同步 `exchanges` 表
3. 改造 `src/app.ts` onReady hook：先 `await runInitialMarketSync()` + `rebuildSearchIndex()`，再调 `runtime.start()`。`buildApp()` 保持同步签名不变
4. 将 `buildCoinId()`、`buildCoinName()`、`COIN_ID_OVERRIDES` 提取到 `src/lib/coin-id.ts`，扩充覆盖范围
5. 拆分 `seedReferenceData()` 为 `seedStaticReferenceData()`
6. 删除 `seededCoins`, `seededSnapshots`, `seededChartPoints`, `seededOhlcvCandles`, `seededExchanges`, `seededCoinTickers`, `seededExchangeVolumePoints` 常量

### Phase 2: OHLCV 历史集成（1 天）

1. 将 `src/jobs/backfill-ohlcv.ts` 的逻辑提取为可复用函数
2. 在 `runInitialMarketSync()` 末尾调用 backfill（首次 365 天，后续 30 天）
3. `exchange_volume_points` 改为记录每次 refresh 的 24h rolling volume snapshot（不做 OHLCV volume 混用），首次部署无历史数据是可接受降级

### Phase 3: 清理和加固（1 天）

1. 改造 `market-runtime-state.ts`：`hasCompletedBootMarketRefresh` → `initialSyncCompleted` + `allowStaleLiveService` + `syncFailureReason`
2. 改造 `market-freshness.ts`：`SnapshotAccessPolicy` 从 `{ allowSeededFallback }` 改为 `{ initialSyncCompleted, allowStaleLiveService }`，删除 seeded 分支，增加 stale-live 降级分支
3. 适配所有消费 `getSnapshotAccessPolicy()` 的路由模块（`simple.ts`、`coins.ts`、`exchanges.ts`、`global.ts`、`conversion.ts`）
4. 更新测试：移除所有依赖 seeded 数据的 fixture，改为 mock CCXT 响应；新增 stale-live 降级场景测试
5. 更新 `src/db/client.ts`：移除 ~1200 行 seed 常量代码，只保留 `seedStaticReferenceData()`

---

## 风险和应对

### 风险 1：启动时间变长

- fetchTickers x 3 交易所 ≈ 3-5 秒
- loadMarkets x 3 交易所 ≈ 2-3 秒
- backfill OHLCV ≈ 10-30 秒（首次），2-5 秒（后续）
- **应对：** 首次启动允许较长等待；后续启动用 SQLite 中已有数据做增量更新。显示启动进度日志。

### 风险 2：CCXT API 限流

- 启动时请求量大
- **应对：** 已有 `enableRateLimit: true`；backfill 使用 `sleep` 间隔；对单个交易所串行请求。

### 风险 3：网络不可用 / 交易所宕机

- 启动时如果 CCXT 不可用，服务无法启动
- **应对：** 如果 SQLite 中有历史数据（上次运行留下的），直接使用并标记为 stale。只有在完全空库 + 网络不可用时才降级为错误退出。保留极小量的 fallback seed 数据（仅用于 emergency 模式）。

### 风险 4：测试依赖真实网络

- **应对：** 测试中 mock CCXT provider 函数。已有 `market-refresh.test.ts` 使用 mock，延续此模式。

---

## 预期效果

| 项目 | 改造前 | 改造后 |
|------|--------|--------|
| coins 表 | 8 个 seeded 币种 | 数百个（从 3 个交易所的 markets 合并） |
| market_snapshots | 8 行 seeded (sourceCount=0) | 数百行 live (sourceCount>0) |
| chart_points | 56 行 (7天*8币种) | 移除，改用 ohlcv_candles |
| ohlcv_candles | 56 行 seeded | 数千行（365天 * 币种数，从 CCXT backfill） |
| exchanges 表 | 3 行 seeded | 3 行（从 CCXT 动态获取元数据） |
| coin_tickers | 10 行 seeded | 数百行（从 fetchTickers 实时写入） |
| exchange_volume_points | 21 行 seeded | 每次 refresh 写入 24h rolling snapshot（高频，按需下采样）；无历史回填 |
| 启动时间 | <1 秒 | 5-30 秒（取决于是否首次） |
| 数据新鲜度 | 2026-03-20 固定 | 实时（60s 刷新周期） |
| seeded 代码量 | ~1200 行常量 | ~60 行（仅 static reference data） |
