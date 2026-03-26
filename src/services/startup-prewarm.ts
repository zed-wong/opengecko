import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import type { MetricsRegistry } from './metrics';
import type { MarketDataRuntimeState } from './market-runtime-state';

export type StartupPrewarmTarget = {
  id: string;
  label: string;
  endpoint: string;
  cacheSurface: 'simple_price' | 'coins_markets';
};

export const STARTUP_PREWARM_TARGETS: StartupPrewarmTarget[] = [
  {
    id: 'simple_price_bitcoin_usd',
    label: 'Simple price BTC/USD',
    endpoint: '/simple/price?ids=bitcoin&vs_currencies=usd',
    cacheSurface: 'simple_price',
  },
  {
    id: 'coins_markets_bitcoin_usd',
    label: 'Coins markets BTC/USD',
    endpoint: '/coins/markets?vs_currency=usd&ids=bitcoin',
    cacheSurface: 'coins_markets',
  },
];

async function raceWithBudget<T>(promise: Promise<T>, remainingBudgetMs: number) {
  if (remainingBudgetMs <= 0) {
    return { status: 'timeout' as const };
  }

  return await Promise.race([
    promise.then(() => ({ status: 'completed' as const })),
    new Promise<{ status: 'timeout' }>((resolve) => {
      setTimeout(() => resolve({ status: 'timeout' }), remainingBudgetMs);
    }),
  ]);
}

function isSuccessfulPrewarmResponse(response: LightMyRequestResponse) {
  return response.statusCode >= 200 && response.statusCode < 300;
}

export async function runStartupPrewarm(
  app: FastifyInstance,
  runtimeState: MarketDataRuntimeState,
  metrics: MetricsRegistry,
  budgetMs: number,
) {
  const targets = STARTUP_PREWARM_TARGETS.map((target) => ({ ...target }));
  const startedAt = Date.now();

  runtimeState.startupPrewarm = {
    enabled: true,
    budgetMs,
    readyWithinBudget: true,
    firstRequestWarmBenefitsObserved: false,
    targets,
    completedAt: null,
    totalDurationMs: null,
    targetResults: [],
  };

  for (const target of targets) {
    const elapsedMs = Date.now() - startedAt;
    const remainingBudgetMs = budgetMs - elapsedMs;
    const targetStartedAt = Date.now();
    const outcome = await raceWithBudget(app.inject({
      method: 'GET',
      url: target.endpoint,
    }).then((response) => ({
      status: isSuccessfulPrewarmResponse(response) ? 'completed' as const : 'timeout' as const,
    })), remainingBudgetMs);
    const durationMs = Date.now() - targetStartedAt;

    runtimeState.startupPrewarm.targetResults.push({
      ...target,
      status: outcome.status,
      durationMs,
      cacheSurface: target.cacheSurface,
      warmCacheRevision: outcome.status === 'completed' ? runtimeState.hotDataRevision : null,
      firstObservedRequest: null,
    });
    metrics.recordStartupPrewarmTarget(target.id, outcome.status, durationMs);

    if (outcome.status === 'timeout') {
      runtimeState.startupPrewarm.readyWithinBudget = false;
      break;
    }
  }

  runtimeState.startupPrewarm.completedAt = Date.now();
  runtimeState.startupPrewarm.totalDurationMs = runtimeState.startupPrewarm.completedAt - startedAt;
  runtimeState.startupPrewarm.readyWithinBudget = runtimeState.startupPrewarm.totalDurationMs <= budgetMs;
}
