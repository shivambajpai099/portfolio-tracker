type CacheEntry = {
  payload: unknown;
  fetchedAtMs: number;
};

const CACHE_TTL_MS = 20 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const UPSTREAM_TIMEOUT_MS = 8000;
const UPSTREAM_RETRY_DELAY_MS = 200;
const MAX_SYMBOL_COUNT = 50;
const MAX_SYMBOL_LENGTH = 15;
// Yahoo and Indian exchange tickers can include ampersands (e.g. M&M.NS, L&TFH.NS).
const SYMBOL_PATTERN = /^[A-Z0-9.&\-^=]+$/;
const EDGE_CACHE_STALE = "public, s-maxage=1200, stale-while-revalidate=600";
const EDGE_CACHE_MISS = "public, s-maxage=30, stale-while-revalidate=120";
const RETRYABLE_UPSTREAM_STATUSES = new Set([401, 429, 500, 502, 503, 504]);
const FINNHUB_API_KEY = String(process.env.FINNHUB_API_KEY ?? "").trim();
const FINNHUB_QUOTE_URL = "https://finnhub.io/api/v1/quote";
const TWELVEDATA_API_KEY = String(process.env.TWELVEDATA_API_KEY ?? "").trim();
const TWELVEDATA_QUOTE_URL = "https://api.twelvedata.com/quote";
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_SUMMARY_URL = "https://query1.finance.yahoo.com/v10/finance/quoteSummary";
const NSE_QUOTE_URL = "https://www.nseindia.com/api/quote-equity";
const GOOGLE_FINANCE_URL = "https://www.google.com/finance/quote";

const CACHE = new Map<string, CacheEntry>();

const YAHOO_QUOTE_BASE_URLS = [
  "https://query2.finance.yahoo.com",
  "https://query1.finance.yahoo.com",
];

type YahooCompatiblePayload = {
  quoteResponse: {
    result: Array<{
      symbol: string;
      regularMarketPrice: number;
      regularMarketTime: number;
      currency: string;
      exchange: string;
      fullExchangeName: string;
    }>;
  };
};

type YahooChartResponse = {
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
  };
};

type YahooSummaryResponse = {
  quoteSummary?: {
    result?: Array<{
      price?: {
        symbol?: string;
        regularMarketPrice?: { raw?: number };
        currency?: string;
        exchangeName?: string;
      };
    }>;
  };
};

const toStringQuery = (value: unknown): string => {
  if (Array.isArray(value)) {
    return String(value[0] ?? "");
  }
  return String(value ?? "");
};

