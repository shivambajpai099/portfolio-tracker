# Repository Map — Portfolio Tracker

---

## Top-level Files

| File | Purpose |
|---|---|
| `app.json` | Expo config — name, slug, platforms, web output, typed routes |
| `package.json` | Dependencies and npm scripts (`start`, `ios`, `android`, `web`, `typecheck`) |
| `tsconfig.json` | Strict TypeScript — extends `expo/tsconfig.base` |
| `vercel.json` | Rewrites: `/api/*` → serverless functions; `/*` → `index.html` |
| `babel.config.js` | Expo Babel preset |
| `metro.config.js` | Metro bundler config |
| `README.md` | User-facing setup instructions |

---

## `app/` — Screens (Expo Router)

| File | Route | Description |
|---|---|---|
| `_layout.tsx` | root | Initialises auth, mounts `PortfolioCloudSyncBootstrap`, wraps Stack |
| `+html.tsx` | – | Web HTML shell (injected by Expo for web) |
| `(auth)/_layout.tsx` | – | Stack layout for auth screens |
| `(auth)/login.tsx` | `/login` | Email + password sign-in |
| `(auth)/signup.tsx` | `/signup` | New account registration |
| `(tabs)/_layout.tsx` | – | Tab bar layout; redirects to login if `!session` |
| `(tabs)/index.tsx` | `/` | **Dashboard** — portfolio totals, donut chart (geo/symbol filter), health card, rebalancing, deploy cash, onboarding modal |
| `(tabs)/holdings.tsx` | `/holdings` | **Holdings manager** — add/edit/delete holdings, live price refresh, group by stock/account/country/asset type, sort and filter |
| `(tabs)/xray.tsx` | `/xray` | **Portfolio X-Ray** — sector donut, concentration risk, geographic split, per-symbol breakdown |
| `(tabs)/drift.tsx` | `/drift` | **Drift tracker** — allocation change vs. historical baseline (1M, 3M, 6M), top-holding shifts |
| `(tabs)/timeline.tsx` | `/timeline` | **Timeline** — time-series charts for total value, invested value, gain/loss; range filter; CSV + screenshot export |
| `(tabs)/accounts.tsx` | `/accounts` | **Account manager** — BROKER/SAVINGS accounts, cash balances, inline cash edit |
| `(tabs)/settings.tsx` | `/settings` | FX rate, reporting currency, allocation basis, timeline retention, JSON export/import, clear data, sign out |

---

## `api/` — Vercel Serverless Functions

| File | Endpoint | Description |
|---|---|---|
| `quote.ts` | `GET /api/quote?symbols=A,B` | Yahoo Finance quote proxy; in-process cache (20 min); retry across query1/query2; Finnhub fallback; input sanitisation (max 50 symbols, validated pattern) |
| `search.ts` | `GET /api/search?q=term` | Yahoo Finance ticker search proxy; in-process cache (20 min); stale-on-error |

---

## `src/` — Application Source

### `src/store/` — Global State

| File | Description |
|---|---|
| `authStore.ts` | Zustand store — `initialized`, `session`, `user`, `error`; wraps `authService`; subscribes to `onAuthStateChange` |
| `portfolioStore.ts` | Zustand store + AsyncStorage persist — accounts, holdings, cashHoldings, allocationSnapshots, settings, fxRates; all CRUD; snapshot appended on every financial mutation; rehydration normalisation |

### `src/features/auth/` — Authentication

| File | Description |
|---|---|
| `authService.ts` | `getInitialSession`, `signInWithEmail`, `signUpWithEmail`, `signOutSession` — thin wrappers over Supabase auth; return `AuthResult` |
| `supabaseClient.ts` | Initialises `supabase` client (real or no-op stub when env vars absent); exports `hasSupabaseConfig: boolean`; uses AsyncStorage session storage on native, in-memory on web |

### `src/features/portfolio/` — Business Logic

| File | Description |
|---|---|
| `calculations.ts` | **All pure financial math** — FX helpers (`toINR`, `toUSD`, `convert`); holding-level cost/value/gain; `calcPortfolioTotals`; `calcSymbolAllocations` (with allocation basis + cash toggle); `calcGeographicSplit`; `calcConcentrationRisk` (HHI); `calcPortfolioSnapshot`; `calcRebalancingSuggestions`; `calcDeployCash` |
| `selectors.ts` | `exposureBySymbol` — aggregates holdings across accounts; re-exports `holdingMarketValue`, `toINR`, `toUSD` for convenience |
| `cloudSnapshot.ts` | `PortfolioSnapshotData` interface; `makeSnapshotPayload` (adds `schemaVersion`); `parseSnapshotPayload` (validates + normalises) |
| `cloudSyncService.ts` | `fetchLatestSnapshot(userId)` and `pushSnapshot(userId, snapshot)` — Supabase `portfolio_snapshots` CRUD |
| `PortfolioCloudSyncBootstrap.tsx` | Renderless component mounted in root layout; pulls remote snapshot on login; debounced push (700 ms) on every store mutation via `usePortfolioStore.subscribe` |
| `mockData.ts` | Seed data for first-run: `seedAccounts`, `seedHoldings`, `seedCashHoldings`, `seedFxRates`, `seedSettings` |
| `yahooSearch.ts` | Thin facade over `yahooFinanceService.searchTickerSuggestions`; exported as `searchTickers(query, signal)` |

