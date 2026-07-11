# Repository Analysis — Portfolio Tracker

**Analysis Date:** July 11, 2026  
**Project Status:** v1.0.0 released  
**Maturity Level:** Early production (single release, active development ongoing)

---

## Executive Summary

Portfolio Tracker is a **local-first cross-platform portfolio management application** that runs on iOS, Android, and Web via a single Expo TypeScript codebase. The app enables users to track equity holdings across Indian and US exchanges, analyze geographic and sectoral allocation, simulate cash deployment strategies, and monitor allocation drift over time.

**Key Characteristics:**
- **Offline-first architecture** with AsyncStorage as the primary data source
- **Optional cloud sync** via Supabase (degrades gracefully without credentials)
- **Vercel serverless layer** proxies market data APIs to avoid CORS issues on web
- **Rich portfolio analytics** including concentration risk, geographic splits, and sector breakdown
- **Dual-market support** for Indian (NSE/BSE) and US equities with live price fetching

---

## Purpose of the Application

### Core Problem Being Solved

Most portfolio tracking tools force users into either:
1. **Cloud-first architectures** that require constant connectivity and cloud trust
2. **Desktop-only applications** that don't work across devices
3. **Limited analytics** that show holdings but not allocation drift or concentration risk

Portfolio Tracker solves this by providing:
- Immediate offline access to portfolio data stored locally
- Cross-platform consistency without vendor lock-in
- Rich allocation and risk analytics that update in real-time
- Optional cloud sync for multi-device continuity (not required)

### Target Users

1. **Retail equity investors** (primarily India + US)
2. **Portfolio analysts** who care about allocation drift and concentration
3. **Multi-account households** (e.g., individual + family portfolios)
4. **Users prioritizing privacy** (data stays local until explicitly synced)

---

## Core Workflows

### Workflow 1: Portfolio Setup and Holdings Management

**Goal:** Get holdings into the system so analytics can run.

**Flow:**
1. User creates one or more accounts (BROKER, SAVINGS) with a base currency
2. Adds equity holdings with ticker symbol, quantity, and average cost
3. System fetches live market price via `/api/quote` endpoint
4. Holdings are persisted to AsyncStorage immediately
5. Portfolio snapshot is generated and stored with timestamp
6. Optional: Snapshot syncs to cloud after 700ms debounce

**Key Components:**
- `AddHoldingModal.tsx` — ticker search + form
- `holdings.tsx` — CRUD interface with sort/group/filter
- `yahooFinanceService.ts` — market data client
- `portfolioStore.ts` — state mutations

### Workflow 2: Portfolio Analysis and Health Check

**Goal:** Understand allocation risk and opportunity.

**Flow:**
1. User navigates to Dashboard (index.tsx)
2. System computes portfolio totals, geographic split, concentration risk
3. Rules-based health card identifies red flags (high concentration, unbalanced cash, etc.)
4. Donut charts visualize India/US/Cash allocation
5. Top holdings list with gain/loss breakdown
6. User can switch between current-value and invested-value allocation basis

**Key Concepts:**
- **Allocation Basis:** Current market value vs. invested cost (affects % calculations)
- **Geographic Split:** Determined by currency (INR → India, USD → US) or symbol suffix (.NS, .BO → India)
- **Concentration Risk:** HHI (Herfindahl-Hirschman Index) + top-5 concentration
- **Health Rules:** Largest holding > 25%, top-5 > 50%, cash < 5%, India/US imbalance > 70%

**Key Components:**
- `index.tsx` — dashboard orchestration
- `calculations.ts` — all financial math
- `xray.tsx` — sector breakdown + concentration breakdown
- `PortfolioHealthCard.tsx` — rule-based alerts

### Workflow 3: Rebalancing Planning

**Goal:** Decide how to reorient portfolio toward target allocation.

**Flow:**
1. User sets target allocation percentages (India, US, Cash) in RebalancingCard
2. System compares current allocation to targets
3. Shows underweight/overweight/on-target suggestions for each region
4. User reviews suggestions and manually rebalances (no automation)
5. On next holdings update, new snapshot reflects changes

**Key Components:**
- `RebalancingCard.tsx` — target input + rebalancing suggestions
- `calcRebalancingSuggestions()` — computes drift from targets
- `calcPortfolioTotals()` — feeds into calculations

