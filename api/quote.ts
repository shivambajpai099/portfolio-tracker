type CacheEntry = {
  payload: unknown;
  fetchedAtMs: number;
};

const CACHE_TTL_MS = 30 * 1000;
const CACHE = new Map<string, CacheEntry>();

const YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote";

const toStringQuery = (value: unknown): string => {
  if (Array.isArray(value)) {
    return String(value[0] ?? "");
  }
  return String(value ?? "");
};

const isFresh = (entry: CacheEntry): boolean => Date.now() - entry.fetchedAtMs <= CACHE_TTL_MS;

const normalizeSymbols = (raw: string): string =>
  raw
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
    .filter((symbol, idx, arr) => arr.indexOf(symbol) === idx)
    .join(",");

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ticker = toStringQuery(req.query?.ticker).trim();
  const symbolsRaw = toStringQuery(req.query?.symbols).trim();
  const requested = symbolsRaw || ticker;
  const normalized = normalizeSymbols(requested);

  if (!normalized) {
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
    res.status(200).json({ quoteResponse: { result: [] } });
    return;
  }

  const cached = CACHE.get(normalized);
  if (cached && isFresh(cached)) {
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    res.setHeader("X-Cache", "HIT");
    res.status(200).json(cached.payload);
    return;
  }

  const endpoint = `${YAHOO_QUOTE_URL}?symbols=${encodeURIComponent(normalized)}`;

  try {
    const upstream = await fetch(endpoint, {
      headers: {
        "User-Agent": "portfolio-tracker/1.0",
        Accept: "application/json",
      },
    });

    if (!upstream.ok) {
      if (cached) {
        res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
        res.setHeader("X-Cache", "STALE");
        res.status(200).json(cached.payload);
        return;
      }

      res.status(upstream.status === 404 ? 404 : 502).json({ error: "Quote upstream request failed" });
      return;
    }

    const payload = await upstream.json();
    CACHE.set(normalized, { payload, fetchedAtMs: Date.now() });

    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    res.setHeader("X-Cache", "MISS");
    res.status(200).json(payload);
  } catch {
    if (cached) {
      res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
      res.setHeader("X-Cache", "STALE");
      res.status(200).json(cached.payload);
      return;
    }

    res.status(502).json({ error: "Quote request failed" });
  }
}