const isTruthyQueryFlag = (value: unknown): boolean => {
  const normalized = toStringQuery(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
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

const putCache = (key: string, payload: unknown): void => {
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

const inferCurrency = (symbol: string): string => {
  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) {
    return "INR";
  }
  return "USD";
};

const isIndiaSymbol = (symbol: string): boolean => /\.(NS|BO)$/i.test(symbol);

const stripIndiaSuffix = (symbol: string): string => symbol.trim().toUpperCase().replace(/\.(NS|BO)$/i, "");

const indiaExchangeForSymbol = (symbol: string): "NSE" | "BOM" => (symbol.endsWith(".BO") ? "BOM" : "NSE");
const indiaExchangeForTwelveData = (symbol: string): "NSE" | "BSE" => (symbol.endsWith(".BO") ? "BSE" : "NSE");
const twelveDataCandidatesForIndiaSymbol = (symbol: string): string[] => {
  const base = stripIndiaSuffix(symbol);
  const exchange = indiaExchangeForTwelveData(symbol);
  const candidates = [
    `${base}:${exchange}`,
    `${exchange}:${base}`,
    `${base}.${exchange}`,
    symbol,
    base,
  ];

  return [...new Set(candidates)];
};

const partitionSymbols = (symbols: string[]): { india: string[]; other: string[] } => {
  const india: string[] = [];
  const other: string[] = [];
  const indiaBases = new Set<string>();

  for (const symbol of symbols) {
    if (isIndiaSymbol(symbol)) {
      india.push(symbol);
      indiaBases.add(stripIndiaSuffix(symbol));
    } else {
      other.push(symbol);
    }
  }

  return {
    india,
    other: other.filter((symbol) => !indiaBases.has(symbol)),
  };
};

const fetchNseQuotes = async (symbols: string[], signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  let cookieHeader: string | null = null;

  try {
    const homeResponse = await fetch("https://www.nseindia.com", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.nseindia.com/",
      },
      signal,
    });

    if (homeResponse.ok) {
      const headerLike = homeResponse.headers as Headers & { getSetCookie?: () => string[] };
      const setCookies = typeof headerLike.getSetCookie === "function" ? headerLike.getSetCookie() : [];
      const rawCookies = setCookies.length > 0 ? setCookies : [homeResponse.headers.get("set-cookie") ?? ""];
      const cookiePairs = rawCookies
        .flatMap((cookie) => cookie.split(/,(?=\s*[^;=]+=[^;=]+)/g))
        .map((cookie) => cookie.split(";")[0]?.trim())
        .filter((cookie): cookie is string => Boolean(cookie) && cookie.includes("="));
      cookieHeader = cookiePairs.length > 0 ? cookiePairs.join("; ") : null;
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
  }

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const requestSymbol = stripIndiaSuffix(symbol);
      const endpoint = `${NSE_QUOTE_URL}?symbol=${encodeURIComponent(requestSymbol)}`;

      try {
        const response = await fetch(endpoint, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://www.nseindia.com/",
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          },
          signal,
        });

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as { priceInfo?: { lastPrice?: number | string }; info?: { symbol?: string } };
        const rawPrice = payload.priceInfo?.lastPrice;
        const price = typeof rawPrice === "number" ? rawPrice : Number(String(rawPrice ?? "").replace(/[^0-9.\-]/g, ""));
        if (!Number.isFinite(price)) {
          return null;
        }

        return {
          symbol,
          regularMarketPrice: price,
          regularMarketTime: Math.floor(Date.now() / 1000),
          currency: "INR",
          exchange: "NSE",
          fullExchangeName: "NSE",
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return null;
      }
    })
  );

  const filtered = results.filter(
    (item): item is YahooCompatiblePayload["quoteResponse"]["result"][number] => Boolean(item)
  );

  if (filtered.length === 0) {
    return null;
  }

  return { quoteResponse: { result: filtered } };
};

const fetchGoogleFinanceQuotes = async (symbols: string[], signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const baseSymbol = stripIndiaSuffix(symbol);
      const exchange = indiaExchangeForSymbol(symbol);
      const endpoint = `${GOOGLE_FINANCE_URL}/${encodeURIComponent(baseSymbol)}:${exchange}?hl=en&gl=in`;

      try {
        const response = await fetch(endpoint, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://www.google.com/",
          },
          signal,
        });

        if (!response.ok) {
          return null;
        }

        const html = await response.text();
        const priceText =
          html.match(/YMlKec fxKbKc[^>]*>([^<]+)</)?.[1] ??
          html.match(/data-last-price="([^"]+)"/)?.[1] ??
          html.match(/"currentPrice"\s*:\s*\{"raw"\s*:\s*([0-9.]+)/)?.[1] ??
          null;

        if (!priceText) {
          return null;
        }

        const price = Number(priceText.replace(/[^0-9.\-]/g, ""));
        if (!Number.isFinite(price)) {
          return null;
        }

        return {
          symbol,
          regularMarketPrice: price,
          regularMarketTime: Math.floor(Date.now() / 1000),
          currency: "INR",
          exchange: "Google Finance",
          fullExchangeName: "Google Finance",
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return null;
      }
    })
  );

  const filtered = results.filter(
    (item): item is YahooCompatiblePayload["quoteResponse"]["result"][number] => Boolean(item)
  );

  if (filtered.length === 0) {
    return null;
  }

  return { quoteResponse: { result: filtered } };
};

