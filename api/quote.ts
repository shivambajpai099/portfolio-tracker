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
  client: Record<string, unknown>,
  methodName: string,
  symbol: string,
  exchange: "NSE" | "BSE"
): Promise<unknown> => {
  const method = client[methodName];
  if (typeof method !== "function") {
    return null;
  }

  const fn = method as (...args: unknown[]) => Promise<unknown> | unknown;
  try {
    return await fn(symbol, exchange);
  } catch {
    try {
      return await fn(symbol);
    } catch {
      return null;
    }
  }
};

const buildNseBseClient = async (): Promise<Record<string, unknown> | null> => {
  try {
    const dynamicImport = new Function("m", "return import(m)") as (moduleName: string) => Promise<unknown>;
    const mod = (await dynamicImport("nse-bse-api")) as Record<string, unknown>;
    const candidates: unknown[] = [mod.default, mod.client, mod.api, mod];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      if (typeof candidate === "function") {
        try {
          const instance = new (candidate as new () => unknown)();
          if (instance && typeof instance === "object") {
            return instance as Record<string, unknown>;
          }
        } catch {
          // Ignore constructor mismatch; try other exports.
        }
      }

      if (typeof candidate === "object") {
        return candidate as Record<string, unknown>;
      }
    }
  } catch {
    return null;
  }

  return null;
};

const fetchNseBseQuotes = async (normalized: string): Promise<YahooCompatiblePayload | null> => {
  const indiaSymbols = normalized.split(",").filter((symbol) => isIndiaSymbol(symbol));
  if (indiaSymbols.length === 0) {
    return null;
  }

  const client = await buildNseBseClient();
  if (!client) {
    return null;
  }

  const methodCandidates = [
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
        const payload = await callNseBseMethod(client, methodName, baseSymbol, exchange);
        const price = extractPrice(payload);
        if (price === null) {
          continue;
        }

        return {
          symbol,
          regularMarketPrice: price,
          regularMarketTime: Math.floor(Date.now() / 1000),
          currency: "INR",
          exchange,
          fullExchangeName: exchange,
        } satisfies YahooQuoteItem;
      }

      return null;
    })
  );

  const filtered = resultItems.flatMap((item) => (item ? [item] : []));
  return filtered.length > 0 ? toPayload(filtered) : null;
};

