const CURRENCY_API_URL = 'https://latest.currency-api.pages.dev/v1/currencies/usdt.json';

type CurrencyApiSnapshot = {
  date: string;
  usdt: Record<string, number>;
};

const BOOTSTRAP_CURRENCY_API_SNAPSHOT: CurrencyApiSnapshot = {
  date: '2026-03-21',
  usdt: {
    usdt: 1,
    usd: 0.99996459,
    eur: 0.86266947,
    btc: 0.000014153253,
    eth: 0.00046463338,
  },
};

let currentSnapshot: CurrencyApiSnapshot = BOOTSTRAP_CURRENCY_API_SNAPSHOT;
let inFlightRefresh: Promise<void> | null = null;

function isValidCurrencyApiSnapshot(value: unknown): value is CurrencyApiSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<CurrencyApiSnapshot>;

  if (typeof snapshot.date !== 'string' || !snapshot.usdt || typeof snapshot.usdt !== 'object') {
    return false;
  }

  return ['usdt', 'usd', 'eur', 'btc', 'eth'].every((key) => {
    const rate = (snapshot.usdt as Record<string, unknown>)[key];
    return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
  });
}

export function getCurrencyApiSnapshot() {
  return currentSnapshot;
}

export async function refreshCurrencyApiRatesOnce(fetchImpl: typeof fetch = fetch) {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    try {
      const response = await fetchImpl(CURRENCY_API_URL);

      if (!response.ok) {
        throw new Error(`Currency API request failed with status ${response.status}`);
      }

      const payload = await response.json();

      if (!isValidCurrencyApiSnapshot(payload)) {
        throw new Error('Currency API response shape was invalid');
      }

      currentSnapshot = payload;
    } finally {
      inFlightRefresh = null;
    }
  })().catch(() => {
    // Keep the bootstrap snapshot when the remote source is unavailable.
  });

  return inFlightRefresh;
}
