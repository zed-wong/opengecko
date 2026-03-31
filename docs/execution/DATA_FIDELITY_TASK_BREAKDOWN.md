# OpenGecko 03-29 数据保真度提升计划 - 完整任务清单

> 基于 `docs/plans/2026-03-29-data-fidelity-uplift-plan.md`

---

## 当前状态快照 (2026-03-30)

| 阶段 | 任务数 | 状态 | 影响 |
|------|--------|------|------|
| Phase 1 | 5 | **4 完成, 1 待办** | 交易所和平台保真度大幅减少 |
| Phase 2 | 5 | 待办 | 链上覆盖提升, coin 丰富 |
| Phase 3 | 5 | 待办 | fixture 运行时诚实性 + 文档 |
| Phase 4 | 2 | 待办 | 图表历史改进 |
| **总计** | **17** | **进行中** | 实时覆盖率目标: ~30% → ~55% |

**当前阻碍**: Main Vitest 套件正在失败，需要先修复测试。

---

## Phase 0: 前置阻断任务 (必须首先完成)

### P0.1 修复主测试套件回归
**优先级**: 🔴 Critical
**状态**: 进行中
**技术动作**:
1. 运行 `bun run test` 识别失败测试
2. 分类失败原因:
   - 与实时数据相关的脆弱测试 (需要宽松期望)
   - 与平台/目录发现相关的测试 (需要更新断言)
   - 与运行时状态相关的测试 (需要同步逻辑)
3. 修复每个失败测试组:
   - 更新超时配置以应对实时数据获取
   - 调整 exchange volume ownership 期望
   - 修复 search module 类型安全问题
   - 恢复 canonical bootstrap markets backfill
4. 验证: `bun run test` 全绿

**验收标准**:
- [ ] `bun run test` 返回 0
- [ ] 没有与 Parity 相关的失败
- [ ] 没有与运行时敏感区域相关的失败

---

## Phase 1: Quick Wins (剩余 1 任务)

### P1.1 实时新币发现 (Task 1.5)
**优先级**: 🔴 High
**状态**: 待办
**影响端点**: `/coins/list/new`
**提供者**: CCXT `fetchMarkets()` + market diff
**技术动作**:

1. **数据模型准备**
   - 修改 `coins` 表 schema (如果必要):
     - 确认 `createdAt` 字段目前使用种子数据
     - 新增 `firstSeenAt` 字段 (timestamp) - 记录 CCXT 首次发现时间
     - 新增 `listingSource` 字段 (text) - 记录发现来源 (如 'ccxt_binance')
   - 生成 migration: `bun run db:generate`
   - 应用 migration: `bun run db:migrate`

2. **CCXT 提供者扩展**
   - 修改 `src/providers/ccxt.ts`:
     - 新增 `fetchNewMarketsSince(lastCheck: Date)` 函数
     - 对每个活跃交易所 (binance, bybit, coinbase, kraken, okx, gate, mexc, bitget):
       - 调用 `exchange.fetchMarkets()`
       - 对比上次检查时间，识别新增 symbol
       - 返回新市场列表 (symbol, base, quote, timestamp)

3. **新币发现服务**
   - 创建 `src/services/new-coin-discovery.ts`:
     - `discoverNewCoins()`: 协调多交易所发现
     - `recordNewCoin(coinId, symbol, name, firstSeenAt, source)`: 记录新币
     - 处理重复: 如果多个交易所同时上线同一币种，使用最早时间

4. **集成到市场刷新**
   - 修改 `src/jobs/refresh-market-snapshots.ts`:
     - 在刷新循环中调用 `discoverNewCoins()`
     - 配置可调整的发现间隔 (默认 300s)
     - 确保新发现的币被立即纳入快照刷新

5. **端点适配**
   - 修改 `src/modules/coins.ts` 中的 `/coins/list/new`:
     - 从按 `createdAt` 排序改为按 `firstSeenAt` 排序
     - 添加 `listingSource` 到响应 payload

6. **验证**
   - 编写测试: 模拟 CCXT 返回新市场，验证端点响应
   - 运行模块测试: `bun run test:endpoint:coins`