### Workflow 4: Cash Deployment Planning

**Goal:** Decide how to deploy available cash while respecting target allocation.

**Flow:**
1. User opens "Plan Deployment" modal with available cash amount
2. System knows current allocation and target allocation
3. Suggests how to split deployable cash across India, US, and cash reserve
4. **Smart behavior:** Only suggests deploying to underweight buckets; keeps remainder as cash if target reserve is already met
5. User can manually adjust deploy amount and see updated allocation preview

**Key Components:**
- `DeployCashCard.tsx` — summary card on dashboard
- `DeployCashModal.tsx` — planning interface
- `calcDeployCash()` — allocation algorithm with context-aware fallback

### Workflow 5: Historical Tracking and Timeline Export

**Goal:** Monitor portfolio evolution and export timeline data.

**Flow:**
1. Every holdings mutation triggers `buildAllocationSnapshot()` in portfolio store
2. Snapshots are trimmed to retention limit (default 1Y, max 500 items)
3. Timeline screen shows historical charts (total value, gain/loss, allocations)
4. User can filter by time range (1M, 3M, 6M, 1Y, ALL)
5. Monthly review export compares monthly snapshots and identifies changes
6. Export as PNG (via react-native-view-shot) or CSV/JSON (platform-dependent)

**Key Components:**
- `timeline.tsx` — historical visualization + export
- `drift.tsx` — month-over-month changes
- `AllocationSnapshot` type — timestamped portfolio state
- `buildAllocationSnapshot()` — snapshot creation logic

### Workflow 6: Cloud Sync and Multi-Device Continuity (Optional)

**Goal:** Keep local state in sync with cloud for multi-device access.

**Flow:**
1. App initializes Supabase client (skipped if env vars missing)
2. On login: pulls latest cloud snapshot and compares timestamps
3. If remote is newer: overwrites local state (merge not implemented)
4. Every portfolio mutation: schedules debounced push (700ms delay)
5. Cloud sync persists one JSON blob per user in `portfolio_snapshots` table
6. Logout clears session; next login pulls fresh snapshot

**Key Components:**
- `PortfolioCloudSyncBootstrap.tsx` — renderless sync orchestrator
- `cloudSyncService.ts` — push/pull operations
- `cloudSnapshot.ts` — serialization/deserialization
- Supabase `portfolio_snapshots` table (single row per user)

---

## Architecture Overview

### High-Level Dataflow

```
┌─ Browser / Mobile App (Expo + React Native) ─────────────────────────┐
│                                                                        │
│  Screen Components (holdings.tsx, index.tsx, etc.)                   │
│          ↓ (dispatch actions)                                        │
│  PortfolioStore (Zustand + AsyncStorage)                             │
│          ├─ holdings[], accounts[], cashHoldings[]                   │
│          ├─ allocationSnapshots[] (historical)                       │
│          ├─ settings (allocation basis, reporting currency, etc.)    │
│          └─ fxRates (USDINR exchange rate)                           │
│          ↓ (on mutation)                                             │
│  AsyncStorage (persisted)                                            │
│          ↓ (subscribe)                                               │
│  PortfolioCloudSyncBootstrap (renderless)                            │
│          ├─ debounced push → Supabase (700ms)                        │
│          └─ on login → fetch latest snapshot                         │
│                                                                        │
│  yahooFinanceService (client)                                        │
│          ├─ (on web) → /api/quote → Vercel edge function            │
│          ├─ (on native) → Yahoo Finance direct                       │
│          └─ in-memory cache (20 min TTL)                             │
└────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ Vercel Serverless Layer ───────────────────────────────────────────────┐
│                                                                          │
│  /api/quote                  /api/search                               │
│  ├─ Cache (LRU, 20 min)      ├─ Cache (LRU, 20 min)                   │
│  ├─ Yahoo Finance (retry)    ├─ Yahoo Finance                         │
│  ├─ Finnhub fallback         └─ Parse + respond                       │
│  └─ Respond (Cache-Control)                                           │
└────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ Upstream APIs ─────────────────────────────────────────────────────────┐
│                                                                          │
│  Yahoo Finance                 Finnhub                                 │
│  ├─ /v7/finance/quote         ├─ Used only as fallback                │
│  ├─ /v1/finance/search        └─ Handles US + some Indian symbols    │
│  └─ Dual endpoints                                                     │
└────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ Optional: Supabase Cloud ──────────────────────────────────────────────┐
│                                                                          │
│  Postgres Database                                                     │
│  ├─ portfolio_snapshots table                                          │
│  │  ├─ user_id (FK → auth.users)                                     │
│  │  ├─ portfolio_json (JSONB)                                         │
│  │  ├─ created_at, updated_at                                         │
│  │  └─ RLS policies (user-scoped)                                     │
│  │                                                                      │
│  └─ Auth                                                               │
│     ├─ Email/password signup                                          │
│     └─ Session restoration                                            │
└────────────────────────────────────────────────────────────────────────┘
```

