# Architecture — Portfolio Tracker

---

## Frontend Architecture

### Framework & Routing
Expo SDK 53 with **Expo Router v4** (file-based routing). The router maps the `app/` directory to routes at build time.

```
app/
  _layout.tsx          Root Stack — initialises auth, mounts PortfolioCloudSyncBootstrap
  +html.tsx            Web HTML shell
  (auth)/
    _layout.tsx        Stack for unauthenticated screens
    login.tsx          Email/password login
    signup.tsx         Account creation
  (tabs)/
    _layout.tsx        Tab bar — redirects to login if no session
    index.tsx          Dashboard
    holdings.tsx       Holdings manager
    xray.tsx           Portfolio X-Ray
    drift.tsx          Drift tracker
    timeline.tsx       Timeline charts
    accounts.tsx       Account manager
    settings.tsx       Settings + import/export
```

**Auth guard**: `(tabs)/_layout.tsx` reads `useAuthStore` → if `!session` it renders `<Redirect href="/(auth)/login" />`. The root layout initialises the auth store on mount.

### Component Model
- All shared UI lives in `src/components/`.
- Screen files (`app/(tabs)/*.tsx`) are thick — they own local state, filter/sort logic, and modal orchestration — but delegate all financial calculations to `src/features/portfolio/calculations.ts`.
- No CSS framework. Styles are defined with `StyleSheet.create` using the design tokens in `src/theme/`.

### Theme Tokens
```
src/theme/
  colors.ts      { bg, surface, text, muted, accent, positive, negative }
  spacing.ts     { xs:4, sm:8, md:12, lg:16, xl:20, xxl:24, xxxl:32 }
  typography.ts  { title:28, heading:22, subheading:18, body:14, caption:12, micro:10, weights }
  radii.ts       { sm:8, md:12, lg:16, xl:20, pill:999 }
  index.ts       re-exports all tokens
```

### Web Specifics
- Metro static bundler (`app.json` → `web.output: "static"`).
- `ScreenContainer` wraps every screen; on web it caps content width at 680 px.
- API calls are routed through `/api/quote` and `/api/search` (same-origin Vercel functions) to avoid CORS.
- `Platform.OS === "web"` guards used in `_layout.tsx` and `timeline.tsx` (file export uses DOM anchor vs. `expo-sharing`).

---

## Backend Architecture

### Supabase (optional cloud backend)
- **Auth**: Supabase email/password auth. The JS SDK is initialised in `src/features/auth/supabaseClient.ts`.
- **Database**: Single table `portfolio_snapshots` (one row per user).
  - `user_id` UUID — FK to `auth.users`, with cascade delete.
  - `portfolio_json` JSONB — full versioned portfolio snapshot.
  - `updated_at` — auto-updated by a Postgres trigger on every `UPDATE`.
  - Row-Level Security enabled; four policies: select/insert/update/delete own rows only.
- The app operates **entirely offline** when `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` is absent. `hasSupabaseConfig` gates every Supabase call.

### Vercel Serverless API Proxy
```
api/
  quote.ts    GET /api/quote?symbols=AAPL,RELIANCE
  search.ts   GET /api/search?q=apple
```
Both functions:
- Proxy requests to Yahoo Finance (query1/query2 endpoints).
- Maintain an in-process LRU-style `Map` cache (TTL 20 min).
- Serve stale cache on upstream failure.
- `quote.ts` additionally retries Yahoo Finance and falls back to Finnhub if `FINNHUB_API_KEY` is set.
- Respond with `Cache-Control` headers for Vercel edge caching.

---

## Data Flow

### Adding a Holding (typical mutation flow)
```
User input (AddHoldingModal)
  │
  ▼
portfolioStore.addHolding(holding)
  │  Zustand set()
  ├─ appends holding to state.holdings
  ├─ builds a new AllocationSnapshot (calls buildAllocationSnapshot)
  ├─ appends snapshot to state.allocationSnapshots (pruned by retention)
  └─ updates snapshotUpdatedAt
        │
        ├─▶ AsyncStorage (zustand/persist — automatic)
        │
        └─▶ PortfolioCloudSyncBootstrap.subscribe()
               └─ schedules debounced pushSnapshot() (700 ms)
                     │
                     └─▶ Supabase upsert portfolio_snapshots
```

### Live Price Refresh (holdings screen)
```
User taps "Refresh prices"
  │
  ▼
yahooFinanceService.fetchLivePrices(symbols)
  │  checks in-memory PRICE_CACHE (TTL 20 min)
  │  on miss → GET /api/quote?symbols=...
  │
  ▼
Screen maps prices → portfolioStore.updateHolding(id, { marketPrice })
  └─ triggers snapshot + cloud push as above
```

