# AGENTS.md — Portfolio Tracker

> AI-agent reference document. Concise guide for working on this codebase. Updated after v1.0.0 release and repository analysis.

---

## Project Overview

**Portfolio Tracker** is a local-first cross-platform portfolio management app (Expo: iOS, Android, Web) that helps retail equity investors track holdings across Indian and US exchanges, analyze allocation drift, and plan cash deployment.

**Maturity:** v1.0.0 released; active development ongoing  
**Supported Markets:** Indian (NSE/BSE, INR), US (NASDAQ/NYSE, USD)  
**Core Users:** Retail investors, allocation-conscious traders, multi-account households

---

## Product Vision

### Core Problem

Users need a portfolio tracker that:
1. Works offline immediately (no cloud dependency)
2. Provides allocation insights (concentration, drift, geographic split)
3. Respects privacy (data stays local unless explicitly synced)
4. Supports dual markets (India + US)

### User Goals

- **Add holdings** from multiple brokers/accounts
- **Understand allocation** (current vs. target, geographic, sectoral)
- **Spot risks** (concentration, imbalance, drift)
- **Plan rebalancing** (how much to deploy, where)
- **Track history** (allocation evolution, monthly snapshots)

### In-Scope

✅ Multi-account portfolio management  
✅ Live market prices (Yahoo Finance, Finnhub)  
✅ Geographic allocation (India/US split)  
✅ Concentration risk analysis  
✅ Allocation drift tracking  
✅ Cash deployment planning  
✅ Optional cloud sync (Supabase)  
✅ Import/export (JSON, CSV, PNG)  

### Out-of-Scope

❌ Trade execution  
❌ Tax optimization  
❌ Dividend tracking  
❌ Options/derivatives  
❌ Real-time notifications (future)  
❌ Robo-advisor strategies (future)  

---

## Architecture Overview

### High-Level Design

```
Device App (React Native + Zustand)
    ├─ PortfolioStore (AsyncStorage)
    ├─ AuthStore (Supabase, optional)
    └─ Yahoo Finance service
              ↓
    Vercel proxy (/api/quote, /api/search)
              ↓
    Yahoo Finance + Finnhub APIs
              ↓
    Optional: Supabase Cloud (per-user JSON sync)
```

### Data Layers

1. **Local (required):** AsyncStorage — all state auto-persisted; app works offline
2. **Remote (optional):** Supabase Postgres — one row per user, snapshot-based sync
3. **Market Data:** Yahoo Finance (primary) + Finnhub (fallback)
4. **Proxy:** Vercel serverless — avoids CORS on web, adds caching

### Key Modules

| Module | Path | Responsibility |
|--------|------|---|
| **Portfolio Store** | `src/store/portfolioStore.ts` | Central state: holdings, accounts, cash, settings, snapshots |
| **Auth Store** | `src/store/authStore.ts` | Auth session, user, Supabase integration |
| **Calculations** | `src/features/portfolio/calculations.ts` | All financial math (allocations, concentration, rebalancing, deploy-cash) |
| **Market Data** | `src/services/yahooFinanceService.ts` | Market data fetching with caching |
| **Cloud Sync** | `src/features/portfolio/PortfolioCloudSyncBootstrap.tsx` | Renderless sync orchestrator |
| **Screens (UI)** | `app/(tabs)/*.tsx` | UI screens (holdings, dashboard, xray, drift, timeline, accounts, settings) |
| **API Proxy** | `api/quote.ts`, `api/search.ts` | Vercel edge functions for market data proxy |

### Routing (Expo Router v4)

```
app/
  _layout.tsx                    Root (auth init, cloud sync mount)
  (auth)/
    login.tsx, signup.tsx        Unauthenticated routes
  (tabs)/
    _layout.tsx                  Tab bar + auth guard
    index.tsx                    Dashboard (allocations, health, rebalancing, deployment)
    holdings.tsx                 Holdings CRUD + live prices + grouping/sorting/filtering
    xray.tsx                     Sector breakdown + concentration analysis
    drift.tsx                    Month-over-month allocation changes
    timeline.tsx                 Historical charts + exports (PNG/CSV/JSON)
    accounts.tsx                 Account + cash management
    settings.tsx                 FX rates, reporting currency, import/export, auth
```