### Major Modules and Responsibilities

| Module | Path | Responsibility |
|--------|------|-----------------|
| **Store** | `src/store/portfolioStore.ts` | Central state for holdings, accounts, cash, settings, snapshots; mutations trigger AsyncStorage persist and cloud sync |
| **Auth Store** | `src/store/authStore.ts` | Manages auth session, user, loading state; initializes on app mount; optionally persists with Supabase |
| **Calculations** | `src/features/portfolio/calculations.ts` | All financial math: portfolio totals, allocations, concentration, rebalancing, deploy-cash logic |
| **Market Data Service** | `src/services/yahooFinanceService.ts` | Client-side market data fetching with caching; routes through `/api/quote` on web or direct on native |
| **Cloud Sync Bootstrap** | `src/features/portfolio/PortfolioCloudSyncBootstrap.tsx` | Renderless component handling login sync pull, mutation debouncing, and push scheduling |
| **Cloud Sync Service** | `src/features/portfolio/cloudSyncService.ts` | Low-level Supabase operations: push and pull snapshots |
| **Cloud Snapshot** | `src/features/portfolio/cloudSnapshot.ts` | Serialization/deserialization for cloud snapshots; schema versioning |
| **Components** | `src/components/` | Reusable UI: DonutChart, HoldingRow, RebalancingCard, DeployCashModal, etc. |
| **Screens (Tabs)** | `app/(tabs)/` | Main app screens: holdings, dashboard, X-Ray, drift, timeline, accounts, settings |
| **Auth Screens** | `app/(auth)/` | Login and signup |
| **Vercel Proxy** | `api/quote.ts`, `api/search.ts` | Edge functions that proxy market data, add caching, and handle CORS |

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Expo SDK 53 | Cross-platform build tool; handles iOS/Android/Web builds |
| **Routing** | Expo Router v4 | File-based routing (file = route) |
| **UI Runtime** | React Native 0.76 | Cross-platform UI layer |
| **Web Build** | Metro bundler (static output) | Compiles to static HTML/JS for web |
| **State Management** | Zustand v5 + AsyncStorage | Local-first state with automatic persistence |
| **Auth** | Supabase JS SDK v2 | Email/password auth + session management (optional) |
| **Cloud DB** | Supabase Postgres | Single table for per-user portfolio snapshots |
| **Styling** | React Native StyleSheet + theme tokens | No CSS; all styles via JS |
| **Charts** | react-native-svg + custom TimeSeriesChart | Donut and line charts |
| **File I/O** | expo-file-system, expo-sharing, expo-document-picker | Export/import on mobile; DOM anchor on web |
| **Screenshots** | react-native-view-shot | PNG export of charts |
| **Animations** | react-native-reanimated | Smooth transitions (present but minimal use) |
| **Language** | TypeScript 5.7 (strict mode) | Type safety throughout |

---

## Important Dependencies

### Runtime
- **@supabase/supabase-js** ^2.49.8 — Cloud auth + database
- **zustand** ^5.0.0 — State management
- **@react-native-async-storage/async-storage** ^1.23.1 — Local persistence
- **react-native-svg** 15.11.2 — SVG rendering for charts
- **react-native-reanimated** ~3.16.1 — Animation library (minimal usage)
- **expo-file-system**, **expo-document-picker**, **expo-sharing** — File I/O
- **react-native-view-shot** ^3.8.0 — Screenshot for PNG export

