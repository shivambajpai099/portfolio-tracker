/**
 * Corporate Actions Service
 *
 * Fetches known corporate actions (currently STOCK SPLITS) for a set of
 * securities so they can be reviewed and edited during the import flow before
 * being applied by the CorporateActionProcessor.
 *
 * Source: Yahoo Finance chart API `events=splits`. Routing mirrors the price
 * service:
 *   - Web (or when EXPO_PUBLIC_API_BASE_URL is set) → Vercel proxy `/api/splits`
 *     to avoid browser CORS.
 *   - Native without a proxy base → direct Yahoo chart call.
 *
 * Indian tickers need their exchange suffix (`TATASTEEL.NS`); broker exports use
 * the bare NSE symbol, so for INR securities we try the `.NS` then `.BO`
 * variants while keeping the bare symbol for display / transaction matching.
 */

import type { StockSplit } from "../features/portfolio/corporateActionProcessor";
import type { Currency } from "../types/portfolio";

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");
// Web (react-native-web) exposes `document`; native (Hermes/JSC) and node do not.
// On web we must route through the proxy to avoid CORS on the Yahoo chart API.
const isWeb = typeof document !== "undefined";
const hasProxyBase = isWeb || API_BASE.length > 0;
const resolveApiUrl = (path: string): string => (API_BASE ? `${API_BASE}${path}` : path);

const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

interface YahooSplitEvent {
  date: number; // unix seconds of the ex/effective date
  numerator: number; // shares after
  denominator: number; // shares before
  splitRatio?: string; // e.g. "4:1"
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      events?: { splits?: Record<string, YahooSplitEvent> };
    }>;
  };
}

export interface FetchedCorporateActions {
  /** Splits discovered upstream, sorted chronologically (oldest first). */
  splits: StockSplit[];
  /** Per-symbol fetch problems (network/CORS/parse), for optional display. */
  errors: string[];
}

const CHART_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

const toEffectiveDate = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toISOString().slice(0, 10);

const hasExchangeSuffix = (symbol: string): boolean => /\.(NS|BO)$/i.test(symbol);

/**
 * Yahoo needs the exchange suffix for Indian tickers (e.g. `TATASTEEL.NS`),
 * but broker exports (Groww) use the bare NSE symbol. For INR securities
 * without a suffix, try the NSE then BSE variants; otherwise use the symbol
 * as-is.
 */
const buildCandidateSymbols = (symbol: string, currency?: Currency): string[] => {
  const normalized = symbol.trim().toUpperCase();
  if (hasExchangeSuffix(normalized)) return [normalized];
  if (currency === "INR") return [`${normalized}.NS`, `${normalized}.BO`];
  return [normalized];
};