---

## Development Principles

### Code Organization

1. **Pure calculations first** — all financial logic goes in `calculations.ts` as testable functions
2. **Screens orchestrate, don't compute** — screens own UI state (filters, modals) but delegate math
3. **Store is single source of truth** — mutations trigger AsyncStorage persist + cloud sync debounce
4. **Renderless components for side effects** — PortfolioCloudSyncBootstrap handles sync, not the UI

### TypeScript Conventions

- **Strict mode enabled** — no implicit `any`, full type coverage
- **Type imports** — `import type { Foo }` to isolate types
- **Discriminated unions** for service results: `{ ok: true; data: T } | { ok: false; error: E }`
- **No enums** — use string unions: `"INR" | "USD"`

### Styling

- **No CSS frameworks** (Tailwind, NativeWind removed)
- **All styles via `StyleSheet.create()`** with theme tokens from `src/theme/index.ts`
- **Dark theme only** — background #0B0C10, surface #14161A
- **Theme tokens:** colors, spacing, typography, radii

### State Management

- **Zustand + AsyncStorage** — auto-persisted, auto-rehydrated
- **Individual selectors** — never subscribe to whole store
- **Synchronous mutations** — async operations happen outside store
- **IDs generated locally** — `` `entity-${Date.now()}-${Math.random()}` ``
- **ISO 8601 timestamps** — `new Date().toISOString()`

### Geographic Classification

```typescript
const isIndia = (holding: Holding): boolean =>
  holding.currency === "INR" || holding.symbol.endsWith(".NS") || holding.symbol.endsWith(".BO");
```

---

## Product Principles

### What Creates Value

1. **Reliability** — offline works, prices update, no data loss
2. **Insight** — allocation analytics (concentration, drift, deployment)
3. **Speed** — instant startup, fast calculations, smooth animations
4. **Privacy** — data stays local until explicitly synced

### Prioritization Framework

Before implementing a feature, ask:

1. **Does it solve a real user problem?** (Not speculative)
2. **Does it reduce user effort?** (Not add steps)
3. **Does it simplify an existing workflow?** (Not complicate)
4. **Does it align with core purpose?** (Allocation tracking, not trading)
5. **Is the maintenance cost justified?** (Not over-engineered)

### What Should Be Challenged

- ❌ Speculative features (not backed by user feedback)
- ❌ Unnecessary dependencies (prefer built-in APIs)
- ❌ Over-abstraction (keep code readable over DRY)
- ❌ Cloud-first thinking (local must work first)
- ❌ Complex migrations (single JSON blob is simple)

---

## Decision Framework

### Adding a Feature

1. **Is it in-scope?** (Check Product Vision above)
2. **Does it have a user?** (Not theoretical)
3. **Can it be built simply?** (If not, break it down)
4. **Does it fit the architecture?** (Store mutation → snapshot → sync)
5. **Can it be tested?** (Unit testable or well-integrated)

### Modifying Calculations

1. **Add function to `calculations.ts`** (export return type)
2. **Keep it pure** (no side effects, no API calls)
3. **Add unit tests** (if infrastructure exists)
4. **Call from screen via `useMemo`** (not inside JSX)
5. **Update snapshots if needed** (`buildAllocationSnapshot()` must reflect changes)

### Adding a Screen

1. **Create `app/(tabs)/myscreen.tsx`** with default export
2. **Add to `app/(tabs)/_layout.tsx` tabs** — `<Tabs.Screen name="myscreen" />`
3. **Use `ScreenContainer`** to wrap content
4. **Use theme tokens** for styles
5. **Delegate calculations** to `calculations.ts`

### API Changes

