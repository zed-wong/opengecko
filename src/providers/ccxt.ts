import ccxt, { type Exchange, type Ticker } from 'ccxt';

export type SupportedExchangeId = 'binance' | 'coinbase' | 'kraken';

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