const fetchYahooChartQuotes = async (symbols: string[], signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const endpoint = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false&events=div,splits`;

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

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as YahooChartResponse;
        const meta = payload.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice;
        const resolvedSymbol = normalizeSymbols(symbol);

        if (!resolvedSymbol || typeof price !== "number") {
          return null;
        }

        return {
          symbol: resolvedSymbol,
          regularMarketPrice: price,
          regularMarketTime: meta?.regularMarketTime ?? Math.floor(Date.now() / 1000),
          currency: meta?.currency ?? inferCurrency(resolvedSymbol),
          exchange: meta?.fullExchangeName ?? meta?.exchangeName ?? "Yahoo Chart",
          fullExchangeName: meta?.fullExchangeName ?? meta?.exchangeName ?? "Yahoo Chart",
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return null;
      }
    })
  );

  const filtered = results.filter(
    (item): item is YahooCompatiblePayload["quoteResponse"]["result"][number] => Boolean(item)
  );

  if (filtered.length === 0) {
    return null;
  }

  return { quoteResponse: { result: filtered } };
};

const fetchYahooSummaryQuotes = async (symbols: string[], signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const endpoint = `${YAHOO_SUMMARY_URL}/${encodeURIComponent(symbol)}?modules=price`;

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

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as YahooSummaryResponse;
        const priceBlock = payload.quoteSummary?.result?.[0]?.price;
        const price = priceBlock?.regularMarketPrice?.raw;
        const resolvedSymbol = (priceBlock?.symbol ?? symbol).toUpperCase();

        if (!resolvedSymbol || typeof price !== "number") {
          return null;
        }

        return {
          symbol: resolvedSymbol,
          regularMarketPrice: price,
          regularMarketTime: Math.floor(Date.now() / 1000),
          currency: priceBlock?.currency ?? inferCurrency(resolvedSymbol),
          exchange: priceBlock?.exchangeName ?? "Yahoo Summary",
          fullExchangeName: priceBlock?.exchangeName ?? "Yahoo Summary",
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return null;
      }
    })
  );

  const filtered = results.filter(
    (item): item is YahooCompatiblePayload["quoteResponse"]["result"][number] => Boolean(item)
  );

  if (filtered.length === 0) {
    return null;
  }

  return { quoteResponse: { result: filtered } };
};

const fetchTwelveDataIndiaQuotes = async (symbols: string[], signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  if (!TWELVEDATA_API_KEY) {
    return null;
  }

  const debugParts: string[] = [];

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const exchange = indiaExchangeForTwelveData(symbol);
      const candidates = twelveDataCandidatesForIndiaSymbol(symbol);

      for (const tdSymbol of candidates) {
        const endpoint = `${TWELVEDATA_QUOTE_URL}?symbol=${encodeURIComponent(tdSymbol)}&apikey=${encodeURIComponent(TWELVEDATA_API_KEY)}`;

        try {
          const response = await fetch(endpoint, {
            headers: {
              Accept: "application/json",
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            },
            signal,
          });

          if (!response.ok) {
            debugParts.push(`${symbol}:${tdSymbol}:http${response.status}`);
            continue;
          }

          const payload = (await response.json()) as {
            price?: string;
            close?: string;
            previous_close?: string;
            currency?: string;
            exchange?: string;
            timestamp?: number;
            code?: number;
            message?: string;
            status?: string;
          };

          if (payload.status === "error" || payload.code) {
            debugParts.push(`${symbol}:${tdSymbol}:${payload.code ?? "err"}`);
            continue;
          }

          const priceCandidate = payload.price ?? payload.close ?? payload.previous_close;
          const price = Number(String(priceCandidate ?? "").replace(/[^0-9.\-]/g, ""));
          if (!Number.isFinite(price) || price <= 0) {
            debugParts.push(`${symbol}:${tdSymbol}:noprice`);
            continue;
          }

          debugParts.push(`${symbol}:${tdSymbol}:ok`);
          return {
            symbol,
            regularMarketPrice: price,
            regularMarketTime:
              typeof payload.timestamp === "number" && Number.isFinite(payload.timestamp)
                ? payload.timestamp
                : Math.floor(Date.now() / 1000),
            currency: payload.currency ?? "INR",
            exchange: payload.exchange ?? exchange,
            fullExchangeName: payload.exchange ?? exchange,
          };
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            throw error;
          }
          debugParts.push(`${symbol}:${tdSymbol}:network`);
        }
      }

      return null;
    })
  );

  if (debugParts.length > 0) {
    // Keep this bounded so headers stay under typical limits.
    (fetchTwelveDataIndiaQuotes as unknown as { _debug?: string })._debug = debugParts.slice(0, 20).join("|");
  }

  const filtered = results.filter(
    (item): item is YahooCompatiblePayload["quoteResponse"]["result"][number] => Boolean(item)
  );

  if (filtered.length === 0) {
    return null;
  }

  return { quoteResponse: { result: filtered } };
};

const fetchYahooQuotePayload = async (symbols: string[], signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  if (symbols.length === 0) {
    return null;
  }

  const upstream = await fetchQuoteWithFailover(symbols.join(","), signal);
  if (!upstream.ok) {
    return null;
  }

  return (await upstream.json()) as YahooCompatiblePayload;
};

const fetchFinnhubIndiaQuotes = async (symbols: string[], signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  if (!FINNHUB_API_KEY) {
    return null;
  }

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const base = stripIndiaSuffix(symbol);
      const exchangePrefix = symbol.endsWith(".BO") ? "BSE" : "NSE";
      const finnhubSymbol = `${exchangePrefix}:${base}`;
      const endpoint = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(finnhubSymbol)}&token=${encodeURIComponent(FINNHUB_API_KEY)}`;

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
          currency: "INR",
          exchange: exchangePrefix,
          fullExchangeName: exchangePrefix,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return null;
      }
    })
  );

  const filtered = results.filter(
    (item): item is YahooCompatiblePayload["quoteResponse"]["result"][number] => Boolean(item)
  );

  if (filtered.length === 0) {
    return null;
  }

  return { quoteResponse: { result: filtered } };
};