### Development
- **TypeScript** ^5.7.3 — Type checking
- **Metro** 0.81.5 — Bundler

### Critical Notes
- **Zero CSS frameworks** — all styling via `StyleSheet.create()`
- **No UI component libraries** — all components built custom
- **Minimal external dependencies** — favors built-in Expo APIs
- **No ORM** — Supabase data is a single JSON blob, no migration/schema tooling needed client-side

---

## Data Flow Analysis

### State Model

```typescript
// Top-level store state (portfolioStore.ts)
{
  // Entities
  accounts: Account[]              // BROKER, SAVINGS; base currency
  holdings: Holding[]              // Symbol, quantity, avg price, market price
  cashHoldings: CashHolding[]      // Currency + balance per account
  
  // Historical snapshots
  allocationSnapshots: AllocationSnapshot[]  // Timestamped portfolio state
  driftSnapshots: AllocationSnapshot[]       // Monthly summaries for drift tracking
  
  // Settings
  settings: PortfolioSettings      // Reporting currency, allocation basis, etc.
  fxRates: FxRates                 // { USDINR: number }
  targetAllocation: TargetAllocation  // User-defined target %, optional
  
  // Metadata
  hydrated: boolean                // Whether AsyncStorage has loaded
  snapshotUpdatedAt: string        // ISO timestamp of last mutation
  
  // Methods
  addAccount(), addHolding(), addCashHolding(), ...  // Mutations
  getSnapshot(): PortfolioSnapshotData               // Export for cloud
  setFromSnapshot(): void                            // Import from cloud
}

// Key types
Account {
  id: string
  name: string
  owner: string
  broker: string
  type: "BROKER" | "SAVINGS"
  baseCurrency: "INR" | "USD"
}

Holding {
  id: string
  accountId: string
  symbol: string              // e.g., AAPL, RELIANCE, RELIANCE.NS
  companyName: string
  quantity: number
  averagePrice: number
  marketPrice: number         // Last known price; updated on live fetch
  currency: "INR" | "USD"
  updatedAt: string
}

AllocationSnapshot {
  date: string                // ISO timestamp
  totalPortfolioValue: number
  investedValue: number       // Sum of all costs
  gainLoss: number
  indiaAllocationPct: number
  usAllocationPct: number
  cashAllocationPct: number
  topHoldings: [
    {
      symbol: string
      allocationPct: number
      currentValue: number
      investedValue: number
      gainLossPct: number
    }
  ]
}
```

### Mutation Flows

**Adding a holding:**
1. User submits form in AddHoldingModal
2. `portfolioStore.addHolding(holding)` is called
3. Zustand `set()` updates state (immutable)
4. `persist` middleware auto-saves to AsyncStorage
5. `buildAllocationSnapshot()` is called to capture state at that moment
6. Snapshot is appended to store (trimmed if over limit)
7. `snapshotUpdatedAt` is updated to current ISO time
8. PortfolioCloudSyncBootstrap notices subscription and schedules a debounced push (700ms)

**Fetching live prices:**
1. User navigates to Holdings screen
2. `useEffect` calls `yahooFinanceService.fetchLivePrices(symbols)`
3. Service checks in-memory cache (20 min TTL)
4. If cache miss:
   - On web: routes to `/api/quote?symbols=AAPL,RELIANCE.NS`
   - On native: calls Yahoo Finance directly if `EXPO_PUBLIC_API_BASE_URL` unset
5. Vercel edge function:
   - Checks server-side cache
   - Calls Yahoo Finance /v7/finance/quote
   - Falls back to Finnhub if some symbols fail and `FINNHUB_API_KEY` is set
   - Returns cache-control headers
6. Client receives payload, updates local cache, dispatches to screen
7. Screen calls `resolveMarketPrice(holding, cache)` to get live price for calculations

**Cloud sync on login:**
1. User logs in with email/password
2. `authStore.initialize()` calls `getInitialSession()` from Supabase
3. On successful session, PortfolioCloudSyncBootstrap notices userId change
4. Calls `fetchLatestSnapshot(userId)` via Supabase
5. Compares remote `updated_at` to local `snapshotUpdatedAt`
6. If remote is newer: `setFromSnapshot()` overwrites local state
7. If local is never: pulls data even if remote is older

---

## State Management Analysis

