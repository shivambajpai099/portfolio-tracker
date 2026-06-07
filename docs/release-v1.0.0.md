# Portfolio Tracker - Product Release Document (v1.0.0)

Generated from repository inspection on 2026-06-07.

---

## Product Overview

Portfolio Tracker is a cross-platform Expo app (iOS, Android, Web) for local-first portfolio management with optional Supabase authentication and cloud snapshot sync.

Implemented architecture and major modules:

- UI/navigation: Expo Router (`app/` routes)
- State/persistence: Zustand + AsyncStorage (`src/store/portfolioStore.ts`)
- Auth: Supabase email/password (`src/store/authStore.ts`, `src/features/auth/*`)
- Market data: Vercel serverless proxy endpoints (`api/search.ts`, `api/quote.ts`) consumed by app services (`src/services/yahooFinanceService.ts`)
- Cloud sync: per-user JSON snapshot in Supabase (`src/features/portfolio/cloudSyncService.ts`, `supabase/portfolio_snapshots.sql`)

---

## Core Value Proposition

The app helps users understand portfolio composition, risk concentration, and allocation drift while staying usable offline.

It combines:

- Local-first reliability (immediate startup from local state)
- Rich allocation and risk analysis
- Actionable rebalancing/deploy-cash guidance
- Historical drift/timeline/monthly review outputs
- Optional cloud continuity across devices

---

## Feature Inventory

### 1) Authentication (Email/Password)

**Description:**
Supabase-backed signup, login, logout, and session restoration with auth-state subscription.

**User Benefit:**
Secured access and user-scoped cloud data.

**Key Screens Involved:**

- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`
- `app/(auth)/_layout.tsx`
- `app/(tabs)/_layout.tsx` (auth gate)

### 2) Local-First Portfolio Persistence

**Description:**
Portfolio state is persisted via Zustand `persist` middleware and rehydrated on launch.

**User Benefit:**
Offline access and fast startup without network dependency.

**Key Screens Involved:**

- All tabs rely on `src/store/portfolioStore.ts`

### 3) Account Management (BROKER + SAVINGS)

**Description:**
Create/edit/delete accounts with account type and currency controls. Savings account creation supports initial cash balance.

**User Benefit:**
Supports both investment and cash-focused account structures.

**Key Screens Involved:**

- `app/(tabs)/accounts.tsx`

### 4) Cash Balance Management

**Description:**
Cash holdings can be added per account/currency, edited inline, and removed.

**User Benefit:**
Accurate net worth and allocation denominator handling.

**Key Screens Involved:**

- `app/(tabs)/accounts.tsx`

### 5) Holdings CRUD + Live Quote Refresh

**Description:**
Add/edit/delete holdings, with ticker search and current market price retrieval.

**User Benefit:**
Faster position entry and current valuation updates.

**Key Screens Involved:**

- `app/(tabs)/holdings.tsx`
- `src/components/AddHoldingModal.tsx`

### 6) Holdings Grouping/Filtering/Sorting

**Description:**
Group by stock/account/country/asset type. Sort by value/allocation/gain/alphabetical and filter by currency/performance.

**User Benefit:**
Improved portfolio exploration and diagnostics.

**Key Screens Involved:**

- `app/(tabs)/holdings.tsx`

### 7) Allocation Basis + Cash Inclusion Controls

**Description:**
Allocation can be computed by current value or invested value, with cash include/exclude toggle.

**User Benefit:**
Multiple analytic lenses for risk vs cost-basis decisions.

**Key Screens Involved:**

- `app/(tabs)/index.tsx`
- `app/(tabs)/holdings.tsx`
- `app/(tabs)/settings.tsx`

### 8) Dashboard Overview

**Description:**
Total/invested summary, geographic split, concentration cues, allocation donut, and ranked allocation list.

**User Benefit:**
Single-screen health check for portfolio distribution.

**Key Screens Involved:**

- `app/(tabs)/index.tsx`

### 9) Portfolio Health Card

**Description:**
Rule-based health insights (largest holding, top-5 concentration, position count, cash mix, India/US mix) with severity coloring.

**User Benefit:**
Plain-language interpretation of concentration risk.

**Key Screens Involved:**

- `app/(tabs)/index.tsx`
- `src/components/PortfolioHealthCard.tsx`

### 10) Rebalancing Suggestions

**Description:**
Users define target allocation (India/US/Cash). App computes overweight/underweight and amount deltas.

**User Benefit:**
Actionable rebalancing without spreadsheet math.

**Key Screens Involved:**

- `app/(tabs)/index.tsx`
- `src/components/RebalancingCard.tsx`

### 11) Deploy Cash Planner

**Description:**
Splits user-entered cash-to-deploy across India/US/Cash based on target weights and displays percentages + bars.

**User Benefit:**
Guidance for deploying available cash in target proportions.

**Key Screens Involved:**

- `app/(tabs)/index.tsx`
- `src/components/DeployCashCard.tsx`

### 12) Portfolio X-Ray

**Description:**
Risk-focused screen showing concentration metrics, country allocation, sector allocation, cash allocation, and insight text.

**User Benefit:**
At-a-glance risk diagnostics beyond basic P/L.

**Key Screens Involved:**

- `app/(tabs)/xray.tsx`

### 13) Portfolio Drift

**Description:**
Compares latest snapshot against 1/3/6 month baselines for US/India/Cash deltas and top-holding drift.

**User Benefit:**
Detects silent allocation drift over time.

**Key Screens Involved:**

- `app/(tabs)/drift.tsx`

### 14) Portfolio Timeline

**Description:**
Interactive time-series charts for total value, invested value, and gain/loss with 1M/3M/6M/1Y/All filters.

**User Benefit:**
Historical trend visibility and period-over-period perspective.

**Key Screens Involved:**

- `app/(tabs)/timeline.tsx`
- `src/components/TimeSeriesChart.tsx`

### 15) Monthly Portfolio Review + Image Export

**Description:**
Month-level summary card with value/capital/performance decomposition and best/worst/largest holding insights. Export to image for sharing.

**User Benefit:**
Readable monthly review artifact suitable for sharing and journaling.

**Key Screens Involved:**

- `app/(tabs)/timeline.tsx`

### 16) JSON Import/Export Backup

**Description:**
Export full portfolio JSON and restore from file via document picker/file APIs.

**User Benefit:**
Data portability and backup/recovery.

**Key Screens Involved:**

- `app/(tabs)/settings.tsx`

### 17) Cloud Snapshot Sync (Supabase)

**Description:**
Per-user JSON snapshot upsert with local-first boot, background pull/push, debounced writes, and retry loop.

**User Benefit:**
Cross-device continuity while preserving offline-first behavior.

**Key Screens Involved:**

- Global bootstrap: `app/_layout.tsx` -> `src/features/portfolio/PortfolioCloudSyncBootstrap.tsx`

### 18) Serverless Market Data Proxy

**Description:**
Frontend uses internal `/api/search` and `/api/quote` endpoints instead of direct Yahoo calls. Includes caching and failover behavior.

**User Benefit:**
More stable market data access (CORS/403 mitigation).

**Key Screens Involved:**

- `src/services/yahooFinanceService.ts`
- `api/search.ts`
- `api/quote.ts`

### 19) In-App Portfolio Guide

**Description:**
Help modal explains metrics, allocation filters, and holding entry conventions.

**User Benefit:**
Lower onboarding friction for new users.

**Key Screens Involved:**

- `src/components/PortfolioGuideModal.tsx`
- opened from `app/(tabs)/index.tsx`, `src/components/AddHoldingModal.tsx`, `app/(tabs)/settings.tsx`

---

## User Workflows

### Workflow A - Authentication

1. Launch app -> `app/_layout.tsx` initializes auth store.
2. If no session -> routed to `/(auth)/login`.
3. Signup available via `/(auth)/signup`.
4. On success, redirect to tab stack.

### Workflow B - Initial Portfolio Setup

1. Open `Accounts`.
2. Add account (`BROKER` or `SAVINGS`).
3. If savings, set initial cash.
4. Add additional cash rows as needed (INR/USD).

### Workflow C - Add and Maintain Holdings

1. Open `Holdings` -> tap Add.
2. Search ticker and select suggestion.
3. Enter quantity + average price.
4. Save holding (market price from quote, fallback to avg price).
5. Edit/delete holdings from expanded lot rows.

### Workflow D - Allocation and Rebalancing

1. Open `Overview`.
2. Toggle allocation basis and cash inclusion.
3. Set target India/US/Cash values.
4. Read rebalancing guidance and deploy-cash suggestion bars.

### Workflow E - Risk and Trend Monitoring

1. Open `X-Ray` for concentration/country/sector diagnostics.
2. Open `Drift` for 1/3/6 month movement statements.
3. Open `Timeline` for charted performance and monthly review.

### Workflow F - Reporting and Backup

1. In `Timeline`, choose month -> review summary card.
2. Export review card as image.
3. In `Settings`, export/import full portfolio JSON.

### Workflow G - Cloud Sync Lifecycle

1. Local state hydrates first.
2. Cloud bootstrap fetches remote snapshot for authenticated user.
3. Newer remote can replace local; local changes schedule debounced pushes.
4. Pending pushes retry periodically.

---

## Data Model Summary

### Portfolio State (store)

`PortfolioState` includes:

- `accounts: Account[]`
- `holdings: Holding[]`
- `cashHoldings: CashHolding[]`
- `allocationSnapshots: AllocationSnapshot[]`
- `settings: PortfolioSettings`
- `fxRates: FxRates`
- `snapshotUpdatedAt`

### Account

- `type`: `BROKER` | `SAVINGS`
- `baseCurrency`: `INR` | `USD`
- metadata: name/owner/broker + timestamps

### Holding

- Symbol/company/account association
- Quantity, average cost, market price, currency

### Cash Position

- Per account + currency cash balance

### Allocation Snapshot

- date
- total portfolio value
- invested value
- gain/loss
- India/US/Cash allocation percentages
- top 10 holdings with allocation and performance fields

### Settings/Preferences

- Reporting currency
- Allocation basis
- Cash inclusion toggle
- Onboarding guide viewed flag
- Target allocation (India/US/Cash)
- Timeline retention (`6M`, `1Y`, `2Y`, `ALL`)

### Cloud Snapshot Payload

- schema versioned payload (`PortfolioSnapshotPayload`)
- full portfolio JSON blob stored in Supabase row per user

---

## Calculations and Analytics

### FX Conversion

- `toINR`, `toUSD`, `convert`

### Holding Metrics

- `holdingCost = quantity * averagePrice`
- `holdingMarketValue = quantity * resolvedMarketPrice`
- `holdingGainLoss = marketValue - cost`
- `holdingGainLossPct = gainLoss / cost * 100`

### Portfolio Totals

- `currentValue = sum(holdingMarketValue) + sum(cash)`
- `investedValue = sum(holdingCost) + sum(cash)`
- `gainLoss = currentValue - investedValue`
- `gainLossPct = gainLoss / investedValue * 100`

### Allocation %

Per symbol:

- numerator = current or invested (based on setting)
- denominator = holdings total + optional cash total
- `allocationPct = numerator / denominator * 100`

### Geographic Split

- India detection by INR or `.NS`/`.BO`
- India/US percentages from equity values

### Concentration Risk

- HHI = sum of squared allocation percentages
- risk levels: LOW/MODERATE/HIGH
- includes top holding % and top 5 %

### Rebalancing

Per region (India/US/Cash):

- `currentPct = regionValue / totalValue * 100`
- `diffPct = currentPct - targetPct`
- `diffValue = diffPct / 100 * totalValue`
- direction threshold at ±1 pct point

### Deploy Cash

- Normalize target percentages
- `sliceAmount = normalizedPct * deployAmount`

### Drift Snapshoting

On holding/cash changes, store point-in-time values and top holdings for historical comparison.

### Timeline Metrics

- series: total value, invested value, gain/loss
- range filtering: 1M, 3M, 6M, 1Y, All

### Monthly Review Metrics

For month start/end snapshots:

- portfolio value change
- net capital added
- gain/loss generated (`valueChange - netCapitalAdded`)
- best/worst performer (`gainLossPct`)
- largest holding (`allocationPct`)
- cash/India/US allocations

---

## Screens and Navigation Map

### Root

- `app/_layout.tsx`: initializes auth, mounts cloud sync bootstrap, wraps stack
- `app/+html.tsx`: web metadata and favicon setup

### Auth Routes

- `/(auth)/login`
- `/(auth)/signup`

### Tab Routes

- `/(tabs)/index` - Overview dashboard
- `/(tabs)/holdings` - Holdings management and analysis
- `/(tabs)/xray` - Risk x-ray
- `/(tabs)/drift` - Allocation drift comparisons
- `/(tabs)/timeline` - Historical charts + monthly review/export
- `/(tabs)/accounts` - Account and cash management
- `/(tabs)/settings` - preferences, import/export, auth actions

---

## Premium / Differentiating Features

- Local-first architecture with optional cloud sync, not cloud-required.
- Multi-layer analysis stack (Overview -> X-Ray -> Drift -> Timeline -> Monthly Review).
- Target-based rebalancing and deploy-cash planning by geography/cash buckets.
- Monthly narrative generation and image export.
- Internal serverless market-data proxy with cache/fallback behavior.

---

## App Store Ready Feature List

- Track stocks and cash across multiple accounts.
- Support both broker portfolios and savings cash accounts.
- View total value, invested capital, and gain/loss instantly.
- Analyze allocation by current or invested value.
- Include or exclude cash in allocation with one tap.
- Get portfolio health insights with concentration warnings.
- Set target allocation and get rebalancing guidance.
- Plan where to deploy available cash using visual allocation bars.
- Deep-dive risk with Portfolio X-Ray (country, sector, concentration).
- Monitor allocation drift over 1, 3, and 6 months.
- Explore historical trends with interactive timeline charts.
- Generate monthly portfolio reviews and export as image.
- Backup and restore your data with JSON import/export.
- Use cloud sync securely with per-user data isolation.

---

## Missing Areas

Implementation-observed gaps/opportunities:

1. Duplicate import in `app/(tabs)/index.tsx` (`DonutChart` imported twice).
2. `includeFamilyAccounts` exists in settings but is not actively used in filtering logic.
3. Sector mapping in `xray.tsx` is heuristic/static for many symbols.
4. Month selector in monthly review displays month name only, which can be ambiguous across years.
5. No test suite or CI checks in repository scripts.
6. Some components/types appear currently unused (`HoldingRow`, `StatCard`, `BrokerAccount` alias).
7. Conflict resolution for cloud snapshot sync is timestamp-based last-write behavior.

---

## Release Readiness Assessment

### Production Readiness Score: 7.5 / 10

Strengths:

- Broad feature coverage
- Consistent UX language
- local-first + cloud architecture

Risks:

- No automated tests
- Minor code hygiene issues
- Some analytic heuristics

### Feature Completeness Score: 8.8 / 10

- Core workflows and advanced portfolio intelligence are implemented.

### UX Completeness Score: 8.0 / 10

- Cohesive dark theme and clear card-based interactions; some polish opportunities remain.

### Areas Requiring Attention Before Public Release

- Add CI checks and baseline tests.
- Fix minor code hygiene issues (duplicate import/unused artifacts).
- Improve year context in monthly selector.
- Clarify cloud conflict behavior in user-facing docs/settings.
- Optional: richer chart interactions and broader sector taxonomy.