const fetchFinnhubIndiaRawSuffixQuotes = async (symbols: string[], signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  if (!FINNHUB_API_KEY) {
    return null;
  }

  // Reuse existing Finnhub logic with raw .NS/.BO symbols, which can work
  // in environments where exchange-prefixed symbols are not available.
  return fetchFinnhubQuotes(symbols.join(","), signal);
};

const fetchFinnhubQuotes = async (normalized: string, signal: AbortSignal): Promise<YahooCompatiblePayload | null> => {
  if (!FINNHUB_API_KEY) {
    return null;
  }

  const symbols = normalized.split(",").filter(Boolean);
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const endpoint = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(FINNHUB_API_KEY)}`;
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        signal,
      });

      if (!response.ok) {
        if (RETRYABLE_UPSTREAM_STATUSES.has(response.status) || response.status === 403) {
          return null;
        }
        return null;
      }

      const payload = (await response.json()) as { c?: number; t?: number };
      if (typeof payload.c !== "number") {
        return null;
      }

      return {
        symbol,
        regularMarketPrice: payload.c,
        regularMarketTime: typeof payload.t === "number" ? payload.t : Math.floor(Date.now() / 1000),
        currency: inferCurrency(symbol),
        exchange: "Unknown",
        fullExchangeName: "Unknown",
      };
    })
  );

  const filtered = results.filter(
    (item): item is YahooCompatiblePayload["quoteResponse"]["result"][number] => Boolean(item)
  );

  if (filtered.length === 0) {
    return null;
  }

  return {
    quoteResponse: {
      result: filtered,
    },
  };
};

const fetchQuoteWithFailover = async (normalized: string, signal: AbortSignal): Promise<Response> => {
  const path = `/v7/finance/quote?symbols=${encodeURIComponent(normalized)}`;
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let index = 0; index < YAHOO_QUOTE_BASE_URLS.length; index += 1) {
    const baseUrl = YAHOO_QUOTE_BASE_URLS[index];
    const endpoint = `${baseUrl}${path}`;

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
        return response;
      }

      lastResponse = response;
      if (!RETRYABLE_UPSTREAM_STATUSES.has(response.status)) {
        return response;
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
    return lastResponse;
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Quote upstream request failed");
};

const applyCorsHeaders = (res: any): void => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "X-Request-Id, X-Cache, X-Upstream-Provider, X-Upstream-Status, X-Upstream-Provider-India, X-India-Symbols, X-India-Status, X-India-Provider-Counts, X-India-TD-Debug"
  );
  res.setHeader("Vary", "Origin");
};

export default async function handler(req: any, res: any) {
  applyCorsHeaders(res);
  // Always expose baseline debug headers so clients can tell which code path ran.
  res.setHeader("X-Upstream-Provider-India", "NOT_ATTEMPTED");
  res.setHeader("X-India-Symbols", "0");
  res.setHeader("X-India-Status", "SKIPPED");

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
  const noCache = isTruthyQueryFlag(req.query?.nocache);
  res.setHeader("X-Debug-NoCache", noCache ? "1" : "0");

  const ticker = toStringQuery(req.query?.ticker).trim();
  const symbolsRaw = toStringQuery(req.query?.symbols).trim();
  const requested = symbolsRaw || ticker;
  const normalized = normalizeSymbols(requested);

  if (!normalized) {
    res.setHeader("Cache-Control", noCache ? "no-store" : EDGE_CACHE_STALE);
    res.status(200).json({ quoteResponse: { result: [] } });
    return;
  }

  const cached = noCache ? undefined : CACHE.get(normalized);
  if (!noCache && cached && isFresh(cached)) {
    // Cached payload may come from an earlier run; make that explicit.
    res.setHeader("X-Upstream-Provider-India", "CACHE");
    res.setHeader("X-India-Status", "CACHE_HIT");
    res.setHeader("Cache-Control", EDGE_CACHE_STALE);
    res.setHeader("X-Cache", "HIT");
    res.status(200).json(cached.payload);
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let payload: unknown | null = null;
    try {
      const symbols = normalized.split(",").filter(Boolean);
      const { india, other } = partitionSymbols(symbols);
      res.setHeader("X-India-Symbols", String(india.length));
      if (india.length > 0) {
        res.setHeader("X-Upstream-Provider-India", "NO_DATA");
        res.setHeader("X-India-Status", "ATTEMPTED");
      }

      const [indiaPayload, otherPayload] = await Promise.all([
        india.length > 0
          ? Promise.all([
              fetchTwelveDataIndiaQuotes(india, controller.signal),
              fetchFinnhubIndiaRawSuffixQuotes(india, controller.signal),
              fetchFinnhubIndiaQuotes(india, controller.signal),
              fetchYahooSummaryQuotes(india, controller.signal),
              fetchYahooChartQuotes(india, controller.signal),
              fetchYahooQuotePayload(india, controller.signal),
              fetchGoogleFinanceQuotes(india, controller.signal),
              fetchNseQuotes(india, controller.signal),
            ]).then(([twelveData, finnhubRaw, finnhubIndia, yahooSummary, chart, yahooQuote, google, nse]) => {
              const merged = [
                ...(twelveData?.quoteResponse.result ?? []),
                ...(finnhubRaw?.quoteResponse.result ?? []),
                ...(finnhubIndia?.quoteResponse.result ?? []),
                ...(yahooSummary?.quoteResponse.result ?? []),
                ...(chart?.quoteResponse.result ?? []),
                ...(yahooQuote?.quoteResponse.result ?? []),
                ...(google?.quoteResponse.result ?? []),
                ...(nse?.quoteResponse.result ?? []),
              ];
              const unique = [...new Map(merged.map((item) => [item.symbol, item])).values()];

              res.setHeader(
                "X-India-Provider-Counts",
                [
                  `TWELVEDATA:${(twelveData?.quoteResponse.result ?? []).length}`,
                  `FINNHUB_RAW:${(finnhubRaw?.quoteResponse.result ?? []).length}`,
                  `FINNHUB_INDIA:${(finnhubIndia?.quoteResponse.result ?? []).length}`,
                  `YAHOO_SUMMARY:${(yahooSummary?.quoteResponse.result ?? []).length}`,
                  `YAHOO_CHART:${(chart?.quoteResponse.result ?? []).length}`,
                  `YAHOO_QUOTE:${(yahooQuote?.quoteResponse.result ?? []).length}`,
                  `GOOGLE_FINANCE:${(google?.quoteResponse.result ?? []).length}`,
                  `NSE:${(nse?.quoteResponse.result ?? []).length}`,
                ].join(",")
              );
              const tdDebug = (fetchTwelveDataIndiaQuotes as unknown as { _debug?: string })._debug;
              if (tdDebug) {
                res.setHeader("X-India-TD-Debug", tdDebug);
              }

              if (unique.length > 0) {
                const providerParts = [];
                if ((twelveData?.quoteResponse.result ?? []).length > 0) providerParts.push("TWELVEDATA");
                if ((finnhubRaw?.quoteResponse.result ?? []).length > 0) providerParts.push("FINNHUB_RAW");
                if ((finnhubIndia?.quoteResponse.result ?? []).length > 0) providerParts.push("FINNHUB_INDIA");
                if ((yahooSummary?.quoteResponse.result ?? []).length > 0) providerParts.push("YAHOO_SUMMARY");
                if ((chart?.quoteResponse.result ?? []).length > 0) providerParts.push("YAHOO_CHART");
                if ((yahooQuote?.quoteResponse.result ?? []).length > 0) providerParts.push("YAHOO_QUOTE");
                if ((google?.quoteResponse.result ?? []).length > 0) providerParts.push("GOOGLE_FINANCE");
                if ((nse?.quoteResponse.result ?? []).length > 0) providerParts.push("NSE");
                res.setHeader("X-Upstream-Provider-India", providerParts.join("+") || "INDIA");
                res.setHeader("X-India-Status", "OK");
              }
              return unique.length > 0 ? { quoteResponse: { result: unique } } : null;
            })
          : Promise.resolve(null),
        other.length > 0
          ? (async () => {
              try {
                const finnhub = await fetchFinnhubQuotes(other.join(","), controller.signal);
                if (finnhub) {
                  res.setHeader("X-Upstream-Provider", "FINNHUB");
                  res.setHeader("X-Upstream-Status", "200");
                  return finnhub;
                }
              } catch (error) {
                if (error instanceof Error && error.name === "AbortError") {
                  throw error;
                }
              }

              const upstream = await fetchQuoteWithFailover(other.join(","), controller.signal);
              res.setHeader("X-Upstream-Provider", "YAHOO");
              res.setHeader("X-Upstream-Status", String(upstream.status));

              if (!upstream.ok) {
                return null;
              }

              return (await upstream.json()) as YahooCompatiblePayload;
            })()
          : Promise.resolve(null),
      ]);

      const merged = [...(otherPayload?.quoteResponse?.result ?? []), ...(indiaPayload?.quoteResponse?.result ?? [])];
      payload = merged.length > 0 ? { quoteResponse: { result: merged } } : null;

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
    } finally {
      clearTimeout(timeout);
    }

    if (!noCache) {
      putCache(normalized, payload);
    }

    res.setHeader("Cache-Control", noCache ? "no-store" : EDGE_CACHE_MISS);
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