### Zustand Configuration

**Pattern:**
- Single `usePortfolioStore` created with `persist` middleware
- Stores to AsyncStorage with key `portfolio-store`
- Auto-rehydrates on app mount
- **No manual save calls** — mutations are persisted automatically

**Selectors:**
- Screens use individual selectors: `usePortfolioStore((s) => s.holdings)`
- **Not subscribed to whole store** (avoids unnecessary re-renders)
- Calculation functions are pure (called with selected data)

**Auth Store:**
- Separate `useAuthStore` for session/user/error
- Manages Supabase auth state subscription
- On logout: `signOut()` triggers Supabase signout

### Subscription and Syncing

**PortfolioCloudSyncBootstrap:**
- Mounted in root layout as renderless component
- Subscribes to portfolio store mutations via `usePortfolioStore.subscribe()`
- On mutation: sets `pendingPushRef.current = true` and schedules push after 700ms
- Prevents rapid successive pushes (e.g., bulk import would coalesce into one push)
- On login: pulls snapshot, compares timestamps, applies if remote is newer

**Anti-Pattern Prevention:**
- Store subscriptions never use whole-store `get()` — only selective getters
- Actions are synchronous (no async inside Zustand)
- Cloud operations happen outside store (in Bootstrap component)

---

## Storage and Persistence Analysis

### AsyncStorage (Local)

**What's Stored:**
- Entire portfolio state (holdings, accounts, cash, settings, snapshots)
- Auto-persisted on every mutation via Zustand `persist` middleware
- Keys: `portfolio-store` (main), `auth-store` (separate)

**Limitations:**
- Single-user per device (no account switching)
- No encryption (data in plaintext on device)
- Size limits per platform (iOS ~10MB, Android varies, Web ~5MB per origin)

**Retention:**
- Allocation snapshots are trimmed to:
  - Hard limit: 500 items max
  - Soft limit: based on `settings.timelineRetention` (default 1Y, can be 6M/2Y/ALL)

### Supabase Cloud (Optional)

**What's Stored:**
- One row per user in `portfolio_snapshots` table
- Entire portfolio state as JSONB blob
- Created/updated timestamps for sync logic
- No field-level encryption

**Sync Model:**
- **Last-write-wins** (remote timestamp > local timestamp)
- No merge/conflict resolution
- On login pull: if remote is newer, replaces local entirely
- On every mutation push: sends entire snapshot (idempotent upsert)

**RLS (Row-Level Security):**
- Four policies: SELECT, INSERT, UPDATE, DELETE own rows only
- Users cannot see other users' data

**Limitations:**
- Not a real-time sync system (eventual consistency)
- No offline-first merge strategy
- If user is logged in on two devices simultaneously, last-write wins (no merge)

---

## API and Integration Analysis

### Yahoo Finance Proxy (`/api/quote`)

**Endpoint:** `GET /api/quote?symbols=AAPL,MSFT,RELIANCE.NS`

**Server Logic:**
1. Validates and normalizes symbols (max 50, reject invalid patterns)
2. Checks LRU cache (20 min TTL, max 500 entries)
3. If cache hit: return with `X-Cache: HIT`
4. If miss: fetch from Yahoo Finance with retry logic
5. Attempt Yahoo Query endpoint 1 → retry delay → attempt Query endpoint 2
6. On all failures: attempt Finnhub as fallback (if `FINNHUB_API_KEY` set)
7. Returns Yahoo-compatible response format (normalized)
8. Sets `Cache-Control: public, s-maxage=1200, stale-while-revalidate=600` for edge caching

**Response Format:**
```json
{
  "quoteResponse": {
    "result": [
      {
        "symbol": "AAPL",
        "regularMarketPrice": 198.4,
        "regularMarketTime": 1689123456,
        "currency": "USD",
        "exchange": "NASDAQ",
        "fullExchangeName": "NasdaqGS"
      }
    ]
  }
}
```

**Limitations Observed (from user session):**
- Indian equity fetching has been problematic (HTTP 404, 429)
- Finnhub fallback is inconsistent for Indian symbols
- No dedicated Indian equity provider is currently integrated
- Recent user reports show all Indian symbols returning no data

### Yahoo Finance Search (`/api/search`)

**Endpoint:** `GET /api/search?q=apple`