const fetchFinnhubQuotes = async (normalized: string, signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  if (!FINNHUB_API_KEY) {
    return null;
  }

  const symbols = normalized.split(",").filter(Boolean);
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const endpoint = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(FINNHUB_API_KEY)}`;

      try {
        const response = await fetch(endpoint, {
          headers: { Accept: "application/json" },
          signal,
        });

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as { c?: number; t?: number };
        if (typeof payload.c !== "number" || payload.c <= 0) {
          return null;
        }

        return {
          symbol,
          regularMarketPrice: payload.c,
          regularMarketTime: typeof payload.t === "number" ? payload.t : Math.floor(Date.now() / 1000),
          currency: inferCurrency(symbol),
          exchange: "Unknown",
          fullExchangeName: "Unknown",
        } satisfies YahooQuoteItem;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return null;
      }
    })
  );

  const filtered = results.filter((item): item is YahooQuoteItem => Boolean(item));
  return filtered.length > 0 ? toPayload(filtered) : null;
};

const fetchYahooQuotes = async (normalized: string, signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  if (!normalized) {
    return null;
  }

  const path = `/v7/finance/quote?symbols=${encodeURIComponent(normalized)}`;
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let index = 0; index < YAHOO_QUOTE_BASE_URLS.length; index += 1) {
    const endpoint = `${YAHOO_QUOTE_BASE_URLS[index]}${path}`;

    try {
      const response = await fetch(endpoint, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://finance.yahoo.com/",
        },
        signal,
      });

      if (response.ok) {
        return (await response.json()) as YahooCompatiblePayload;
      }

      lastResponse = response;
      if (!RETRYABLE_UPSTREAM_STATUSES.has(response.status)) {
        return null;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
    }

    if (index < YAHOO_QUOTE_BASE_URLS.length - 1) {
      await delay(UPSTREAM_RETRY_DELAY_MS);
    }
  }

  if (lastResponse) {
    return null;
  }

  if (lastError) {
    throw lastError;
  }

  return null;
};

const fetchProviderPayload = async (
  normalized: string,
  signal: AbortSignal,
  res: any,
): Promise<YahooCompatiblePayload | null> => {
  const providersUsed: string[] = [];
  const items: YahooQuoteItem[] = [];

  const yahoo = await fetchYahooQuotes(normalized, signal);
  if (yahoo) {
    providersUsed.push("YAHOO");
    items.push(...yahoo.quoteResponse.result);
  }

  let present = new Set(items.map((item) => item.symbol));
  const indiaMissing = pickIndiaSymbols(pickMissingSymbols(normalized, present));
  if (indiaMissing) {
    const indiaProvider = await fetchNseBseQuotes(indiaMissing);
    if (indiaProvider) {
      providersUsed.push("NSE_BSE_API");
      items.push(...indiaProvider.quoteResponse.result);
      present = new Set(items.map((item) => item.symbol));
    }

    const indiaStillMissing = pickIndiaSymbols(pickMissingSymbols(normalized, present));
    res.setHeader("X-Upstream-Provider-India", indiaStillMissing ? "NO_DATA" : "NSE_BSE_API");
  } else {
    res.setHeader("X-Upstream-Provider-India", "N/A");
  }

  const missing = pickMissingSymbols(normalized, present);
  if (missing) {
    const finnhub = await fetchFinnhubQuotes(missing, signal);
    if (finnhub) {
      providersUsed.push("FINNHUB");
      items.push(...finnhub.quoteResponse.result);
    }
  }

  const merged = dedupeBySymbol(items);
  if (merged.length === 0) {
    return null;
  }

  res.setHeader("X-Upstream-Provider", providersUsed.join("+") || "UNKNOWN");
  res.setHeader("X-Upstream-Status", "200");
  return toPayload(merged);
};

const applyCorsHeaders = (res: any): void => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "X-Request-Id, X-Cache, X-Upstream-Provider, X-Upstream-Provider-India, X-Upstream-Status"
  );
  res.setHeader("Vary", "Origin");
};

export default async function handler(req: any, res: any) {
  applyCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader("X-Request-Id", requestId);

  const ticker = toStringQuery(req.query?.ticker).trim();
  const symbolsRaw = toStringQuery(req.query?.symbols).trim();
  const requested = symbolsRaw || ticker;
  const normalized = normalizeSymbols(requested);

  if (!normalized) {
    res.setHeader("Cache-Control", EDGE_CACHE_STALE);
    res.status(200).json(emptyPayload());
    return;
  }

  const cached = CACHE.get(normalized);
  if (cached && isFresh(cached)) {
    res.setHeader("Cache-Control", EDGE_CACHE_STALE);
    res.setHeader("X-Cache", "HIT");
    res.status(200).json(cached.payload);
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let payload: YahooCompatiblePayload | null = null;
    try {
      payload = await fetchProviderPayload(normalized, controller.signal, res);
    } finally {
      clearTimeout(timeout);
    }

    if (!payload) {
      if (cached) {
        res.setHeader("Cache-Control", EDGE_CACHE_STALE);
        res.setHeader("X-Cache", "STALE");
        res.status(200).json(cached.payload);
        return;
      }

      res.status(502).json({ error: "Quote upstream request failed" });
      return;
    }

    putCache(normalized, payload);

    res.setHeader("Cache-Control", EDGE_CACHE_MISS);
    res.setHeader("X-Cache", "MISS");
    res.status(200).json(payload);
  } catch (error) {
    if (cached) {
      res.setHeader("Cache-Control", EDGE_CACHE_STALE);
      res.setHeader("X-Cache", "STALE");
      res.status(200).json(cached.payload);
      return;
    }

    if (error instanceof Error && error.name === "AbortError") {
      res.status(504).json({ error: "Quote request timed out" });
      return;
    }

    res.status(502).json({ error: "Quote request failed" });
  }
}
