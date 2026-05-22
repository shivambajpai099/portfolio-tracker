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
const SYMBOL_PATTERN = /^[A-Z0-9.\-^=]+$/;
const EDGE_CACHE_STALE = "public, s-maxage=1200, stale-while-revalidate=600";
const EDGE_CACHE_MISS = "public, s-maxage=30, stale-while-revalidate=120";
const RETRYABLE_UPSTREAM_STATUSES = new Set([401, 429, 500, 502, 503, 504]);

const CACHE = new Map<string, CacheEntry>();

const YAHOO_QUOTE_BASE_URLS = [
  "https://query2.finance.yahoo.com",
  "https://query1.finance.yahoo.com",
];

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

export default async function handler(req: any, res: any) {
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
    res.status(200).json({ quoteResponse: { result: [] } });
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

    const upstream = await fetchQuoteWithFailover(normalized, controller.signal).finally(() => {
      clearTimeout(timeout);
    });

    res.setHeader("X-Upstream-Status", String(upstream.status));

    if (!upstream.ok) {
      if (cached) {
        res.setHeader("Cache-Control", EDGE_CACHE_STALE);
        res.setHeader("X-Cache", "STALE");
        res.status(200).json(cached.payload);
        return;
      }

      res.status(upstream.status === 404 ? 404 : 502).json({ error: "Quote upstream request failed" });
      return;
    }

    const payload = await upstream.json();
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