1. **Yahoo Finance failing?** → Verify in `/api/quote` logs; check upstream status
2. **Market data stale?** → Client-side cache is 20 min TTL; server cache is 20 min
3. **New endpoint needed?** → Add Vercel function in `/api/` directory
4. **On native, bypass proxy** if `EXPO_PUBLIC_API_BASE_URL` unset

---

## Agent Guidelines

### When Making Changes

1. **Preserve local-first guarantee** — app must work offline
2. **Preserve calculation purity** — no side effects in `calculations.ts`
3. **Avoid speculative over-engineering** — keep it simple
4. **Maintain theme consistency** — use token imports, not hardcoded colors
5. **Test the happy path first** — then consider edge cases

### Refactoring Guidance

- ✅ Extract pure functions from screens into `calculations.ts`
- ✅ Break large components into smaller presentational components
- ✅ Consolidate similar modals/screens
- ✅ Reduce unnecessary state (derived state → `useMemo`)
- ❌ Don't add new UI frameworks
- ❌ Don't split store into multiple stores
- ❌ Don't add ORM/migration tooling (cloud sync is intentionally simple)

### Areas Requiring Caution

| Area | Risk | Action |
|------|------|--------|
| **Market data** | Yahoo Finance unreliable for India; Finnhub fallback inconsistent | Verify symbol format; add error handling; log responses |
| **Cloud sync** | Last-write-wins fragile on multi-device; no merge | Don't assume sync is instant; test offline + re-sync |
| **Calculations** | Small bugs compound across allocations and snapshots | Add unit tests; trace through example portfolios |
| **Performance** | Large snapshots/holding lists cause memory pressure | Consider pagination/virtualization for 1000+ items |
| **Auth** | Supabase optional but easy to hard-code | Always check `hasSupabaseConfig` before Supabase calls |

---

## Repository-Specific Guidance

### Critical Issues to Know About

1. **🔴 Indian equity market data broken** — Yahoo Finance returns 404/429 for .NS symbols; no fallback working
   - Impact: Live prices don't update for RELIANCE, HDFCBANK, etc.
   - Workaround: Test with cached prices or mock data
   - Fix needed: Integrate NSE API or switch provider

2. **🟡 Cloud sync not production-ready for multi-device** — last-write-wins causes overwrites without user awareness
   - Mitigation: Add merge conflict UI; document limitation in auth screen

3. **🟡 No testing infrastructure** — financial calculations not unit tested
   - Risk: Regressions on calculation changes
   - Opportunity: Add Jest tests for `calculations.ts` (pure functions, easy to test)

### Hotspots for Attention

- `api/quote.ts` — Market data fetching; complex retry + cache logic
- `src/features/portfolio/calculations.ts` — All financial math; high-impact errors
- `PortfolioCloudSyncBootstrap.tsx` — Sync orchestration; subtle timing bugs possible
- `app/(tabs)/index.tsx` — Dashboard; many cards, complex state

### Debugging Workflows

**Market data not updating:**
```bash
# Check /api/quote logs on Vercel
# Verify FINNHUB_API_KEY is set in Vercel env
# Check symbol format (RELIANCE.NS not RELIANCE NS)
```

**Cloud sync not working:**
```bash
# Check Supabase URL + ANON_KEY in .env
# Verify table exists: SELECT * FROM portfolio_snapshots;
# Check RLS policies: Auth → Policies tab
# Look for errors in PortfolioCloudSyncBootstrap via console.log
```

**Calculations off:**
```bash
# Add console.log to calcPortfolioTotals, calcSymbolAllocations, etc.
# Compare against spreadsheet manually
# Verify currency conversion (toINR, toUSD)
# Check allocation basis (CURRENT_VALUE vs INVESTED_VALUE)
```

### Testing Checklist

Before pushing changes:

- [ ] Run `npm run typecheck` (no TS errors)
- [ ] Test offline (kill network, verify app loads)
- [ ] Test with seed data (10+ holdings in each market)
- [ ] Check theme consistency (colors, spacing, typography)
- [ ] Verify calculations (spot-check one example by hand)
- [ ] Test on web + at least one mobile platform
- [ ] Test with/without Supabase config (optional cloud sync)