**Logic:**
- Proxies to Yahoo Finance `/v1/finance/search`
- Client-side cache (20 min TTL)
- Returns search suggestions

---

## Existing Engineering Conventions

### TypeScript

**Strict Mode:** Enabled in `tsconfig.json`
- No `any` (use `unknown` then narrow)
- Implicit `any` is error
- Null checking required

**Type Patterns:**
- **Discriminated unions** for service results:
  ```typescript
  type ServiceResult<T> = { ok: true; data: T; ... } | { ok: false; error: ServiceError; ... }
  ```
- **Type imports:** `import type { Foo }` (isolates type-only imports)
- **Enums rarely used** — prefer unions: `"INR" | "USD"` instead of enum

### React Components

**Pattern:**
- Functional components only (no class components)
- Local state via `useState` for UI state
- Complex calculations via `useMemo` with dependency arrays
- Props passed explicitly; minimal prop drilling
- No custom hooks library (each component self-contained)

**Styling:**
- All styles via `StyleSheet.create({ ... })`
- No inline styles
- No CSS frameworks (Bootstrap, Tailwind, NativeWind removed)
- Theme tokens imported from `src/theme/index.ts`

**Screen Organization:**
- Screen files (`app/(tabs)/*.tsx`) are "thick" — they own:
  - Local state (filters, modals, sort orders)
  - Derived state (filtered/sorted lists)
  - Modal orchestration
- But delegate all financial calculations to `calculations.ts`

### Styling and Theme

**Token System:**
```typescript
// src/theme/index.ts
export const colors = {
  bg: "#0B0C10",           // background
  surface: "#14161A",      // cards, input backgrounds
  text: "#F2F4F8",         // primary text
  muted: "#9CA3AF",        // secondary text
  accent: "#67E8F9",       // highlights, active states
  positive: "#22C55E",     // gains, success
  negative: "#EF4444",     // losses, errors
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32
};

export const typography = {
  title: { fontSize: 28, fontWeight: "700" },
  heading: { fontSize: 22, fontWeight: "600" },
  body: { fontSize: 14, fontWeight: "400" },
  // ...
};
```

**Dark Theme Only:**
- No light mode
- Background: `#0B0C10` (very dark navy)
- Surface: `#14161A` (slightly lighter for contrast)

### ID Generation

**Pattern:**
```typescript
// Accounts: acc-{timestamp}-{random}
`acc-${Date.now()}-${Math.floor(Math.random() * 1000)}`

// Holdings: h-{timestamp}-{random}
`h-${Date.now()}-${Math.floor(Math.random() * 1000)}`

// Cash: cash-{timestamp}-{random}
`cash-${Date.now()}-${Math.floor(Math.random() * 1000)}`
```

**Why:** Client-side generation avoids server round-trips; timestamp + random ensures collision resistance.

### Timestamps

**Pattern:** ISO 8601 strings
```typescript
new Date().toISOString()  // "2026-07-11T14:30:45.123Z"
```

**Updated Everywhere:**
- `snapshotUpdatedAt` is updated on every store mutation
- Cloud sync uses this timestamp to determine latest version

### Geographic Classification

**Rule:**
- India: `currency === "INR"` OR `symbol.endsWith(".NS")` OR `symbol.endsWith(".BO")`
- US: everything else

**Used For:**
- Portfolio allocation pie charts (India/US/Cash)
- Rebalancing suggestions (India target vs. US target)
- X-Ray sector breakdown (separate for India/US)
- Drift tracking (month-over-month India/US/Cash changes)

---

## Technical Debt Observations

### 1. **Indian Equity Market Data Integration (CRITICAL)**

**Observation:**
- User reports indicate Indian equity symbols consistently fail to fetch (HTTP 404, 429)
- Server logs show Yahoo Finance and Finnhub both returning errors for .NS symbols
- NSE API attempts appear to fail silently (no debug data in recent session)
- No dedicated Indian market data provider currently integrated

**Impact:**
- Portfolio tracker is unusable for primarily Indian portfolios
- Live prices don't update for Indian equities
- Allocation calculations fall back to stored `marketPrice` (stale)