### `src/services/` — External API Client

| File | Description |
|---|---|
| `yahooFinanceService.ts` | `fetchLivePrices(symbols)` + `searchTickerSuggestions(query)`; in-memory TTL caches (`PRICE_CACHE`, `SEARCH_CACHE`, 20 min); platform-aware URL routing (proxy on web, direct on native); returns `ServiceResult<T>` |

### `src/components/` — Shared UI

| File | Description |
|---|---|
| `ScreenContainer.tsx` | `SafeAreaView` wrapper; on web: `maxWidth: 680`, horizontally centered |
| `DonutChart.tsx` | SVG arc-segment donut chart via `react-native-svg`; pure SVG — no dependencies beyond slice data |
| `TimeSeriesChart.tsx` | SVG line + gradient area chart; interactive dot selection; `TimeSeriesPoint[]` input |
| `StatCard.tsx` | Single `label` + `value` display tile |
| `HoldingRow.tsx` | Row layout: symbol, subtitle, value |
| `PortfolioHealthCard.tsx` | Insight card array — evaluates concentration, position count, cash %, India/US split; colour-coded health levels |
| `RebalancingCard.tsx` | Target allocation editor (India / US / Cash %); shows `RebalancingResult` suggestions from `calculations.ts` |
| `DeployCashCard.tsx` | Cash deployment calculator — splits an amount across regions proportional to target allocation |
| `AddHoldingModal.tsx` | Full-screen modal — live ticker search (debounced), live price auto-fill, account picker, quantity/price inputs |
| `PortfolioGuideModal.tsx` | Onboarding tips modal; shown once on first launch (controlled by `settings.onboardingTipsSeen`) |

### `src/types/` — TypeScript Types

| File | Description |
|---|---|
| `portfolio.ts` | `Account`, `Holding`, `CashHolding`, `AllocationSnapshot`, `AllocationHoldingSnapshot`, `PortfolioSettings`, `FxRates`, `ExposureBySymbol`, `TargetAllocation`, `Currency`, `AccountType`, `TimelineRetention`, `AllocationBasis` |
| `marketData.ts` | `TickerSuggestion`, `LivePriceQuote`, `ServiceError`, `ServiceResult<T>` |

### `src/theme/` — Design Tokens

| File | Exports |
|---|---|
| `colors.ts` | `bg`, `surface`, `text`, `muted`, `accent`, `positive`, `negative` |
| `spacing.ts` | `xs` → `xxxl` (4 – 32 px) |
| `typography.ts` | Font sizes (`title` → `micro`), font weights (`weightRegular` → `weightBold`) |
| `radii.ts` | `sm` → `xl`, `pill` |
| `index.ts` | Re-exports all four token objects |

### `src/utils/`

| File | Description |
|---|---|
| `format.ts` | `formatMoney(value, currency)` — `Intl.NumberFormat` wrapper; `en-IN` locale for INR, `en-US` for USD |

---

## `supabase/` — Database

| File | Description |
|---|---|
| `portfolio_snapshots.sql` | **Do not edit after deploy.** Creates table, RLS, trigger, and four access policies. Run once in Supabase SQL editor. |
| `README.md` | Step-by-step Supabase setup guide |

---

## `docs/` — Project Documentation

| File | Description |
|---|---|
| `architecture.md` | Frontend/backend architecture, data flow, state management, API patterns |
| `repository-map.md` | This file |
| `qa-test-checklist-v1.0.0.md` | Manual QA checklist for v1.0.0 |
| `release-v1.0.0.md` | Full release notes |
| `release-executive-summary-v1.0.0.md` | Executive summary for v1.0.0 |

---

## Key Cross-Cutting Concerns

### ID Generation
```typescript
`acc-${Date.now()}-${Math.floor(Math.random() * 1000)}`   // accounts
`h-${Date.now()}-${Math.floor(Math.random() * 1000)}`      // holdings
`cash-${Date.now()}-${Math.floor(Math.random() * 1000)}`   // cash holdings
```

### Geographic Classification (used in multiple files)
```typescript
const isIndia = currency === "INR" || symbol.endsWith(".NS") || symbol.endsWith(".BO");
```

### Environment Variables
| Variable | Where used | Required |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `supabaseClient.ts` | No — disables cloud features if absent |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `supabaseClient.ts` | No — disables cloud features if absent |
| `EXPO_PUBLIC_API_BASE_URL` | `yahooFinanceService.ts` | No — native direct-calls Yahoo if absent |
| `FINNHUB_API_KEY` | `api/quote.ts` (server-side) | No — disables Finnhub fallback |

