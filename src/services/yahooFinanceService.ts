import { Platform } from "react-native";
import type { Currency } from "../types/portfolio";
import type { LivePriceQuote, ServiceError, ServiceResult, TickerSuggestion } from "../types/marketData";

interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  exchange?: string;
  currency?: string;
  quoteType?: string;
}

interface YahooSearchResponse {
  quotes?: YahooSearchQuote[];
}

interface YahooQuoteItem {
  symbol?: string;
  regularMarketPrice?: number;
  currency?: string;
  fullExchangeName?: string;
  exchange?: string;
  regularMarketTime?: number;
  longName?: string;
  shortName?: string;
}

interface YahooQuoteResponse {
  quoteResponse?: {
    result?: YahooQuoteItem[];
  };
}

interface CacheEntry<T> {
  value: T;
  fetchedAt: string;
}

const SEARCH_CACHE = new Map<string, CacheEntry<TickerSuggestion[]>>();
const PRICE_CACHE = new Map<string, CacheEntry<LivePriceQuote[]>>();
const ISIN_SYMBOL_CACHE = new Map<string, CacheEntry<string | null>>();
const TTL_MS = 20 * 60 * 1000;

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const YAHOO_QUOTE_BASE_URLS = ["https://query2.finance.yahoo.com", "https://query1.finance.yahoo.com"];
const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const NSE_QUOTE_URL = "https://www.nseindia.com/api/quote-equity";
const GOOGLE_FINANCE_URL = "https://www.google.com/finance/quote";

const nowIso = () => new Date().toISOString();

const isFresh = (entry: CacheEntry<unknown>): boolean => {
  const age = Date.now() - new Date(entry.fetchedAt).getTime();
  return age <= TTL_MS;
};

const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();
const isIndiaQuoteSymbol = (symbol: string): boolean => /\.(NS|BO)$/i.test(symbol);
// Yahoo FX pairs (e.g. USDINR=X) are unreliable on the v7 quote endpoint but
// resolve fine via the chart API — route them there like Indian tickers.
const isFxSymbol = (symbol: string): boolean => /=X$/i.test(symbol);
const stripIndiaSuffix = (symbol: string): string => symbol.trim().toUpperCase().replace(/\.(NS|BO)$/i, "");
const indiaExchangeForSymbol = (symbol: string): "NSE" | "BOM" => (symbol.endsWith(".BO") ? "BOM" : "NSE");

const hasProxyBase = Platform.OS === "web" || API_BASE.length > 0;

const resolveApiUrl = (path: string): string => (API_BASE ? `${API_BASE}${path}` : path);

const inferCurrency = (rawCurrency: string | undefined, symbol: string): Currency => {
  if (rawCurrency === "INR") {
    return "INR";
  }

  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) {
    return "INR";
  }

  return "USD";
};

const buildError = (message: string, code: ServiceError["code"]): ServiceError => ({ message, code });

const mapSearchResults = (payload: YahooSearchResponse): TickerSuggestion[] => {
  return (payload.quotes ?? [])
    .filter((quote) => quote.quoteType === "EQUITY")
    .map((quote) => {
      const symbol = normalizeSymbol(quote.symbol ?? "");
      return {
        symbol,
        companyName: quote.longname ?? quote.shortname ?? symbol,
        exchange: quote.exchDisp ?? quote.exchange ?? "Unknown",
        currency: inferCurrency(quote.currency, symbol),
      };
    })
    .filter((item) => item.symbol.length > 0)
    .slice(0, 8);
};

const mapQuoteResults = (payload: YahooQuoteResponse): LivePriceQuote[] => {
  return (payload.quoteResponse?.result ?? [])
    .map((item) => {
      const symbol = normalizeSymbol(item.symbol ?? "");
      const price = item.regularMarketPrice;

      if (!symbol || typeof price !== "number") {
        return null;
      }

      const asOf = item.regularMarketTime
        ? new Date(item.regularMarketTime * 1000).toISOString()
        : nowIso();

      return {
        symbol,
        price,
        currency: inferCurrency(item.currency, symbol),
        exchange: item.fullExchangeName ?? item.exchange ?? "Unknown",
        asOf,
        companyName: item.longName ?? item.shortName ?? undefined,
      };
    })
    .filter((quote): quote is LivePriceQuote => Boolean(quote));
};