### Common Workflows

**Add a calculation:**
```typescript
// 1. Pure function in calculations.ts
export const calcMyMetric = (data: Input[]): Output => { ... }

// 2. Export return type
export type MyMetricResult = { ... }

// 3. Call from screen via useMemo
const result = useMemo(() => calcMyMetric(holdings), [holdings])
```

**Add a modal:**
```typescript
// 1. Create component in src/components/
export function MyModal({ visible, onClose }: { ... }) { ... }

// 2. Add state to screen
const [showMyModal, setShowMyModal] = useState(false)

// 3. Render modal + trigger button
<Button onPress={() => setShowMyModal(true)} />
<MyModal visible={showMyModal} onClose={() => setShowMyModal(false)} />
```

**Deploy to Vercel:**
```bash
# vercel.json is configured; push to branch
# Vercel auto-builds static web export + deploys /api/ functions
# Check Vercel dashboard for build logs
```

**Configure Supabase:**
```bash
# Create .env at repo root
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx

# Run migration: Supabase Dashboard → SQL Editor → paste supabase/portfolio_snapshots.sql
# Verify RLS policies are in place
```

---

## Key Files and Folders

### Must Never Modify

| Path | Reason |
|---|---|
| `*.legacy.*`, `*.removed.*` | Deprecated; reference only |
| `expo-env.d.ts` | Auto-generated by Expo |
| `.expo/` | Expo runtime cache |
| `node_modules/` | Dependencies |
| `dist/`, `build/` | Build output |
| `supabase/portfolio_snapshots.sql` | Production migration; run once, don't edit after deploy |

### Important Files to Know

| Path | Purpose |
|------|---------|
| `src/store/portfolioStore.ts` | Central state + mutations |
| `src/features/portfolio/calculations.ts` | All financial math |
| `app/_layout.tsx` | Root layout; auth init + cloud sync mount |
| `app/(tabs)/_layout.tsx` | Tab bar + auth guard |
| `src/theme/index.ts` | Design tokens |
| `api/quote.ts` | Market data proxy |
| `.env` | Environment variables (Supabase, API base URL) |
| `package.json` | Dependencies + scripts |
| `tsconfig.json` | TypeScript strict mode |
| `docs/repository-analysis.md` | Detailed tech debt, risks, recommendations |

---

## Deployment

### Web (Vercel)

```bash
# Push to connected branch; Vercel auto-deploys
# vercel.json handles rewrites for SPA
# Static output to /out/; /api/ functions serverless
```

**Environment Variables (Vercel Dashboard):**
```
EXPO_PUBLIC_API_BASE_URL=https://your-vercel-domain.vercel.app
FINNHUB_API_KEY=<server-only, optional>
```

### Mobile (iOS/Android)

```bash
npm run ios      # iOS simulator
npm run android  # Android emulator

# For production builds, use Expo Application Services (EAS) or native tools
```

### Local Development

```bash
npm install
npm start                    # Expo dev server (choose platform)
npm run typecheck            # Type check
```

---

## Performance Targets

- App cold start: < 2s
- Dashboard render: < 500ms
- Calculation on 500 holdings: < 100ms
- Market data fetch: < 2s per 50 symbols
- Cloud sync push: < 1s

---

## Success Criteria for Changes

### Minimal Change

- [ ] Code is simpler than before
- [ ] No new dependencies added
- [ ] Offline behavior unchanged
- [ ] Allocation math verified (spot-check)

### Feature Addition

- [ ] Solves documented user problem
- [ ] Fits existing architecture (store + calculation + UI)
- [ ] Includes error handling + user feedback
- [ ] Works offline first
- [ ] Calculations tested or verified by hand

### Bug Fix

- [ ] Root cause identified and documented
- [ ] Fix is minimal and targeted
- [ ] User impact verified (tested on target data)

