type CacheEntry = {
  payload: YahooCompatiblePayload;
  fetchedAtMs: number;
};

const CACHE_TTL_MS = 20 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const UPSTREAM_TIMEOUT_MS = 8000;
const UPSTREAM_RETRY_DELAY_MS = 200;
const MAX_SYMBOL_COUNT = 50;
const MAX_SYMBOL_LENGTH = 15;
const SYMBOL_PATTERN = /^[A-Z0-9.&\-^=]+$/;
const EDGE_CACHE_STALE = "public, s-maxage=1200, stale-while-revalidate=600";
const EDGE_CACHE_MISS = "public, s-maxage=30, stale-while-revalidate=120";
const RETRYABLE_UPSTREAM_STATUSES = new Set([401, 429, 500, 502, 503, 504]);

const FINNHUB_API_KEY = String(process.env.FINNHUB_API_KEY ?? "").trim();
const FINNHUB_QUOTE_URL = "https://finnhub.io/api/v1/quote";
const INDIA_SUFFIX_PATTERN = /\.(NS|BO)$/i;

const YAHOO_QUOTE_BASE_URLS = [
  "https://query2.finance.yahoo.com",
  "https://query1.finance.yahoo.com",
];

type YahooQuoteItem = {
  symbol: string;
  regularMarketPrice: number;
  regularMarketTime: number;
  currency: string;
  exchange: string;
  fullExchangeName: string;
};

type YahooCompatiblePayload = {
  quoteResponse: {
    result: YahooQuoteItem[];
  };
};

const CACHE = new Map<string, CacheEntry>();

const toStringQuery = (value: unknown): string => {
  if (Array.isArray(value)) {
    return String(value[0] ?? "");
  }
  return String(value ?? "");
};

const isFresh = (entry: CacheEntry): boolean => Date.now() - entry.fetchedAtMs <= CACHE_TTL_MS;

const normalizeSymbols = (raw: string): string => {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const part of raw.split(",")) {
    const symbol = part.trim().toUpperCase();
    if (!symbol) {
      continue;
    }
    if (symbol.length > MAX_SYMBOL_LENGTH || !SYMBOL_PATTERN.test(symbol)) {
      continue;
    }
    if (seen.has(symbol)) {
      continue;
    }

    seen.add(symbol);
    cleaned.push(symbol);
    if (cleaned.length >= MAX_SYMBOL_COUNT) {
      break;
    }
  }

  return cleaned.join(",");
};

const inferCurrency = (symbol: string): string => {
  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) {
    return "INR";
  }
  return "USD";
};

const isIndiaSymbol = (symbol: string): boolean => INDIA_SUFFIX_PATTERN.test(symbol);

const stripIndiaSuffix = (symbol: string): string => symbol.replace(INDIA_SUFFIX_PATTERN, "");

const inferIndiaExchange = (symbol: string): "NSE" | "BSE" => (symbol.endsWith(".BO") ? "BSE" : "NSE");

const putCache = (key: string, payload: YahooCompatiblePayload): void => {
  if (CACHE.has(key)) {
    CACHE.delete(key);
  }
  CACHE.set(key, { payload, fetchedAtMs: Date.now() });

  while (CACHE.size > CACHE_MAX_ENTRIES) {
    const oldestKey = CACHE.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    CACHE.delete(oldestKey);
  }
};

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const emptyPayload = (): YahooCompatiblePayload => ({ quoteResponse: { result: [] } });

const toPayload = (items: YahooQuoteItem[]): YahooCompatiblePayload => ({
  quoteResponse: { result: items },
});

const dedupeBySymbol = (items: YahooQuoteItem[]): YahooQuoteItem[] => {
  const map = new Map<string, YahooQuoteItem>();
  for (const item of items) {
    map.set(item.symbol, item);
  }
  return [...map.values()];
};

const pickMissingSymbols = (requested: string, present: Set<string>): string => {
  return requested
    .split(",")
    .filter(Boolean)
    .filter((symbol) => !present.has(symbol))
    .join(",");
};

const pickIndiaSymbols = (symbols: string): string => {
  return symbols
    .split(",")
    .filter(Boolean)
    .filter((symbol) => isIndiaSymbol(symbol))
    .join(",");
};

const readNumeric = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const extractPrice = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directCandidates = [
    record.lastPrice,
    record.ltp,
    record.price,
    record.currentPrice,
    record.close,
    record.value,
  ];

  for (const candidate of directCandidates) {
    const parsed = readNumeric(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  const nestedCandidates = [record.priceInfo, record.data, record.quote, record.result, record.response];
  for (const nested of nestedCandidates) {
    const nestedParsed = extractPrice(nested);
    if (nestedParsed !== null) {
      return nestedParsed;
    }
  }

  return null;
};

const callNseBseMethod = async (
  mod: Record<string, unknown>,
  methodName: string,
  symbol: string,
  exchange: "NSE" | "BSE"
): Promise<unknown> => {
  const method = mod[methodName];
  if (typeof method !== "function") {
    return null;
  }

  const fn = method as (...args: unknown[]) => Promise<unknown> | unknown;
  try {
    // Try with just symbol first (most common API pattern)
    return await fn(symbol);
  } catch {
    try {
      // Try with symbol and exchange
      return await fn(symbol, exchange);
    } catch {
      return null;
    }
  }
};

/**
 * Import nse-bse-api module.
 * The package exports functions directly at the module level (not as class methods).
 */
const importNseBseModule = async (): Promise<Record<string, unknown> | null> => {
  try {
    const dynamicImport = new Function("m", "return import(m)") as (moduleName: string) => Promise<unknown>;
    const mod = (await dynamicImport("nse-bse-api")) as Record<string, unknown>;

    // nse-bse-api exports functions directly at module level
    const expectedFunctions = [
      "getEquityStockQuote",
      "getEquityDetails",
      "getIndexQuote",
      "getGainersAndLosers",
    ];

    // Check if functions exist at module level
    if (expectedFunctions.some((name) => typeof mod[name] === "function")) {
      return mod;
    }

    // Check default export
    if (mod.default && typeof mod.default === "object") {
      const defaultMod = mod.default as Record<string, unknown>;
      if (expectedFunctions.some((name) => typeof defaultMod[name] === "function")) {
        return defaultMod;
      }
    }

    // Return module anyway for fallback method attempts
    return mod;
  } catch (error) {
    console.error("Failed to import nse-bse-api:", error);
    return null;
  }
};

const fetchNseBseQuotes = async (normalized: string): Promise<YahooCompatiblePayload | null> => {
  const indiaSymbols = normalized.split(",").filter((symbol) => isIndiaSymbol(symbol));
  if (indiaSymbols.length === 0) {
    return null;
  }

  const mod = await importNseBseModule();
  if (!mod) {
    return null;
  }

  // nse-bse-api exports these functions directly:
  // - getEquityStockQuote(symbol) - for individual stock quotes
  // - getEquityDetails(symbol) - for detailed stock info
  const methodCandidates = [
    "getEquityStockQuote",
    "getEquityDetails",
    "getQuote",
    "quote",
    "getStockQuote",
    "getSecurityQuote",
    "getQuoteData",
    "getDetails",
  ];

  const resultItems = await Promise.all(
    indiaSymbols.map(async (symbol) => {
      const baseSymbol = stripIndiaSuffix(symbol);
      const exchange = inferIndiaExchange(symbol);

      for (const methodName of methodCandidates) {
        const payload = await callNseBseMethod(mod, methodName, baseSymbol, exchange);
        const price = extractPrice(payload);
        if
