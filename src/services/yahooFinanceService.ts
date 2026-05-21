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
const TTL_MS = 15 * 60 * 1000;

const SEARCH_BASE = "https://query1.finance.yahoo.com/v1/finance/search";
const QUOTE_BASE = "https://query1.finance.yahoo.com/v7/finance/quote";

const nowIso = () => new Date().toISOString();

const isFresh = (entry: CacheEntry<unknown>): boolean => {
  const age = Date.now() - new Date(entry.fetchedAt).getTime();
  return age <= TTL_MS;
};

const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();

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
      };
    })
    .filter((quote): quote is LivePriceQuote => Boolean(quote));
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

  try {
    const endpoint = `${SEARCH_BASE}?q=${encodeURIComponent(trimmed)}&quotesCount=10&newsCount=0`;
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

export const fetchLivePrices = async (
  symbols: string[],
  signal?: AbortSignal
): Promise<ServiceResult<LivePriceQuote[]>> => {
  const normalized = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  if (normalized.length === 0) {
    return { ok: true, data: [], fromCache: false, fetchedAt: nowIso() };
  }

  const key = normalized.join(",");
  const cached = PRICE_CACHE.get(key);
  if (cached && isFresh(cached)) {
    return { ok: true, data: cached.value, fromCache: true, fetchedAt: cached.fetchedAt };
  }

  try {
    const endpoint = `${QUOTE_BASE}?symbols=${encodeURIComponent(key)}`;
    const response = await fetch(endpoint, { signal });

    if (!response.ok) {
      if (cached) {
        return {
          ok: false,
          error: buildError("Price API returned an error. Using cached prices.", "API"),
          data: cached.value,
          fromCache: true,
          fetchedAt: cached.fetchedAt,
        };
      }

      return {
        ok: false,
        error: buildError("Price API returned an error.", "API"),
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
};

export const clearYahooFinanceCache = (): void => {
  SEARCH_CACHE.clear();
  PRICE_CACHE.clear();
};

