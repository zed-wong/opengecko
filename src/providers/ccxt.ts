import ccxt, { type Exchange, type OHLCV, type Ticker } from 'ccxt';

export type SupportedExchangeId = 'binance' | 'coinbase' | 'kraken';
export const SUPPORTED_EXCHANGE_IDS: SupportedExchangeId[] = ['binance', 'coinbase', 'kraken'];

export type ExchangeTickerSnapshot = {
  exchangeId: SupportedExchangeId;
  symbol: string;
  base: string;
  quote: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
  high: number | null;
  low: number | null;
  baseVolume: number | null;
  quoteVolume: number | null;
  percentage: number | null;
  timestamp: number | null;
  raw: Ticker;
};

export type ExchangeOhlcvSnapshot = {
  exchangeId: SupportedExchangeId;
  symbol: string;
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  raw: OHLCV;
};

export type ExchangeMarketSnapshot = {
  exchangeId: SupportedExchangeId;
  symbol: string;
  base: string;
  quote: string;
  active: boolean;
  spot: boolean;
  baseName: string | null;
  baseNetworks?: string[];
  raw: unknown;
};

export type ExchangeNetworkSnapshot = {
  exchangeId: SupportedExchangeId;
  networkId: string;
  networkName: string;
  chainIdentifier: number | null;
};

export function isSupportedExchangeId(value: string): value is SupportedExchangeId {
  return SUPPORTED_EXCHANGE_IDS.includes(value as SupportedExchangeId);
}

function createExchange(exchangeId: SupportedExchangeId): Exchange {
  const options = {
    enableRateLimit: true,
  };

  switch (exchangeId) {
    case 'binance':
      return new ccxt.binance(options);
    case 'coinbase':
      return new ccxt.coinbase(options);
    case 'kraken':
      return new ccxt.kraken(options);
  }
}

function deriveBaseQuote(symbol: string) {
  const [base = '', quote = ''] = symbol.split('/');

  return {
    base,
    quote,
  };
}

function getSupportedSymbols(exchange: Exchange, symbols?: string[]) {
  if (!symbols?.length) {
    return undefined;
  }

  return symbols.filter((symbol) => symbol in exchange.markets);
}

function toTickerSnapshot(exchangeId: SupportedExchangeId, ticker: Ticker): ExchangeTickerSnapshot {
  const { base, quote } = deriveBaseQuote(ticker.symbol);

  return {
    exchangeId,
    symbol: ticker.symbol,
    base,
    quote,
    last: ticker.last ?? null,
    bid: ticker.bid ?? null,
    ask: ticker.ask ?? null,
    high: ticker.high ?? null,
    low: ticker.low ?? null,
    baseVolume: ticker.baseVolume ?? null,
    quoteVolume: ticker.quoteVolume ?? null,
    percentage: ticker.percentage ?? null,
    timestamp: ticker.timestamp ?? null,
    raw: ticker,
  };
}

function toMarketSnapshot(
  exchangeId: SupportedExchangeId,
  market: Exchange['markets'][string],
  currencyName: string | null,
  baseNetworks: string[],
): ExchangeMarketSnapshot {
  return {
    exchangeId,
    symbol: market.symbol,
    base: market.base,
    quote: market.quote,
    active: market.active ?? true,
    spot: market.spot ?? false,
    baseName: currencyName,
    baseNetworks,
    raw: market,
  };
}

function normalizeNetworkAlias(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  if (normalized === 'erc20' || normalized === 'ethereum') {
    return 'eth';
  }

  if (normalized === 'bep20' || normalized === 'binance_smart_chain') {
    return 'bsc';
  }

  if (normalized === 'trc20' || normalized === 'trx') {
    return 'tron';
  }

  return normalized;
}

function collectCurrencyNetworkIds(exchange: Exchange, code: string) {
  const currency = exchange.currencies?.[code];

  if (!currency) {
    return [];
  }

  const networkIds = new Set<string>();

  const directNetworkValue = (currency as { network?: unknown }).network;
  const directNetwork = typeof directNetworkValue === 'string' ? normalizeNetworkAlias(directNetworkValue) : '';
  if (directNetwork) {
    networkIds.add(directNetwork);
  }

  const networkEntries = currency.networks ? Object.values(currency.networks) : [];

  for (const networkEntry of networkEntries) {
    if (!networkEntry) {
      continue;
    }

    const aliasCandidates = [
      typeof networkEntry.id === 'string' ? networkEntry.id : '',
      typeof networkEntry.network === 'string' ? networkEntry.network : '',
      typeof networkEntry.name === 'string' ? networkEntry.name : '',
    ];

    for (const candidate of aliasCandidates) {
      const normalized = normalizeNetworkAlias(candidate);
      if (normalized) {
        networkIds.add(normalized);
      }
    }
  }

  return [...networkIds].sort();
}

function toNetworkSnapshot(
  exchangeId: SupportedExchangeId,
  networkId: string,
  networkName: string,
  chainIdentifier: number | null,
): ExchangeNetworkSnapshot {
  return {
    exchangeId,
    networkId,
    networkName,
    chainIdentifier,
  };
}

