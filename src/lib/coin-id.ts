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
  BNB: 'binancecoin',
  BONK: 'bonk',
  BTC: 'bitcoin',
  CRV: 'curve-dao-token',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  ETC: 'ethereum-classic',
  ETH: 'ethereum',
  FIL: 'filecoin',
  FLOW: 'flow',
  FTM: 'fantom',
  GALA: 'gala',
  GRT: 'the-graph',
  ICP: 'internet-computer',
  IMX: 'immutable-x',
  INJ: 'injective-protocol',
  JASMY: 'jasmycoin',
  KAS: 'kaspa',
  LINK: 'chainlink',
  LTC: 'litecoin',
  LDO: 'lido-dao',
  MANA: 'decentraland',
  MATIC: 'matic-network',
  MKR: 'maker',
  NEAR: 'near',
  OKB: 'okb',
  ONE: 'harmony',
  OP: 'optimism',
  PEPE: 'pepe',
  QNT: 'quant-network',
  RNDR: 'render-token',
  SAND: 'sandbox',
  SHIB: 'shiba-inu',
  SOL: 'solana',
  SUI: 'sui',
  THETA: 'theta-network',
  TIA: 'celestia',
  TON: 'the-open-network',
  TRX: 'tron',
  UNI: 'uniswap',
  USDC: 'usd-coin',
  USDT: 'tether',
  VET: 'vechain',
  WLD: 'worldcoin-wld',
  XRP: 'ripple',
  XLM: 'stellar',
  XTZ: 'tezos',
  ZK: 'zksync',
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