**验收标准**:
- [ ] `/coins/list/new` 按真实发现时间排序 (非种子 createdAt)
- [ ] 新币在上线交易所后 5 分钟内被检测到
- [ ] 测试覆盖正常情况和边界情况 (重复、多个交易所)

**依赖**: P0.1 测试套件修复完成

---

## Phase 2: Meaningful Uplift (5 任务)

### P2.1 DeFiLlama Pool 发现扩展
**优先级**: 🟡 Medium
**状态**: 待办
**影响端点**: `/onchain/networks/eth/pools`
**提供者**: DeFiLlama `getPools()`
**技术动作**:

1. **DeFiLlama 提供者增强**
   - 修改 `src/providers/defillama.ts`:
     - 新增 `fetchPools(network: string)` 函数
     - 调用 DeFiLlama API: `https://yields.llama.fi/pools`
     - 过滤目标网络 (Ethereum)
     - 解析 pool 数据: address, tvl, apy, volumeUSD

2. **Pool 同步服务**
   - 创建 `src/services/pool-discovery-sync.ts`:
     - `syncPoolsFromDeFiLlama()`: 获取并更新 pool 数据
     - 处理 pool 元数据映射到本地 schema
     - 配置刷新间隔

3. **端点适配**
   - 修改 `src/modules/onchain.ts`:
     - `/onchain/networks/{id}/pools` 从种子数据 + patch 改为 DeFiLlama 主动发现
     - 保留种子作为 fallback

**验收标准**:
- [ ] Ethereum pools 数量从 4 个种子扩展到 DeFiLlama 提供的数量
- [ ] 响应时间 < 500ms (可接受 stale cache)

---

### P2.2 DeFiLlama Token 发现 (ETH)
**优先级**: 🟡 Medium
**状态**: 待办
**影响端点**: `/onchain/networks/eth/tokens/{id}`
**提供者**: DeFiLlama
**技术动作**:

1. **Token 价格服务**
   - 创建 `src/services/token-price-service.ts`:
     - `getTokenPrice(network, contractAddress)`: 查询 DeFiLlama
     - 使用 DeFiLlama token prices API

2. **端点适配**
   - 修改 `src/modules/onchain.ts`:
     - token 端点优先使用 DeFiLlama 价格
     - 保留种子价格作为 fallback

**验收标准**:
- [ ] ETH 网络 token 价格实时来自 DeFiLlama
- [ ] 非 ETH 网络继续返回种子/空

---

### P2.3 多网络 DeFiLlama 发现
**优先级**: 🟡 Medium
**状态**: 待办
**影响端点**: `/onchain/networks`
**提供者**: DeFiLlama 多链
**技术动作**:

1. **网络发现服务**
   - 创建 `src/services/network-discovery.ts`:
     - `discoverNetworksFromDeFiLlama()`: 获取支持的链列表
     - 映射到本地 `onchainNetworks` 表

2. **端点适配**
   - 修改 `/onchain/networks`:
     - 从 2 个种子网络 (eth, sol) 扩展到 DeFiLlama 支持的网络
     - 保留核心网络元数据

3. **DEX 发现**
   - 扩展网络发现以包含每个网络的 DEX 列表

**验收标准**:
- [ ] 支持的网络数量从 2 扩展到 10+
- [ ] 每个网络显示正确的 DEX 列表

---

### P2.4 Coin 丰富: CCXT 描述/链接
**优先级**: 🟡 Medium
**状态**: 待办
**影响端点**: `/coins/{id}` 的 description, links 字段
**提供者**: CCXT exchange markets metadata
**技术动作**:

1. **CCXT 元数据提取**
   - 修改 `src/providers/ccxt.ts`:
     - `fetchCoinMetadata(symbol)`: 从交易所获取币种信息
     - 提取: website, explorer, twitter, telegram, reddit 等

2. **丰富服务**
   - 创建 `src/services/coin-enrichment.ts`:
     - `enrichCoinMetadata(coinId)`: 聚合多交易所元数据
     - 存储到 `coins.descriptionJson`, `coins.linksJson`

3. **定时任务**
   - 创建 `src/jobs/enrich-coin-metadata.ts`:
     - 定期丰富 Top 100 coins
     - 按需丰富请求的 coins

4. **端点适配**
   - 修改 `buildCoinDetail` 以返回丰富的 description/links

