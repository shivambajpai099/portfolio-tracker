# Skill: Portfolio State Management

## Scope
- `src/store/portfolioStore.ts` — Zustand store with persistence
- `src/types/portfolio.ts` — domain types
- `src/features/portfolio/mockData.ts` — seed data

---

## Store Shape

```typescript
interface PortfolioState {
  // Data
  accounts:             Account[]
  holdings:             Holding[]
  cashHoldings:         CashHolding[]
  allocationSnapshots:  AllocationSnapshot[]
  settings:             PortfolioSettings
  fxRates:              FxRates              // { USDINR: number }
  snapshotUpdatedAt:    string               // ISO 8601; updated on every mutation
  hydrated:             boolean              // true after AsyncStorage rehydrate

  // CRUD
  addAccount(account)
  updateAccount(id, updates)
  removeAccount(id)           // also removes linked holdings and cashHoldings

  addHolding(holding)
  updateHolding(id, updates)
  removeHolding(id)

  addCashHolding(cashHolding)
  updateCashHolding(id, updates)
  removeCashHolding(id)

  // Settings & FX
  updateSettings(updates)
  updateFxRates(rates)
  clearAllData()

  // Snapshot sync
  getSnapshot()               // → PortfolioSnapshotData (plain object for cloud push)
  replaceFromSnapshot(data)   // replaces all state from cloud pull
  setHydrated(boolean)

  // Computed (called, not subscribed)
  totalValueInINR()  → number
  totalValueInUSD()  → number
  exposure()         → ExposureBySymbol[]
}
```

---

## Key Types

### Account
```typescript
interface Account {
  id: string;             // acc-${Date.now()}-${random}
  name: string;
  owner: string;
  broker: string;
  type: "BROKER" | "SAVINGS";
  baseCurrency: "INR" | "USD";
  createdAt?: string;
  updatedAt?: string;
}
```
`accountSupportsHoldings(type)` → true only for `"BROKER"`.

### Holding
```typescript
interface Holding {
  id: string;             // h-${Date.now()}-${random}
  accountId: string;
  symbol: string;         // e.g. "AAPL", "RELIANCE.NS"
  companyName: string;
  quantity: number;
  averagePrice: number;
  marketPrice: number;    // last known; updated by live price refresh
  currency: "INR" | "USD";
  asOf?: string;
  updatedAt?: string;
}
```

### CashHolding
```typescript
interface CashHolding {
  id: string;             // cash-${Date.now()}-${random}
  accountId: string;
  currency: "INR" | "USD";
  balance: number;
  asOf?: string;
  updatedAt?: string;
}
```

### AllocationSnapshot
```typescript
interface AllocationSnapshot {
  date: string;                    // ISO 8601
  totalPortfolioValue: number;
  investedValue: number;
  gainLoss: number;
  indiaAllocationPct: number;
  usAllocationPct: number;
  cashAllocationPct: number;
  topHoldings: AllocationHoldingSnapshot[];  // top 10 by allocation
}
```

### PortfolioSettings
```typescript
interface PortfolioSettings {
  reportingCurrency: "INR" | "USD";
  includeFamilyAccounts: boolean;
  allocationBasis: "CURRENT_VALUE" | "INVESTED_VALUE";
  allocationIncludeCash: boolean;
  onboardingTipsSeen: boolean;
  targetAllocation?: { indiaPct, usPct, cashPct } | null;
  timelineRetention?: "6M" | "1Y" | "2Y" | "ALL";
  lastViewedAt?: string;
  updatedAt?: string;
}
```

---

## Snapshot Auto-Build on Mutation

Every financial mutation (`addHolding`, `updateHolding`, `removeHolding`, `addCashHolding`, `updateCashHolding`, `removeCashHolding`, `removeAccount`) synchronously builds a new `AllocationSnapshot` and appends it:

```typescript
// Inside any mutation set():
const now = new Date().toISOString();
const newSnapshot = buildAllocationSnapshot(holdings, cashHoldings, fxRates, rc, now);
return {
  ...updatedSlice,
  allocationSnapshots: appendAllocationSnapshot(allocationSnapshots, newSnapshot, settings.timelineRetention),
  snapshotUpdatedAt: now,
};
```

`appendAllocationSnapshot` calls `pruneSnapshotsByRetention` to enforce the retention window and the 500-entry hard cap.

---

## Persistence

Key: `"portfolio-storage"` in AsyncStorage.

Partialised fields persisted:
```
accounts, holdings, cashHoldings, allocationSnapshots, settings, fxRates, snapshotUpdatedAt
```
`hydrated` is NOT persisted — it is set to `true` in `onRehydrateStorage`.

### Rehydration Normalisation

`onRehydrateStorage` runs migration logic to handle schema gaps from older versions:
1. If `snapshotUpdatedAt` is missing → call `replaceFromSnapshot` to rebuild it.
2. If `allocationSnapshots` is empty but holdings exist → build an initial snapshot.
3. If snapshots have missing `investedValue`/`gainLoss`/`topHoldings` fields → normalise via `normalizeAllocationSnapshots`.
4. If settings are missing `onboardingTipsSeen` (boolean) or `timelineRetention` → call `updateSettings`.

---

## Selector Pattern

```typescript
// ✅ Correct — individual slice selectors
const holdings    = usePortfolioStore((s) => s.holdings);
const settings    = usePortfolioStore((s) => s.settings);

// ❌ Wrong — subscribes to whole store, causes every re-render
const store = usePortfolioStore();
```

Use `useMemo` for derived values computed from multiple slices:
```typescript
const totals = useMemo(
  () => calcPortfolioTotals(holdings, cashHoldings, fxRates, rc),
  [holdings, cashHoldings, fxRates, rc]
);
```

---

## Seed Data (`mockData.ts`)

Used as initial state when the store is first created (before any user data):
- 3 accounts (Zerodha INR, IBKR USD, Fidelity USD)
- 6 holdings across those accounts (RELIANCE, AAPL×2, NVDA, TCS, MSFT)
- 3 cash holdings
- Default FX rate: `USDINR: 84.5`
- Default settings: `reportingCurrency: "INR"`, `allocationBasis: "CURRENT_VALUE"`, etc.

---

## ID Generation Convention

```typescript
const createAccountId = () => `acc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const createHoldingId = () => `h-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const createCashId    = () => `cash-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
```

Generated at creation time in the screen, passed into the store action. Never generated inside the store.

---

## Adding a New Store Field

1. Add the field to `PortfolioState` interface in `portfolioStore.ts`.
2. Add an initial value in the `create()` call.
3. Add it to the `partialize` function if it should be persisted.
4. If it's a setting, add it to `PortfolioSettings` in `portfolio.ts` and update `normalizeSettings`.
5. Update `PortfolioSnapshotData` in `cloudSnapshot.ts` if it must be cloud-synced.