const fetchDirectYahooQuotes = async (key: string, signal?: AbortSignal): Promise<Response> => {
  const path = `/v7/finance/quote?symbols=${encodeURIComponent(key)}`;
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
        return response;
      }

      lastResponse = response;
      if (response.status !== 401 && response.status !== 429 && response.status !== 500 && response.status !== 502 && response.status !== 503 && response.status !== 504) {
        return response;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
    }

    if (index < YAHOO_QUOTE_BASE_URLS.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
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

const fetchDirectYahooChartQuotes = async (symbols: string[], signal?: AbortSignal): Promise<LivePriceQuote[]> => {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const endpoint = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false&events=div,splits`;

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

        const payload = (await response.json()) as {
          chart?: {
            result?: Array<{
              meta?: {
                symbol?: string;
                regularMarketPrice?: number;
                currency?: string;
                exchangeName?: string;
                fullExchangeName?: string;
                regularMarketTime?: number;
                longName?: string;
                shortName?: string;
              };
            }>;
          };
        };

        const meta = payload.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice;
        const resolvedSymbol = normalizeSymbol(meta?.symbol ?? symbol);
        if (!resolvedSymbol || typeof price !== "number") {
          return null;
        }

        return {
          symbol: resolvedSymbol,
          price,
          currency: inferCurrency(meta?.currency, resolvedSymbol),
          exchange: meta?.fullExchangeName ?? meta?.exchangeName ?? "Yahoo Chart",
          asOf: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : nowIso(),
          companyName: meta?.longName ?? meta?.shortName ?? undefined,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return null;
      }
    })
  );

  return results.filter((quote): quote is LivePriceQuote => Boolean(quote));
};

const getNseCookieHeader = async (signal?: AbortSignal): Promise<string | null> => {
  try {
    const response = await fetch("https://www.nseindia.com", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.nseindia.com/",
      },
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const headerLike = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = typeof headerLike.getSetCookie === "function" ? headerLike.getSetCookie() : [];
    const rawCookies = setCookies.length > 0 ? setCookies : [response.headers.get("set-cookie") ?? ""];

    const cookiePairs = rawCookies
      .flatMap((cookie) => cookie.split(/,(?=\s*[^;=]+=[^;=]+)/g))
      .map((cookie) => cookie.split(";")[0]?.trim())
      .filter((cookie): cookie is string => Boolean(cookie) && cookie.includes("="));

    return cookiePairs.length > 0 ? cookiePairs.join("; ") : null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return null;
  }
};

const fetchDirectNseQuotes = async (symbols: string[], signal?: AbortSignal): Promise<LivePriceQuote[]> => {
  const cookieHeader = await getNseCookieHeader(signal);
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

        const payload = (await response.json()) as {
          priceInfo?: { lastPrice?: number };
          info?: { companyName?: string };
          metadata?: { companyName?: string };
        };
        const price = payload.priceInfo?.lastPrice;
        if (typeof price !== "number") {
          return null;
        }

        return {
          symbol,
          price,
          currency: "INR" as Currency,
          exchange: "NSE",
          asOf: nowIso(),
          companyName: payload.info?.companyName ?? payload.metadata?.companyName ?? undefined,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return null;
      }
    })
  );

  return results.filter((quote): quote is LivePriceQuote => Boolean(quote));
};

const fetchDirectGoogleFinanceQuotes = async (symbols: string[], signal?: AbortSignal): Promise<LivePriceQuote[]> => {
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
          price,
          currency: "INR" as Currency,
          exchange: "Google Finance",
          asOf: nowIso(),
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return null;
      }
    })
  );

  return results.filter((quote): quote is LivePriceQuote => Boolean(quote));
};

export const searchTickerSuggestions = async (
  query: string,
  signal?: AbortSignal
): Promise<ServiceResult<TickerSuggestion[]>> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { ok: true, data: [], fromCache: false, fetchedAt: nowIso() };
  }

  const key = trimmed.toLowerCase();
  const cached = SEARCH_CACHE.get(key);
  if (cached && isFresh(cached)) {
    return { ok: true, data: cached.value, fromCache: true, fetchedAt: cached.fetchedAt };
  }

  if (!hasProxyBase) {
    return {
      ok: false,
      error: buildError("Market-data proxy is not configured. Set EXPO_PUBLIC_API_BASE_URL for native builds.", "API"),
      fromCache: false,
    };
  }

  try {
    const endpoint = resolveApiUrl(`/api/search?q=${encodeURIComponent(trimmed)}`);
    const response = await fetch(endpoint, { signal });

    if (!response.ok) {
      if (cached) {
        return {
          ok: false,
          error: buildError("Search API returned an error. Using cached suggestions.", "API"),
          data: cached.value,
          fromCache: true,
          fetchedAt: cached.fetchedAt,
        };
      }

      return {
        ok: false,
        error: buildError("Search API returned an error.", "API"),
        fromCache: false,
      };
    }

    const payload = (await response.json()) as YahooSearchResponse;
    const suggestions = mapSearchResults(payload);
    const fetchedAt = nowIso();

    SEARCH_CACHE.set(key, { value: suggestions, fetchedAt });

    return { ok: true, data: suggestions, fromCache: false, fetchedAt };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        error: buildError("Search request aborted.", "UNKNOWN"),
        fromCache: false,
      };
    }

    if (cached) {
      return {
        ok: false,
        error: buildError("Search failed. Using cached suggestions.", "NETWORK"),
        data: cached.value,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
      };
    }

    return {
      ok: false,
      error: buildError("Search failed. Please try again.", "NETWORK"),
      fromCache: false,
    };
  }
};

/**
 * Resolve a security's *current* ticker symbol from its ISIN.
 *
 * ISIN is permanent and survives NSE ticker renames, so this is used as a
 * price-lookup fallback when a stored symbol no longer resolves. Yahoo's search
 * endpoint accepts an ISIN and returns the matching listing(s); we prefer the
 * NSE (`.NS`), then BSE (`.BO`), then any INR listing, then the first result.
 *
 * Returns `null` when it can't be resolved (including when the search proxy is
 * not configured — search is proxy-only on native). Cached per ISIN.
 */
export const resolveSymbolByIsin = async (
  isin: string,
  signal?: AbortSignal
): Promise<string | null> => {
  const key = isin.trim().toUpperCase();
  if (!key) return null;

  const cached = ISIN_SYMBOL_CACHE.get(key);
  if (cached && isFresh(cached)) {
    return cached.value;
  }

  const result = await searchTickerSuggestions(key, signal);
  if (!result.ok || !result.data || result.data.length === 0) {
    // Preserve a previously-resolved value if the network call failed.
    return cached?.value ?? null;
  }

  const suggestions = result.data;
  const best =
    (suggestions.find((s) => s.symbol.toUpperCase().endsWith(".NS")) ??
      suggestions.find((s) => s.symbol.toUpperCase().endsWith(".BO")) ??
      suggestions.find((s) => s.currency === "INR") ??
      suggestions[0])?.symbol ?? null;

  ISIN_SYMBOL_CACHE.set(key, { value: best, fetchedAt: nowIso() });
  return best;
};

export const fetchLivePrices = async (
  symbols: string[],
  signal?: AbortSignal,
  forceRefresh?: boolean
): Promise<ServiceResult<LivePriceQuote[]>> => {
  const normalized = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  if (normalized.length === 0) {
    return { ok: true, data: [], fromCache: false, fetchedAt: nowIso() };
  }

  const key = normalized.join(",");
  const cached = PRICE_CACHE.get(key);
  if (!forceRefresh && cached && isFresh(cached)) {
    return { ok: true, data: cached.value, fromCache: true, fetchedAt: cached.fetchedAt };
  }

  const indiaSymbols = normalized.filter(isIndiaQuoteSymbol);
  const fxSymbols = normalized.filter(isFxSymbol);
  const otherSymbols = normalized.filter((symbol) => !isIndiaQuoteSymbol(symbol) && !isFxSymbol(symbol));

  try {
    if (!hasProxyBase) {
      const [indiaChartQuotes, indiaGoogleQuotes, indiaNseQuotes, fxQuotes, otherQuotes] = await Promise.all([
        indiaSymbols.length > 0 ? fetchDirectYahooChartQuotes(indiaSymbols, signal) : Promise.resolve([]),
        indiaSymbols.length > 0 ? fetchDirectGoogleFinanceQuotes(indiaSymbols, signal) : Promise.resolve([]),
        indiaSymbols.length > 0 ? fetchDirectNseQuotes(indiaSymbols, signal) : Promise.resolve([]),
        fxSymbols.length > 0 ? fetchDirectYahooChartQuotes(fxSymbols, signal) : Promise.resolve([]),
        otherSymbols.length > 0
          ? fetchDirectYahooQuotes(otherSymbols.join(","), signal).then((response) => {
              if (!response.ok) return [] as LivePriceQuote[];
              return response.json().then((payload) => mapQuoteResults(payload as YahooQuoteResponse));
            })
          : Promise.resolve([]),
      ]);

      const mergedIndiaQuotes = [...indiaChartQuotes, ...indiaGoogleQuotes, ...indiaNseQuotes];
      const quotes = [...otherQuotes, ...fxQuotes, ...mergedIndiaQuotes]
        .reduce<LivePriceQuote[]>((acc, quote) => {
          const existing = acc.find((item) => item.symbol === quote.symbol);
          if (!existing) {
            acc.push(quote);
          } else if (!existing.companyName && quote.companyName) {
            // Keep the first source's price but backfill a name from a later
            // source (e.g. chart has the price, NSE has the company name).
            existing.companyName = quote.companyName;
          }
          return acc;
        }, []);
      if (quotes.length > 0) {
        const fetchedAt = nowIso();
        PRICE_CACHE.set(key, { value: quotes, fetchedAt });
        return { ok: true, data: quotes, fromCache: false, fetchedAt };
      }

      if (cached) {
        return {
          ok: false,
          error: buildError("Price fetch failed. Using cached prices.", "NETWORK"),
          data: cached.value,
          fromCache: true,
          fetchedAt: cached.fetchedAt,
        };
      }

      return {
        ok: false,
        error: buildError("Price fetch failed. Please try again.", "NETWORK"),
        fromCache: false,
      };
    }

    // Using proxy API
    const apiUrl = resolveApiUrl(`/api/quote?symbols=${encodeURIComponent(key)}`);
    const response = await fetch(apiUrl, { signal });

    if (!response.ok) {
      if (cached) {
        return {
          ok: false,
          error: buildError(
            hasProxyBase ? "Price API returned an error. Using cached prices." : "Yahoo Finance returned an error. Using cached prices.",
            "API"
          ),
          data: cached.value,
          fromCache: true,
          fetchedAt: cached.fetchedAt,
        };
      }

      return {
        ok: false,
        error: buildError(hasProxyBase ? "Price API returned an error." : "Yahoo Finance returned an error.", "API"),
        fromCache: false,
      };
    }

    const payload = (await response.json()) as YahooQuoteResponse;
    const quotes = mapQuoteResults(payload);
    const fetchedAt = nowIso();

    PRICE_CACHE.set(key, { value: quotes, fetchedAt });

    return { ok: true, data: quotes, fromCache: false, fetchedAt };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        error: buildError("Price request aborted.", "UNKNOWN"),
        fromCache: false,
      };
    }

    if (cached) {
      return {
        ok: false,
        error: buildError(
          hasProxyBase ? "Price fetch failed. Using cached prices." : "Yahoo Finance fetch failed. Using cached prices.",
          "NETWORK"
        ),
        data: cached.value,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
      };
    }

    return {
      ok: false,
      error: buildError(
        hasProxyBase ? "Price fetch failed. Please try again." : "Yahoo Finance fetch failed. Please try again.",
        "NETWORK"
      ),
      fromCache: false,
    };
  }
};

// ---------------------------------------------------------------------------
// Sparkline (30-day price history)
// ---------------------------------------------------------------------------

const SPARKLINE_CACHE = new Map<string, CacheEntry<number[]>>();
const SPARKLINE_TTL_MS = 60 * 60 * 1000; // 1 hour cache for sparkline data

const isSparklineFresh = (entry: CacheEntry<unknown>): boolean => {
  const age = Date.now() - new Date(entry.fetchedAt).getTime();
  return age <= SPARKLINE_TTL_MS;
};

/**
 * Fetches 30-day closing price history for a symbol (for sparklines).
 * Returns an array of closing prices, oldest first.
 */
export const fetchSparklineData = async (
  symbol: string,
  signal?: AbortSignal
): Promise<ServiceResult<number[]>> => {
  const key = normalizeSymbol(symbol);
  const cached = SPARKLINE_CACHE.get(key);

  if (cached && isSparklineFresh(cached)) {
    return { ok: true, data: cached.value, fromCache: true, fetchedAt: cached.fetchedAt };
  }

  try {
    // Yahoo Finance chart API for 1 month of daily data
    const chartUrl = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(key)}?range=1mo&interval=1d`;
    
    const response = await fetch(chartUrl, {
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
      if (cached) {
        return { ok: true, data: cached.value, fromCache: true, fetchedAt: cached.fetchedAt };
      }
      return {
        ok: false,
        error: buildError(`Failed to fetch sparkline data (${response.status})`, "NETWORK"),
        fromCache: false,
      };
    }

    const payload = (await response.json()) as {
      chart?: {
        result?: Array<{
          indicators?: {
            quote?: Array<{
              close?: (number | null)[];
            }>;
          };
        }>;
      };
    };

    const closes = payload.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((c): c is number => typeof c === "number" && !Number.isNaN(c));

    if (validCloses.length === 0) {
      if (cached) {
        return { ok: true, data: cached.value, fromCache: true, fetchedAt: cached.fetchedAt };
      }
      return {
        ok: false,
        error: buildError("No price history available", "UNKNOWN"),
        fromCache: false,
      };
    }

    const fetchedAt = nowIso();
    SPARKLINE_CACHE.set(key, { value: validCloses, fetchedAt });

    return { ok: true, data: validCloses, fromCache: false, fetchedAt };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        error: buildError("Sparkline request aborted.", "UNKNOWN"),
        fromCache: false,
      };
    }

    if (cached) {
      return { ok: true, data: cached.value, fromCache: true, fetchedAt: cached.fetchedAt };
    }

    return {
      ok: false,
      error: buildError("Failed to fetch sparkline data", "NETWORK"),
      fromCache: false,
    };
  }
};

export const clearYahooFinanceCache = (): void => {
  SEARCH_CACHE.clear();
  PRICE_CACHE.clear();
  SPARKLINE_CACHE.clear();
};

/**
 * Fetches the live USD → INR exchange rate (number of INR per 1 USD).
 * Uses the same live-price pipeline (proxy on web, direct on native) with the
 * Yahoo FX symbol `USDINR=X`. Returns a discriminated result so callers can
 * fall back to the manually stored rate on failure.
 */
export const fetchUsdInrRate = async (
  signal?: AbortSignal,
  forceRefresh?: boolean
): Promise<ServiceResult<number>> => {
  const result = await fetchLivePrices(["USDINR=X"], signal, forceRefresh);
  if (!result.ok) {
    return { ok: false, error: result.error, fromCache: result.fromCache, fetchedAt: result.fetchedAt };
  }

  const quote = result.data.find((item) => item.symbol === "USDINR=X") ?? result.data[0];
  const rate = quote?.price;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return {
      ok: false,
      error: buildError("Could not read a valid USD/INR rate.", "API"),
      fromCache: result.fromCache,
      fetchedAt: result.fetchedAt,
    };
  }

  return { ok: true, data: rate, fromCache: result.fromCache, fetchedAt: result.fetchedAt };
};

