# AGENTS.md — Portfolio Tracker

> AI-agent reference document. Keep concise. Update when architecture changes.

---

## High-Level Architecture

Local-first portfolio tracker for Indian + US equity portfolios. Runs on iOS, Android, and Web from a single Expo codebase. All data lives in device-local AsyncStorage (Zustand persist). Optional Supabase backend provides email auth and one-row-per-user cloud sync. A Vercel serverless layer proxies Yahoo Finance API calls to avoid CORS issues on the web build.

```
┌─────────────────────────────────────┐
│            Expo App                 │
│  ┌──────────┐  ┌──────────────────┐ │
│  │ authStore│  │ portfolioStore   │ │  ← Zustand + AsyncStorage
│  └────┬─────┘  └────────┬─────────┘ │
│       │                 │           │
│  ┌────▼─────────────────▼─────────┐ │
│  │   PortfolioCloudSyncBootstrap  │ │  ← renderless sync orchestrator
│  └────────────────┬───────────────┘ │
└───────────────────┼─────────────────┘
                    │ Supabase JS SDK
          ┌─────────▼──────────┐
          │  Supabase (optional)│
          │  auth + portfolio_  │
          │  snapshots table    │
          └─────────────────────┘

App ──/api/quote──▶ Vercel edge fn ──▶ Yahoo Finance / Finnhub
App ──/api/search─▶ Vercel edge fn ──▶ Yahoo Finance
```

---

## Key Technologies

| Layer | Technology |
|---|---|
| Framework | Expo SDK 53, Expo Router v4 (file-based routing) |
| UI | React Native 0.76, react-native-svg (charts), react-native-safe-area-context |
| State | Zustand v5 with `persist` middleware → AsyncStorage |
| Auth | Supabase JS SDK v2 (optional; degrades gracefully without env vars) |
| Cloud DB | Supabase Postgres — single table `portfolio_snapshots` |
| API Proxy | Vercel serverless functions (`api/quote.ts`, `api/search.ts`) |
| Animation | react-native-reanimated |
| Language | TypeScript 5.7, strict mode |
| Styling | `StyleSheet.create` + custom theme tokens (no CSS frameworks) |
| Targets | iOS, Android, Web (Metro bundler, static output) |

---

## Important Folders and Their Purpose

```
app/                    Expo Router screens (file = route)
  _layout.tsx           Root layout: initialises auth, mounts cloud sync bootstrap
  (auth)/               Unauthenticated route group (login, signup)
  (tabs)/               Main tab bar (requires session)
    index.tsx           Dashboard / Overview
    holdings.tsx        Holdings manager (add, edit, delete, live prices)
    xray.tsx            Portfolio X-Ray (sector, concentration, geo breakdown)
    drift.tsx           Allocation drift vs. historical snapshot
    timeline.tsx        Time-series charts + CSV/image export
    accounts.tsx        Account + cash balance manager
    settings.tsx        FX rate, reporting currency, import/export JSON, sign out

api/                    Vercel serverless API proxy functions
  quote.ts              /api/quote — Yahoo Finance quote proxy + Finnhub fallback
  search.ts             /api/search — Yahoo Finance ticker search proxy

src/
  components/           Shared presentational + composite components
  features/
    auth/               authService.ts, supabaseClient.ts
    portfolio/          calculations.ts, selectors.ts, cloudSnapshot.ts,
                        cloudSyncService.ts, PortfolioCloudSyncBootstrap.tsx,
                        mockData.ts, yahooSearch.ts
  services/             yahooFinanceService.ts (API client with in-memory cache)
  store/                authStore.ts, portfolioStore.ts
  theme/                colors.ts, spacing.ts, typography.ts, radii.ts, index.ts
  types/                portfolio.ts, marketData.ts
  utils/                format.ts

supabase/               DB migration SQL + setup README
docs/                   Architecture, repository map, QA checklists, release notes
```

---

## Coding Conventions

