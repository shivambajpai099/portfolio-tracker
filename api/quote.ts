import type { VercelRequest, VercelResponse } from "@vercel/node";

type CacheEntry = {
  payload: YahooCompatiblePayload;
  fetchedAtMs: number;
};

const CACHE_TTL_MS = 20 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const UPSTREAM_TIMEOUT_MS = 10000;
const MAX_SYMBOL_COUNT = 50;
const MAX_SYMBOL_LENGTH = 15;
const SYMBOL_PATTERN = /^[A-Z0-9.&\-^=]+$/;
const EDGE_CACHE_STALE = "public, s-maxage=1200, stale-while-revalidate=600";
const EDGE_CACHE_MISS = "public, s-maxage=60, stale-while-revalidate=300";

const FINNHUB_API_KEY = String(process.env.FINNHUB_API_KEY ?? "").trim();
const FINNHUB_QUOTE_URL = "https://finnhub.io/api/v1/quote";
const INDIA_SUFFIX_PATTERN = /\.(NS|BO)$/i;

const YAHOO_QUOTE_BASE_URLS = [
  "https://query2.finance.yahoo.com",
  "https://query1.finance.yahoo.com",
];

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

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
    if (!symbol) continue;
    if (symbol.length > MAX_SYMBOL_LENGTH || !SYMBOL_PATTERN.test(symbol)) continue;
    if (seen.has(symbol)) continue;

    seen.add(symbol);
    cleaned.push(symbol);
    if (cleaned.length >= MAX_SYMBOL_COUNT) break;
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