**Recommendation:**
- Integrate **NSE direct API** (if available) or switch to dedicated Indian equity provider
- Consider **FINNHUB's NSE support** if properly configured
- Add comprehensive error logging/debugging headers to understand failure modes
- Test with batch requests (currently batch size 50; user found it fails at larger batches)

### 2. **Cloud Sync: Last-Write-Wins Is Fragile**

**Observation:**
- No merge logic between local and remote
- If user is logged into multiple devices, last sync wins
- No conflict UI or user guidance when overwrite happens

**Impact:**
- Data loss risk if user updates portfolio on two devices simultaneously
- Unexpected overwrites without user awareness

**Recommendations:**
- Display merge conflict UI when remote is newer but local has unsaved changes
- Consider per-field sync (more complex but safer)
- Document the limitation in auth screen

### 3. **Allocation Snapshots Cause Large State Objects**

**Observation:**
- `allocationSnapshots` can grow large (500 items max, but each is ~1-2KB)
- Every mutation creates a new snapshot
- Cloud sync sends entire portfolio blob on each change
- No compression or delta encoding

**Impact:**
- AsyncStorage and Supabase rows grow over time
- Network payload increases with portfolio history
- May hit storage limits on devices with many snapshots

**Recommendations:**
- Consider archiving old snapshots separately
- Implement delta encoding for cloud sync (send only changes)
- Add data export/cleanup tools

### 4. **Market Data API Reliability**

**Observation:**
- Yahoo Finance has two query endpoints (query1, query2) for redundancy
- Finnhub used as fallback, but only when enabled and has API key
- No monitoring/alerting for upstream failures
- Retry logic times out after 8 seconds; user experiences blank prices

**Impact:**
- Users see stale prices when upstream is down
- No user feedback on why prices didn't update
- Fallback is inconsistent

**Recommendations:**
- Add more robust error handling and user feedback
- Consider third-party data provider with better uptime guarantee
- Implement better caching strategy (serve stale data with "stale" badge)

### 5. **No Testing Infrastructure**

**Observation:**
- No test files in repository
- All development workflows are manual (run app in simulator/browser)
- Financial calculations are not unit tested

**Impact:**
- Regression risk on calculation changes
- QA burden falls on manual testing
- Hard to debug allocation math without tests

**Recommendations:**
- Add Jest unit tests for `calculations.ts` (pure functions, easy to test)
- Add integration tests for store mutations
- Set up CI/CD for type checking + tests

### 6. **Limited Mobile-Specific Optimizations**

**Observation:**
- No pagination for large holding lists (all rendered)
- Large allocation snapshots loaded into memory
- No virtualization for timeline charts
- Web and native use same performance model

**Impact:**
- Slow performance on older devices or very large portfolios
- Timeline screen with many snapshots may lag

**Recommendations:**
- Implement FlatList virtualization for holdings
- Add pagination or infinite scroll for snapshots
- Consider React.memo on expensive components

### 7. **Error Handling Is Minimal**

**Observation:**
- API failures show generic errors (no retry UI)
- Cloud sync errors are silent (logs only, no user feedback)
- Market data errors don't distinguish "no data" from "network error"

**Impact:**
- Users don't know why something failed
- No recovery UI for temporary failures

**Recommendations:**
- Add snackbar notifications for sync errors
- Implement "Retry" buttons for market data failures
- Log all errors to a monitoring service (e.g., Sentry)

---

## Product Observations

### What's Working Well

1. **Local-first reliability** — app starts instantly offline
2. **Multi-market support** — dual India/US tracking is novel for retail
3. **Allocation analysis depth** — concentration, drift, deployment planning are sophisticated
4. **Clean UI/UX** — dark theme is cohesive; no framework bloat
5. **Optional cloud sync** — degrades gracefully without Supabase
6. **Cross-platform build** — single codebase for iOS/Android/Web is efficient

### Feature Creep Risk

**Observable:**
- Dashboard has many cards (health, rebalancing, deployment, donut, top holdings)
- Many modals and sub-screens
- X-Ray screen has multiple breakdowns (sector, concentration, geography)
- Drift tracking with monthly reviews
- Timeline with multiple export formats

**Risk:**
- Feature surface area is growing faster than QA can keep up
- Each screen has complex state management
- Navigation is deep (3-4 levels in some flows)