**验收标准**:
- [ ] `/coins/{id}` 返回非空的 description 和 links (Top 100 coins)
- [ ] community/developer 字段保持诚实 null (除非找到可靠来源)

---

### P2.5 Subsquid 地址标签增强
**优先级**: 🟡 Medium
**状态**: 待办
**影响端点**: `/onchain/*/pools/*/trades`
**提供者**: Subsquid + 地址标签服务
**技术动作**:

1. **地址标签服务**
   - 创建 `src/services/address-labels.ts`:
     - 维护已知地址映射 (DEX router, 知名钱包, MEV bot)
     - 从 Etherscan labels, Nansen 等获取公开标签

2. **Trades 端点适配**
   - 修改 `src/modules/onchain.ts`:
     - 在返回 trades 时添加 `fromLabel`, `toLabel` 字段

**验收标准**:
- [ ] 常见地址 (如 Uniswap Router) 显示人类可读标签
- [ ] 未知地址保持原始地址格式

---

## Phase 3: Known Fixtures (5 任务)

### P3.1 Document Derivatives as Fixture
**优先级**: 🟢 Low
**状态**: 待办
**技术动作**:

1. **端点文档化**
   - 修改 `src/modules/derivatives.ts` 添加 JSDoc:
     ```typescript
     /**
      * @fixture true
      * @note Derivatives data is frozen fixture as of 2026-03-20.
      *       No live CCXT derivatives fetch exists.
      */
     ```

2. **Tracker 更新**
   - 在 `docs/status/implementation-tracker.md` 中:
     - Derivatives 行添加 `fixture: true` 标签
     - 添加说明: "3 hardcoded tickers (BTC/ETH perpetual + 1 expired), 2 exchanges"

3. **响应头 (可选)**
   - 添加 HTTP header: `X-Data-Source: fixture`

**验收标准**:
- [ ] 文档清楚表明 derivatives 是 fixture
- [ ] Tracker 准确反映 fixture 状态

---

### P3.2 Document Treasury as Fixture
**优先级**: 🟢 Low
**状态**: 待办
**技术动作**:

1. **端点文档化**
   - 修改 `src/modules/treasury.ts` 添加 JSDoc:
     ```typescript
     /**
      * @fixture true
      * @note Treasury data: 2 entities, 6 transactions, fixed holdings.
      *       USD values from live snapshots.
      *       No live disclosure ingestion.
      */
     ```

2. **Tracker 更新**
   - 在 tracker 中添加 fixture 标签和说明

**验收标准**:
- [ ] 文档清楚表明 treasury 是 fixture (除 USD value 外)

---

### P3.3 Document Onchain Holders/Traders as Fixture
**优先级**: 🟢 Low
**状态**: 待办
**技术动作**:

1. **端点文档化**
   - 修改 `src/modules/onchain.ts`:
     - `top_holders`, `top_traders`, `holders_chart` 添加 JSDoc
     - 说明: "USDC only, fake addresses. No affordable on-chain indexer data."

2. **Tracker 更新**
   - 添加 fixture 标签

**验收标准**:
- [ ] 文档清楚表明 holders/traders 是 fixture

---

### P3.4 Document Categories as Fixture
**优先级**: 🟢 Low
**状态**: 待办
**技术动作**:

1. **端点文档化**
   - 修改 `src/modules/coins.ts` 中 categories 相关端点
   - 说明当前只有 2 个种子 categories

2. **Tracker 更新**

**验收标准**:
- [ ] 文档清楚表明 categories 是 fixture

---

### P3.5 Supply Charts 处理
**优先级**: 🟢 Low
**状态**: 待办
**选项**:
- **选项 A**: 移除端点 (返回 404)
- **选项 B**: 返回空数组 (诚实表示无数据)
- **选项 C**: 保留 fixture 但文档化

**技术动作** (假设选 C):

1. **端点文档化**
   - 修改 `circulating_supply_chart`, `total_supply_chart` 端点
   - 说明数据来自合成图表数据

**验收标准**:
- [ ] 选择方案并实施
- [ ] 更新 tracker

---

## Phase 4: Chart History (2 任务)

