export const COIN_ID_OVERRIDES = {
  AAVE: 'aave',
  ADA: 'cardano',
  ALGO: 'algorand',
  APE: 'apecoin',
  APT: 'aptos',
  ARB: 'arbitrum',
  ATOM: 'cosmos',
  AVAX: 'avalanche-2',
  BCH: 'bitcoin-cash',
  BTC: 'bitcoin',
  CRV: 'curve-dao-token',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  ETC: 'ethereum-classic',
  ETH: 'ethereum',
  FIL: 'filecoin',
  ICP: 'internet-computer',
  INJ: 'injective-protocol',
  LINK: 'chainlink',
  LTC: 'litecoin',
  NEAR: 'near',
  OP: 'optimism',
  SHIB: 'shiba-inu',
  SOL: 'solana',
  SUI: 'sui',
  UNI: 'uniswap',
  USDC: 'usd-coin',
  XRP: 'ripple',
  XLM: 'stellar',
  XTZ: 'tezos',
} satisfies Record<string, string>;

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildCoinId(symbol: string, baseName: string | null) {
  const normalizedSymbol = symbol.toUpperCase();
  const override = COIN_ID_OVERRIDES[normalizedSymbol as keyof typeof COIN_ID_OVERRIDES];

  if (override) {
    return override;
  }

  const nameSlug = slugify(baseName ?? symbol);

  if (nameSlug && nameSlug !== normalizedSymbol.toLowerCase()) {
    return nameSlug;
  }

  return normalizedSymbol.toLowerCase();
}

export function buildCoinName(symbol: string, baseName: string | null) {
  return baseName?.trim() || symbol.toUpperCase();
}