const putCache = (key: string, payload: YahooCompatiblePayload): void => {
  if (CACHE.has(key)) {
    CACHE.delete(key);
  }
  CACHE.set(key, { payload, fetchedAtMs: Date.now() });

  while (CACHE.size > CACHE_MAX_ENTRIES) {
    const oldestKey = CACHE.keys().next().value as string | undefined;
    if (!oldestKey) break;
    CACHE.delete(oldestKey);
  }
};

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
    record.regularMarketPrice,
  ];

  for (const candidate of directCandidates) {
    const parsed = readNumeric(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  const nestedCandidates = [record.priceInfo, record.data, record.quote, record.result, record.response, record.meta];
  for (const nested of nestedCandidates) {
    const nestedParsed = extractPrice(nested);
    if (nestedParsed !== null) {
      return nestedParsed;
    }
  }

  return null;
};

/**
 * Fetch quotes from Yahoo Finance v7 API (batch) - used for US stocks
 */
const fetchYahooQuotes = async (symbols: string): Promise<YahooQuoteItem[]> => {
  if (!symbols) return [];

  const path = `/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;

  for (const baseUrl of YAHOO_QUOTE_BASE_URLS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
          Referer: "https://finance.yahoo.com/",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as {
          quoteResponse?: { result?: YahooQuoteItem[] };
        };
        return data.quoteResponse?.result ?? [];
      }
    } catch {
      // Try next URL
    }
  }

  return [];
};

/**
 * Fetch a single quote from Yahoo Finance Chart API - used for Indian stocks
 */
const fetchYahooChartQuote = async (symbol: string): Promise<YahooQuoteItem | null> => {
  try {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            symbol?: string;
            regularMarketPrice?: number;
            currency?: string;
            exchangeName?: string;
            fullExchangeName?: string;
            regularMarketTime?: number;
          };
        }>;
        error?: { description?: string };
      };
    };

    if (data.chart?.error) {
      return null;
    }

    const meta = data.chart?.result?.[0]?.meta;

    if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
      return {
        symbol: meta.symbol ?? symbol,
        regularMarketPrice: meta.regularMarketPrice,
        regularMarketTime: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
        currency: meta.currency ?? inferCurrency(symbol),
        exchange: meta.exchangeName ?? (isIndiaSymbol(symbol) ? "NSE" : "NASDAQ"),
        fullExchangeName: meta.fullExchangeName ?? meta.exchangeName ?? "Yahoo",
      };
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Fetch quotes from Yahoo Finance Chart API (parallel for multiple symbols)
 */
const fetchYahooChartQuotes = async (symbols: string[]): Promise<YahooQuoteItem[]> => {
  const results = await Promise.all(symbols.map(fetchYahooChartQuote));
  return results.filter((r): r is YahooQuoteItem => r !== null);
};

/**
 * Fetch quotes from Finnhub (US stocks only)
 */
const fetchFinnhubQuotes = async (symbols: string[]): Promise<YahooQuoteItem[]> => {
  if (!FINNHUB_API_KEY) return [];

  const results: YahooQuoteItem[] = [];

  for (const symbol of symbols) {
    if (isIndiaSymbol(symbol)) continue;

    try {
      const url = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
      const response = await fetch(url);

      if (response.ok) {
        const data = (await response.json()) as { c?: number; t?: number };
        if (data.c && data.c > 0) {
          results.push({
            symbol,
            regularMarketPrice: data.c,
            regularMarketTime: data.t ?? Math.floor(Date.now() / 1000),
            currency: "USD",
            exchange: "Finnhub",
            fullExchangeName: "Finnhub",
          });
        }
      }
    } catch {
      // Continue to next symbol
    }
  }

  return results;
};

/**
 * Main handler for /api/quote endpoint
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rawSymbols = toStringQuery(req.query.symbols);
  const normalized = normalizeSymbols(rawSymbols);

  if (!normalized) {
    res.status(400).json({ error: "No valid symbols provided" });
    return;
  }

  // Check cache
  const cached = CACHE.get(normalized);
  if (cached && isFresh(cached)) {
    res.setHeader("Cache-Control", EDGE_CACHE_STALE);
    res.setHeader("X-Cache", "HIT");
    res.status(200).json(cached.payload);
    return;
  }

  try {
    const allItems: YahooQuoteItem[] = [];
    const symbolList = normalized.split(",");
    const indiaSymbols = symbolList.filter(isIndiaSymbol);
    const nonIndiaSymbols = symbolList.filter((s) => !isIndiaSymbol(s));

    // Fetch non-India symbols from Yahoo v7 (batch)
    if (nonIndiaSymbols.length > 0) {
      const yahooResults = await fetchYahooQuotes(nonIndiaSymbols.join(","));
      allItems.push(...yahooResults);
    }

    // For India symbols, use Chart API (more reliable)
    if (indiaSymbols.length > 0) {
      const chartResults = await fetchYahooChartQuotes(indiaSymbols);
      allItems.push(...chartResults);

      // If Chart API missed some, try v7 API as fallback
      const foundIndiaSymbols = new Set(chartResults.map((r) => r.symbol));
      const missingIndiaSymbols = indiaSymbols.filter((s) => !foundIndiaSymbols.has(s));

      if (missingIndiaSymbols.length > 0) {
        const yahooV7Results = await fetchYahooQuotes(missingIndiaSymbols.join(","));
        allItems.push(...yahooV7Results);
      }
    }

    // Fallback to Finnhub for missing US symbols
    if (nonIndiaSymbols.length > 0 && FINNHUB_API_KEY) {
      const foundSymbols = new Set(allItems.map((r) => r.symbol));
      const missingNonIndia = nonIndiaSymbols.filter((s) => !foundSymbols.has(s));

      if (missingNonIndia.length > 0) {
        const finnhubResults = await fetchFinnhubQuotes(missingNonIndia);
        allItems.push(...finnhubResults);
      }
    }

    // Dedupe and build payload
    const deduped = dedupeBySymbol(allItems);
    const payload = toPayload(deduped);

    // Cache and respond
    if (deduped.length > 0) {
      putCache(normalized, payload);
    }

    res.setHeader("Cache-Control", EDGE_CACHE_MISS);
    res.setHeader("X-Cache", "MISS");
    res.setHeader("X-Symbols-Requested", symbolList.length.toString());
    res.setHeader("X-Symbols-Found", deduped.length.toString());
    res.status(200).json(payload);
  } catch (error) {
    console.error("[/api/quote] Error:", error);

    if (cached) {
      res.setHeader("Cache-Control", EDGE_CACHE_STALE);
      res.setHeader("X-Cache", "STALE");
      res.status(200).json(cached.payload);
      return;
    }

    res.status(500).json({ error: "Failed to fetch quotes" });
  }
}
