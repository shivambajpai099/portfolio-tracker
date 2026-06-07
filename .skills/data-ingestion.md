# Skill: Data Ingestion

## Scope
- `src/services/yahooFinanceService.ts` — client-side API service
- `src/features/portfolio/yahooSearch.ts` — thin facade for ticker search
- `api/quote.ts` — Vercel serverless quote proxy
- `api/search.ts` — Vercel serverless search proxy
- `src/types/marketData.ts` — shared types

---

## Architecture Overview

```
App (any platform)
  │
  ├─ Platform.OS === "web" OR EXPO_PUBLIC_API_BASE_URL is set
  │     └─▶ /api/quote   (Vercel serverless)
  │         └─▶ Yahoo Finance query1/query2 (with retry + Finnhub fallback)
  │
  └─ Native with no EXPO_PUBLIC_API_BASE_URL
        └─▶ Yahoo Finance directly
```

All calls go through `yahooFinanceService.ts`. The proxy layer is transparent to the rest of the app.

---

## Client Service API (`yahooFinanceService.ts`)

### Fetch live prices
```typescript
fetchLivePrices(symbols: string[]): Promise<ServiceResult<LivePriceQuote[]>>
```
- Normalises symbols to uppercase.
- Checks `PRICE_CACHE` (in-memory `Map`, TTL 20 min). Returns cached result if fresh.
- Builds request URL: `/api/quote?symbols=A,B` (proxy) or direct Yahoo Finance URL.
- Returns `ServiceResult<LivePriceQuote[]>` — discriminated union.

### Search tickers
```typescript
searchTickerSuggestions(query: string, signal?: AbortSignal): Promise<ServiceResult<TickerSuggestion[]>>
```
- Minimum query length: 1 character.
- Checks `SEARCH_CACHE` (TTL 20 min).
- Filters `quoteType === "EQUITY"` from Yahoo response. Limits to 8 results.
- Infers `currency` from symbol suffix (`.NS`, `.BO` → INR; else USD).

### ServiceResult<T>
```typescript
type ServiceResult<T> =
  | { ok: true;  data: T;      fromCache: boolean; fetchedAt: string }
  | { ok: false; error: ServiceError; data?: T; fromCache: boolean; fetchedAt?: string }

type ServiceError = { code: "NETWORK" | "API" | "UNKNOWN"; message: string }
```
Always check `result.ok` before accessing `result.data`.

---

## Vercel Proxy — `/api/quote`

**Input**: `GET /api/quote?symbols=AAPL,RELIANCE.NS`

**Behaviour**:
1. Parses and sanitises symbols — max 50, max length 15, must match `/^[A-Z0-9.\-^=]+$/`.
2. Checks in-process `Map` cache (TTL 20 min, max 500 entries LRU eviction).
3. Tries `query2.finance.yahoo.com` then `query1.finance.yahoo.com` (retry with 200 ms delay).
4. Retryable upstream statuses: 401, 429, 500, 502, 503, 504.
5. If both Yahoo endpoints fail and `FINNHUB_API_KEY` is set, fetches each symbol individually from Finnhub and assembles a Yahoo-compatible response.
6. Serves stale cache on unrecoverable failure.
7. Sets `Cache-Control` headers for Vercel edge caching: `s-maxage=1200` on hit, `s-maxage=30` on miss.

**Finnhub fallback**: Only activates when `FINNHUB_API_KEY` env var is set server-side. Fetches `/api/v1/quote?symbol=X&token=KEY` per symbol (sequential, not batched).

---

## Vercel Proxy — `/api/search`

**Input**: `GET /api/search?q=apple`

**Behaviour**:
1. Returns empty `{ quotes: [] }` for queries < 2 characters.
2. Checks in-process `Map` cache (TTL 20 min).
3. Proxies to `query1.finance.yahoo.com/v1/finance/search?q=...&quotesCount=10&newsCount=0`.
4. Serves stale cache on upstream failure.

---

## Cache Strategy

| Cache | Location | TTL | Notes |
|---|---|---|---|
| `PRICE_CACHE` | Client in-memory Map | 20 min | Keyed by comma-joined symbols string |
| `SEARCH_CACHE` | Client in-memory Map | 20 min | Keyed by query string |
| `CACHE` in `api/quote.ts` | Server in-memory Map | 20 min | Max 500 entries; LRU eviction |
| `CACHE` in `api/search.ts` | Server in-memory Map | 20 min | No size limit |

Server-side caches reset on cold start. Client caches reset on app restart.

---

## Currency Inference

```typescript
const inferCurrency = (rawCurrency, symbol): Currency => {
  if (rawCurrency === "INR") return "INR";
  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) return "INR";
  return "USD";
};
```

---

## How Screens Use Live Prices

### Holdings screen (batch refresh)
```typescript
const result = await fetchLivePrices(symbols);
if (result.ok) {
  for (const quote of result.data) {
    updateHolding(holdingId, { marketPrice: quote.price });
  }
}
```

### AddHoldingModal (single quote on ticker select)
```typescript
const result = await fetchLivePrices([ticker.symbol]);
if (result.ok && result.data[0]) {
  setLivePrice(result.data[0].price);
}
```

### Ticker search (debounced, with AbortController)
```typescript
// yahooSearch.ts / searchTickers()
const suggestions = await searchTickers(query, abortController.signal);
```
The modal clears and recreates the `AbortController` on each keystroke (300 ms debounce via `setTimeout`).

---

## Adding a New Data Source

1. Add a new function in `yahooFinanceService.ts` that returns `ServiceResult<T>`.
2. If CORS is needed on web, add a corresponding function in a new `api/*.ts` serverless file and update `vercel.json` rewrites if the path pattern differs.
3. Use the same in-memory cache pattern (`Map` + `isFresh` helper).
4. Do not call external APIs directly from screen or store files.