### TypeScript
- Strict mode is on (`tsconfig.json` → `"strict": true`).
- Prefer `type` imports (`import type { Foo }`).
- Discriminated union `ServiceResult<T>` for all service return values.

### React / Components
- Functional components only; no class components.
- Hooks for all local state; complex derived values via `useMemo`.
- Zustand subscriptions use individual slice selectors — never subscribe to the whole store object.

### Styling
- All styles via `StyleSheet.create`. No inline style objects.
- Import theme tokens from `src/theme`: `colors`, `spacing`, `typography`, `radii`.
- Dark theme only. Background `#0B0C10`, surface `#14161A`, accent `#67E8F9`.
- Web screens are capped at `maxWidth: 680` inside `ScreenContainer`.

### IDs
- Generated locally at creation time: `` `acc-${Date.now()}-${Math.floor(Math.random() * 1000)}` ``
- Same pattern for holdings (`h-`) and cash (`cash-`).

### Timestamps
- All timestamps are ISO 8601 strings (`new Date().toISOString()`).
- `snapshotUpdatedAt` is updated on every store mutation.

### Geographic Classification
- India = `currency === "INR"` OR symbol ends in `.NS` or `.BO`.
- US = everything else.

### Calculations
- All financial math is in pure functions in `src/features/portfolio/calculations.ts`.
- Screen files call calculation functions directly; no business logic inside JSX.

### API / Services
- `yahooFinanceService.ts` is the single source of truth for all market data on the client.
- In-memory TTL cache (20 min) prevents redundant network calls within a session.
- On web, API calls route through `/api/quote` and `/api/search` (Vercel proxy).
- On native, direct Yahoo Finance URLs are used when `EXPO_PUBLIC_API_BASE_URL` is unset.

### Cloud Sync
- `PortfolioCloudSyncBootstrap` is a renderless component mounted in the root layout.
- On login: pull remote snapshot → compare `snapshotUpdatedAt` → apply if remote is newer.
- On every store mutation: debounced push (700 ms delay) via `usePortfolioStore.subscribe`.
- Sync is entirely skipped when `hasSupabaseConfig` is false.

---

## Files and Folders That Must Never Be Modified

| Path | Reason |
|---|---|
| `*.legacy.*`, `*.removed.*` | Deprecated config artifacts kept for reference only |
| `expo-env.d.ts` | Auto-generated by Expo; overwritten on each build |
| `.expo/` | Expo runtime cache; auto-generated |
| `node_modules/` | Dependency install output |
| `dist/` | Build output |
| `supabase/portfolio_snapshots.sql` | Production migration; run once in Supabase dashboard — do not edit after deploy |

---

## Common Development Workflows

### Start dev server
```bash
npm start          # Expo dev server (choose platform interactively)
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # Web browser
```

### Type-check
```bash
npm run typecheck
```

### Configure Supabase (optional)
Create a `.env` file at the repo root:
```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```
Without these vars the app runs fully offline; auth screens are inaccessible.

### Configure API proxy base URL (web deployment)
```
EXPO_PUBLIC_API_BASE_URL=https://<your-vercel-deployment>.vercel.app
```
When unset on native, the service calls Yahoo Finance directly.

### Add a new tab screen
1. Create `app/(tabs)/myscreen.tsx` exporting a default React component.
2. Add a `<Tabs.Screen name="myscreen" options={{ ... }} />` entry in `app/(tabs)/_layout.tsx`.

### Add a new calculation
1. Add a pure function to `src/features/portfolio/calculations.ts`.
2. Export the return type as an interface from the same file.
3. Call it from the relevant screen via `useMemo`.

### Deploy to Vercel
The repo includes `vercel.json`. Push to the connected branch; Vercel auto-builds the static web export and deploys the `api/` functions.

### Run Supabase migration (first-time or new environment)
Open **Supabase Dashboard → SQL Editor** and run the full contents of `supabase/portfolio_snapshots.sql`.