### Cloud Sync on Login
```
User signs in → authStore.session set
  │
  ▼
PortfolioCloudSyncBootstrap (useEffect on userId + hydrated)
  │
  ├─ cloudSyncService.fetchLatestSnapshot(userId)
  │     Supabase SELECT portfolio_snapshots WHERE user_id = userId
  │
  ├─ if remote.snapshotUpdatedAt > local.snapshotUpdatedAt
  │     portfolioStore.replaceFromSnapshot(remote.data)
  │
  └─ if no remote exists → pushSnapshot() to seed cloud from local
```

---

## State Management

### Stores

#### `useAuthStore` (`src/store/authStore.ts`)
```typescript
{
  initialized: boolean       // true after getInitialSession() resolves
  loading: boolean
  session: AuthSession | null
  user: AuthUser | null
  error: string | null
  initialize()               // called once from root layout
  signIn(email, password)
  signUp(email, password)
  signOut()
  clearError()
}
```
- Listens to `supabase.auth.onAuthStateChange` to react to token refresh and cross-tab sign-out.
- Subscription is cleaned up via `cleanupAuthStore()` (exported, called in root layout's `useEffect` cleanup).

#### `usePortfolioStore` (`src/store/portfolioStore.ts`)
```typescript
{
  accounts: Account[]
  holdings: Holding[]
  cashHoldings: CashHolding[]
  allocationSnapshots: AllocationSnapshot[]   // time-series history
  settings: PortfolioSettings
  fxRates: FxRates                            // { USDINR: number }
  snapshotUpdatedAt: string
  hydrated: boolean                           // true after AsyncStorage rehydrate

  // CRUD
  addAccount / updateAccount / removeAccount
  addHolding / updateHolding / removeHolding
  addCashHolding / updateCashHolding / removeCashHolding

  // Settings
  updateSettings(updates)
  updateFxRates(rates)
  clearAllData()

  // Snapshot / sync
  getSnapshot() → PortfolioSnapshotData
  replaceFromSnapshot(snapshot)
  setHydrated(boolean)

  // Derived (computed on demand)
  totalValueInINR() → number
  totalValueInUSD() → number
  exposure() → ExposureBySymbol[]
}
```

**Persistence**: All state except `hydrated` is persisted via `zustand/middleware/persist` to AsyncStorage under the key `"portfolio-storage"`.

**Snapshot building**: Every mutation that changes financial data (add/update/remove holding or cash, remove account) synchronously appends a new `AllocationSnapshot` to `allocationSnapshots`. Snapshots are pruned to the configured `timelineRetention` window (6M / 1Y / 2Y / ALL) and hard-capped at 500 entries.

**Rehydration normalisation**: `onRehydrateStorage` migrates persisted data across schema versions — fills in missing `investedValue`/`gainLoss` fields, backfills `topHoldings`, and ensures `onboardingTipsSeen` is boolean.

---

## API Integration Patterns

### Client-side service (`yahooFinanceService.ts`)
```typescript
// Returns ServiceResult<T> — discriminated union
const result = await fetchLivePrices(["AAPL", "RELIANCE.NS"]);
if (result.ok) {
  const quotes: LivePriceQuote[] = result.data;
} else {
  const error: ServiceError = result.error;
}
```
- Normalises symbols to uppercase.
- Infers currency from symbol suffix (`.NS`, `.BO` → INR; else USD).
- Separate in-memory caches for search results and price quotes (TTL 20 min).
- On web: calls `resolveApiUrl("/api/quote")` which routes to the same-origin Vercel function.
- On native: calls Yahoo Finance directly (or uses `EXPO_PUBLIC_API_BASE_URL` if set).

### Ticker search
```typescript
// Used in AddHoldingModal via yahooSearch.ts wrapper
const suggestions: TickerSuggestion[] = await searchTickers(query, abortSignal);
```
Debounced in the modal (300 ms via `setTimeout`/`AbortController` pattern).

### Snapshot serialisation (`cloudSnapshot.ts`)
```typescript
// Schema-versioned wrapper
makeSnapshotPayload(data)   // → { schemaVersion: 1, snapshotUpdatedAt, portfolio: data }
parseSnapshotPayload(json)  // validates shape, normalises optional fields, returns data | null
```
`SNAPSHOT_SCHEMA_VERSION = 1` — increment and add migration logic in `parseSnapshotPayload` for breaking schema changes.