function toRequiredNumber(value: number | undefined, fieldName: string, exchangeId: SupportedExchangeId, symbol: string) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`Invalid ${fieldName} value from ${exchangeId} for ${symbol}`);
}

function toOhlcvSnapshot(exchangeId: SupportedExchangeId, symbol: string, timeframe: string, row: OHLCV): ExchangeOhlcvSnapshot {
  return {
    exchangeId,
    symbol,
    timeframe,
    timestamp: toRequiredNumber(row[0], 'timestamp', exchangeId, symbol),
    open: toRequiredNumber(row[1], 'open', exchangeId, symbol),
    high: toRequiredNumber(row[2], 'high', exchangeId, symbol),
    low: toRequiredNumber(row[3], 'low', exchangeId, symbol),
    close: toRequiredNumber(row[4], 'close', exchangeId, symbol),
    volume: row[5] ?? null,
    raw: row,
  };
}

export async function fetchExchangeTicker(exchangeId: SupportedExchangeId, symbol: string) {
  const exchange = createExchange(exchangeId);

  try {
    await exchange.loadMarkets();
    const ticker = await exchange.fetchTicker(symbol);

    return toTickerSnapshot(exchangeId, ticker);
  } finally {
    await exchange.close();
  }
}

export async function fetchExchangeTickers(exchangeId: SupportedExchangeId, symbols?: string[]) {
  const exchange = createExchange(exchangeId);

  try {
    await exchange.loadMarkets();
    const supportedSymbols = getSupportedSymbols(exchange, symbols);

    if (symbols?.length && (!supportedSymbols || supportedSymbols.length === 0)) {
      return [];
    }

    if (exchange.has.fetchTickers) {
      const tickers = await exchange.fetchTickers(supportedSymbols);

      return Object.values(tickers).map((ticker) => toTickerSnapshot(exchangeId, ticker));
    }

    const targetSymbols = supportedSymbols ?? symbols ?? Object.keys(exchange.markets);
    const tickers = await Promise.all(
      targetSymbols.map(async (symbol) => toTickerSnapshot(exchangeId, await exchange.fetchTicker(symbol))),
    );

    return tickers;
  } finally {
    await exchange.close();
  }
}

export async function fetchExchangeMarkets(exchangeId: SupportedExchangeId) {
  const exchange = createExchange(exchangeId);

  try {
    await exchange.loadMarkets();

    return Object.values(exchange.markets).map((market) =>
      toMarketSnapshot(
        exchangeId,
        market,
        exchange.currencies?.[market.base]?.name ?? null,
        collectCurrencyNetworkIds(exchange, market.base),
      ),
    );
  } finally {
    await exchange.close();
  }
}

export async function fetchExchangeNetworks(exchangeId: SupportedExchangeId) {
  const exchange = createExchange(exchangeId);

  try {
    await exchange.loadMarkets();

    const byNetworkId = new Map<string, ExchangeNetworkSnapshot>();
    const currencies = Object.values(exchange.currencies ?? {});

    for (const currency of currencies) {
      const networkEntries = currency.networks ? Object.values(currency.networks) : [];

      for (const networkEntry of networkEntries) {
        if (!networkEntry) {
          continue;
        }

        const normalizedId = normalizeNetworkAlias(
          (typeof networkEntry.id === 'string' && networkEntry.id) ||
            (typeof networkEntry.network === 'string' && networkEntry.network) ||
            (typeof networkEntry.name === 'string' && networkEntry.name) ||
            '',
        );

        if (!normalizedId) {
          continue;
        }

        const rawChainId = networkEntry.info?.chainId;
        const numericChainId =
          typeof rawChainId === 'number'
            ? rawChainId
            : typeof rawChainId === 'string' && rawChainId.trim().length > 0
              ? Number(rawChainId)
              : Number.NaN;

        const chainIdentifier = Number.isFinite(numericChainId) ? numericChainId : null;
        const networkName =
          (typeof networkEntry.name === 'string' && networkEntry.name) ||
          (typeof networkEntry.network === 'string' && networkEntry.network) ||
          normalizedId;

        if (!byNetworkId.has(normalizedId)) {
          byNetworkId.set(normalizedId, toNetworkSnapshot(exchangeId, normalizedId, networkName, chainIdentifier));
          continue;
        }

        const existing = byNetworkId.get(normalizedId);
        if (existing && existing.chainIdentifier === null && chainIdentifier !== null) {
          byNetworkId.set(normalizedId, toNetworkSnapshot(exchangeId, normalizedId, networkName, chainIdentifier));
        }
      }
    }

    return [...byNetworkId.values()].sort((a, b) => a.networkId.localeCompare(b.networkId));
  } finally {
    await exchange.close();
  }
}

export async function fetchExchangeOHLCV(
  exchangeId: SupportedExchangeId,
  symbol: string,
  timeframe: string,
  since?: number,
  limit?: number,
) {
  const exchange = createExchange(exchangeId);

  try {
    await exchange.loadMarkets();

    if (!exchange.has.fetchOHLCV) {
      return [];
    }

    const rows = await exchange.fetchOHLCV(symbol, timeframe, since, limit);

    return rows.map((row) => toOhlcvSnapshot(exchangeId, symbol, timeframe, row));
  } finally {
    await exchange.close();
  }
}