**Mitigation:**
- Prioritize core workflows (holdings, allocation, rebalancing)
- Consider deprecating less-used features (e.g., drift tracking)
- Simplify dashboard UI (collapsible sections)

### Experimental/Unfinished Functionality

**Observation:**
- Cloud sync works but is marked as optional
- Import/export JSON is present but platform-dependent
- Monthly review feature exists but is rarely used
- Sector classification uses hardcoded map (not sourced)

**Recommendation:**
- Cloud sync could be more polished (conflict UI, better error handling)
- Consider making import/export more prominent (useful for data portability)
- Monthly review is useful but could integrate into dashboard as a card

---

## Risks and Concerns

### Security

1. **No encryption on device** — portfolio data is plaintext in AsyncStorage
   - **Risk:** If device is compromised, attacker sees full portfolio
   - **Mitigation:** Add optional device-level encryption (iOS Keychain, Android Keystore)

2. **API keys in Vercel env** — `FINNHUB_API_KEY` is server-side only
   - **Risk:** If Vercel deployment is compromised, attacker has API quota
   - **Mitigation:** Rotate keys regularly; monitor usage

3. **Supabase RLS policies** — assumed to be correct but not audited
   - **Risk:** Users could potentially see others' data if RLS is misconfigured
   - **Mitigation:** Add automated tests for RLS policies

### Scalability

1. **Single-row cloud model** — entire portfolio in one JSONB blob
   - **Risk:** Large portfolios (1000+ holdings) have slow sync
   - **Mitigation:** Split data model (portfolio + holdings as separate rows) if needed

2. **Vercel function cold starts** — `/api/quote` may be slow on first call after inactivity
   - **Risk:** Users see stale prices after periods of non-use
   - **Mitigation:** Keep functions warm with periodic pings

### Market Data

1. **Yahoo Finance not guaranteed for Indian equities** — observed failures
   - **Risk:** Core feature (live prices) doesn't work for primary market (India)
   - **Mitigation:** Switch to NSE API or dedicated Indian provider

2. **No fallback for market closures** — stocks return `0` on market close
   - **Risk:** Users think prices are outdated when market is closed
   - **Mitigation:** Add "market closed" indicator based on timestamp

---

## Recommendations

### High Priority

1. **Fix Indian equity price fetching**
   - Integrate NSE direct API or switch provider
   - Add comprehensive error logging to understand current failures
   - Test with real Indian brokers' symbols

2. **Add basic error recovery UI**
   - Retry buttons for failed price fetches
   - Snackbar notifications for cloud sync errors
   - "Stale price" badge when last update > 1 hour ago

3. **Improve cloud sync UX**
   - Add merge conflict UI for multi-device scenarios
   - Show sync status (syncing, synced, error)
   - Allow manual force-sync

### Medium Priority

4. **Add testing infrastructure**
   - Unit tests for `calculations.ts`
   - Integration tests for portfolio store
   - CI/CD pipeline for type checking + tests

5. **Performance optimization**
   - Virtualize large holding lists
   - Paginate or infinite-scroll allocation snapshots
   - Implement React.memo on expensive components

6. **Improve error logging**
   - Send errors to Sentry or similar
   - Add breadcrumb trails for debugging
   - Better user-facing error messages

### Low Priority

7. **Enhance onboarding**
   - Tutorial for first-time users
   - Sample portfolios to explore

8. **Consider mobile-specific improvements**
   - Home screen widgets (iOS, Android)
   - Push notifications for major allocation changes
   - Biometric auth

---

## Summary

Portfolio Tracker is a well-architected, local-first portfolio management application with solid fundamentals:
- Clean separation of concerns (store, calculations, services, components)
- Strong TypeScript conventions and type safety
- Thoughtful allocation analytics (concentration, drift, deployment planning)
- Optional cloud sync that doesn't compromise offline-first guarantee

**Key limitations:**
- Indian equity market data integration is broken (critical)
- Cloud sync lacks conflict resolution (fragile for multi-device)
- No testing infrastructure
- Performance not optimized for large portfolios

**Maturity assessment:** v1.0.0 is production-ready for US-only portfolios or India-only portfolios (if using cached prices). Multi-market support is blocked by Indian equity price fetching issues. Investment in market data reliability and cloud sync robustness would significantly improve stability.