### P4.1 扩展 OHLCV Worker 到 7 天蜡烛
**优先级**: 🟡 Medium
**状态**: 待办
**影响端点**: `/coins/{id}/market_chart`, `/ohlc`, `/ohlc/range`
**技术动作**:

1. **目标调整**
   - 修改 `src/services/ohlcv-priority.ts`:
     - 当前: Top 100 优先
     - 新增: "过去 30 天内活跃的所有币"

2. **Worker 逻辑增强**
   - 修改 `src/jobs/run-ohlcv-worker.ts`:
     - 扩展工作队列以包含活跃币
     - 保持 Top 100 最高优先级

3. **性能考虑**
   - 监控 SQLite 写入性能
   - 考虑批处理大小调整

**验收标准**:
- [ ] Top 100 币有完整 7 天蜡烛数据
- [ ] 过去 30 天活跃币至少有部分蜡烛数据
- [ ] Worker 运行时间可接受 (< 1小时/周期)

---

### P4.2 减少合成数据窗口
**优先级**: 🟡 Medium
**状态**: 待办
**影响**: 所有图表端点
**技术动作**:

1. **合成策略调整**
   - 修改 `src/modules/coins/charts.ts`:
     - 当前: 返回 7 天合成蜡烛作为 fallback
     - 新: 仅对无真实数据的币返回合成数据
     - 减少合成窗口到 1 天或无

2. **诚实回退**
   - 添加 HTTP header 或字段指示数据是 synthetic
   - 文档化 fallback 行为

**验收标准**:
- [ ] 有真实数据的币返回真实 OHLCV
- [ ] 无真实数据的币明确标记为合成数据
- [ ] 文档清楚说明 fallback 行为

---

## 跨阶段任务

### C1. 更新 Implementation Tracker
**频率**: 每完成一个任务
**技术动作**:
1. 更新 "Data Quality Summary" 表格
2. 更新 "Workstream Status"
3. 更新 "Endpoint Family Progress"
4. 更新 "Known Data-Fidelity Follow-ups"
5. 添加完成的里程碑到 "Completed Milestones"

### C2. 版本发布
**触发**: 完成 Phase 1 + Phase 2
**技术动作**:
1. 更新 `package.json` version (minor bump)
2. 更新 `src/services/startup-progress.ts` banner
3. 更新 CHANGELOG.md
4. 运行完整测试套件
5. 创建 PR 并合并

### C3. 性能回归测试
**频率**: Phase 2 和 Phase 4 完成后
**技术动作**:
1. 运行端点性能测试: `bun run test:endpoint`
2. 对比基准性能数据
3. 识别并修复回归

---

## 依赖关系图

```
P0.1 (测试修复)
    │
    ├──> P1.1 (新币发现)
    │       │
    │       └──> C2 (版本发布)
    │
    ├──> P2.1-P2.5 (Phase 2 可并行)
    │       │
    │       └──> C2 (版本发布)
    │
    ├──> P3.1-P3.5 (Phase 3 可并行)
    │
    └──> P4.1-P4.2 (Phase 4 依赖 P2/P3 完成)
            │
            └──> C3 (性能回归测试)
```

---

## 执行建议顺序

| 周 | 任务 | 产出 |
|----|------|------|
| W1 | P0.1 + P1.1 | 绿色测试套件 + 实时新币发现 |
| W2 | P2.1 + P2.2 | DeFiLlama Pool + Token 发现 |
| W3 | P2.3 + P2.4 | 多网络 + Coin 丰富 |
| W4 | P2.5 + P3.x | 地址标签 + Fixture 文档化 |
| W5 | P4.1 + P4.2 | 图表历史改进 |
| W6 | C2 + C3 | 版本发布 + 性能验证 |

---

## 验证命令清单

```bash
# 单元测试
bun run test

# 类型检查
bun run typecheck

# 端点测试 (按模块)
bun run test:endpoint:assets
bun run test:endpoint:coins
bun run test:endpoint:exchanges
bun run test:endpoint:global
bun run test:endpoint:search
bun run test:endpoint:simple

# 数据库迁移
bun run db:migrate

# 手动验证端点
curl http://localhost:3000/coins/list/new
curl http://localhost:3000/onchain/networks/eth/pools
curl http://localhost:3000/coins/bitcoin
```
