import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * /api/splits — Corporate-action (stock split) proxy.
 *
 * Fetches split history from the Yahoo Finance chart API server-side so the web
 * client avoids CORS (mirrors /api/quote). Indian tickers must be passed with
 * their exchange suffix (e.g. TATASTEEL.NS) — the client builds those variants.
 *
 * Response: { splits: { [symbol: string]: RawSplitEvent[] } }
 */

const UPSTREAM_TIMEOUT_MS = 10000;
const MAX_SYMBOL_COUNT = 60;
const MAX_SYMBOL_LENGTH = 20;
const SYMBOL_PATTERN = /^[A-Z0-9.&\-^=]+$/;
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const EDGE_CACHE = "public, s-maxage=86400, stale-while-revalidate=3600";

interface RawSplitEvent {
  date: number;
  numerator: number;
  denominator: number;
  splitRatio?: string;
}

const toStringQuery = (value: unknown): string =>
  Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");

const normalizeSymbols = (raw: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const symbol = part.trim().toUpperCase();
    if (!symbol || symbol.length > MAX_SYMBOL_LENGTH || !SYMBOL_PATTERN.test(symbol)) continue;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
    if (out.length >= MAX_SYMBOL_COUNT) break;
  }
  return out;
};

const fetchSymbolSplits = async (symbol: string): Promise<RawSplitEvent[]> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=10y&interval=1d&events=splits`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      chart?: { result?: Array<{ events?: { splits?: Record<string, RawSplitEvent> } }> };
    };
    const events = payload.chart?.result?.[0]?.events?.splits ?? {};
    return Object.values(events).filter((event): event is RawSplitEvent => Boolean(event));
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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

  const symbols = normalizeSymbols(toStringQuery(req.query.symbols));
  if (symbols.length === 0) {
    res.status(400).json({ error: "No valid symbols provided" });
    return;
  }

  try {
    const entries = await Promise.all(
      symbols.map(async (symbol) => [symbol, await fetchSymbolSplits(symbol)] as const)
    );
    const splits: Record<string, RawSplitEvent[]> = {};
    for (const [symbol, events] of entries) splits[symbol] = events;

    res.setHeader("Cache-Control", EDGE_CACHE);
    res.status(200).json({ splits });
  } catch (error) {
    console.error("[/api/splits] Error:", error);
    res.status(500).json({ error: "Failed to fetch splits" });
  }
}