const fetchSplitsForCandidate = async (
  candidateSymbol: string,
  displaySymbol: string,
  isin: string | undefined,
  signal?: AbortSignal
): Promise<StockSplit[]> => {
  const url = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(candidateSymbol)}?range=10y&interval=1d&events=splits`;
  const response = await fetch(url, { headers: CHART_HEADERS, signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as YahooChartResponse;
  const events = payload.chart?.result?.[0]?.events?.splits ?? {};

  const splits: StockSplit[] = [];
  for (const event of Object.values(events)) {
    if (!event || !Number.isFinite(event.numerator) || !Number.isFinite(event.denominator)) continue;
    if (event.numerator <= 0 || event.denominator <= 0) continue;

    splits.push({
      type: "split",
      symbol: displaySymbol,
      isin,
      effectiveDate: toEffectiveDate(event.date),
      ratio: { newShares: event.numerator, oldShares: event.denominator },
      label: event.splitRatio ? `${displaySymbol} ${event.splitRatio} split` : `${displaySymbol} split`,
    });
  }
  return splits;
};

/**
 * Fetch splits for one security, trying exchange-suffix variants for Indian
 * tickers. Returns the splits from the first candidate that yields any; throws
 * only when every candidate fails to fetch.
 */
const fetchSplitsForSymbol = async (
  symbol: string,
  isin: string | undefined,
  currency: Currency | undefined,
  signal?: AbortSignal
): Promise<StockSplit[]> => {
  const candidates = buildCandidateSymbols(symbol, currency);
  const displaySymbol = symbol.trim().toUpperCase();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const found = await fetchSplitsForCandidate(candidate, displaySymbol, isin, signal);
      if (found.length > 0) return found;
      lastError = null; // a successful empty response is not an error
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError instanceof Error ? lastError : new Error("fetch failed");
  return [];
};

/**
 * Fetch raw split events for many candidate symbols via the Vercel proxy in a
 * single request (avoids web CORS). Returns a map keyed by upper-cased symbol.
 */
const fetchRawSplitsViaProxy = async (
  candidateSymbols: string[],
  signal?: AbortSignal
): Promise<Record<string, YahooSplitEvent[]>> => {
  const url = resolveApiUrl(`/api/splits?symbols=${encodeURIComponent(candidateSymbols.join(","))}`);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { splits?: Record<string, YahooSplitEvent[]> };

  const normalized: Record<string, YahooSplitEvent[]> = {};
  for (const [symbol, events] of Object.entries(payload.splits ?? {})) {
    normalized[symbol.toUpperCase()] = Array.isArray(events) ? events : [];
  }
  return normalized;
};

/** Map raw Yahoo split events onto StockSplit records for a display symbol. */
const mapRawEvents = (
  events: YahooSplitEvent[],
  displaySymbol: string,
  isin: string | undefined
): StockSplit[] => {
  const splits: StockSplit[] = [];
  for (const event of events) {
    if (!event || !Number.isFinite(event.numerator) || !Number.isFinite(event.denominator)) continue;
    if (event.numerator <= 0 || event.denominator <= 0) continue;
    splits.push({
      type: "split",
      symbol: displaySymbol,
      isin,
      effectiveDate: toEffectiveDate(event.date),
      ratio: { newShares: event.numerator, oldShares: event.denominator },
      label: event.splitRatio ? `${displaySymbol} ${event.splitRatio} split` : `${displaySymbol} split`,
    });
  }
  return splits;
};

type SecurityMeta = { isin?: string; currency?: Currency };

const dedupeSecurities = (
  securities: Array<{ symbol: string; isin?: string; currency?: Currency }>
): Map<string, SecurityMeta> => {
  const bySymbol = new Map<string, SecurityMeta>();
  for (const security of securities) {
    const symbol = security.symbol.trim().toUpperCase();
    if (!symbol || bySymbol.has(symbol)) continue;
    bySymbol.set(symbol, {
      isin: security.isin?.trim().toUpperCase() || undefined,
      currency: security.currency,
    });
  }
  return bySymbol;
};

/** Native path: fetch each security's candidates directly, first non-empty wins. */
const fetchDirect = async (
  bySymbol: Map<string, SecurityMeta>,
  signal?: AbortSignal
): Promise<FetchedCorporateActions> => {
  const splits: StockSplit[] = [];
  const errors: string[] = [];

  await Promise.all(
    [...bySymbol.entries()].map(async ([symbol, meta]) => {
      try {
        const found = await fetchSplitsForSymbol(symbol, meta.isin, meta.currency, signal);
        splits.push(...found);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        errors.push(`${symbol}: ${error instanceof Error ? error.message : "fetch failed"}`);
      }
    })
  );

  splits.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return { splits, errors };
};

/** Web/proxy path: batch all candidate symbols into one `/api/splits` call. */
const fetchViaProxy = async (
  bySymbol: Map<string, SecurityMeta>,
  signal?: AbortSignal
): Promise<FetchedCorporateActions> => {
  const perSymbolCandidates = new Map<string, string[]>();
  const allCandidates = new Set<string>();
  for (const [symbol, meta] of bySymbol.entries()) {
    const candidates = buildCandidateSymbols(symbol, meta.currency);
    perSymbolCandidates.set(symbol, candidates);
    candidates.forEach((c) => allCandidates.add(c));
  }

  let rawByCandidate: Record<string, YahooSplitEvent[]> = {};
  try {
    rawByCandidate = await fetchRawSplitsViaProxy([...allCandidates], signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { splits: [], errors: [] };
    return {
      splits: [],
      errors: [`corporate actions: ${error instanceof Error ? error.message : "fetch failed"}`],
    };
  }

  const splits: StockSplit[] = [];
  for (const [symbol, meta] of bySymbol.entries()) {
    const candidates = perSymbolCandidates.get(symbol) ?? [];
    const chosen = candidates.find((c) => (rawByCandidate[c]?.length ?? 0) > 0);
    if (!chosen) continue;
    splits.push(...mapRawEvents(rawByCandidate[chosen], symbol, meta.isin));
  }

  splits.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return { splits, errors: [] };
};

/**
 * Fetch stock splits for the given securities. Routes through the Vercel proxy
 * on web (avoids CORS) and hits Yahoo directly on native. Fails soft: symbols
 * that error simply contribute no splits.
 */
export const fetchStockSplits = async (
  securities: Array<{ symbol: string; isin?: string; currency?: Currency }>,
  signal?: AbortSignal
): Promise<FetchedCorporateActions> => {
  const bySymbol = dedupeSecurities(securities);
  if (bySymbol.size === 0) return { splits: [], errors: [] };
  return hasProxyBase ? fetchViaProxy(bySymbol, signal) : fetchDirect(bySymbol, signal);
};

