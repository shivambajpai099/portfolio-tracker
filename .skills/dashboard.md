# Skill: Dashboard

## Scope
`app/(tabs)/index.tsx` — the main Overview screen.

---

## What the Dashboard Does

The dashboard aggregates the entire portfolio into a single at-a-glance view:

1. **Total value + gain/loss** — reported in the user's `reportingCurrency` (INR or USD).
2. **Donut chart** — switchable between symbol allocation view and geographic (India / US) view.
3. **Geo filter** — ALL / INDIA / US pills that narrow both the chart and the stat cards.
4. **Portfolio Health Card** — AI-style insights: largest position %, top-5 concentration, position count, cash %, India/US balance.
5. **Rebalancing Card** — editable target allocation (India % / US % / Cash %) plus buy/sell suggestions.
6. **Deploy Cash Card** — calculator that splits a cash amount across regions per target allocation.
7. **Onboarding guide modal** — shown once on first launch, gated by `settings.onboardingTipsSeen`.

---

## Key Data Sources (Zustand selectors)

```typescript
const holdings        = usePortfolioStore((s) => s.holdings);
const cashHoldings    = usePortfolioStore((s) => s.cashHoldings);
const accounts        = usePortfolioStore((s) => s.accounts);
const fxRates         = usePortfolioStore((s) => s.fxRates);
const settings        = usePortfolioStore((s) => s.settings);
const hydrated        = usePortfolioStore((s) => s.hydrated);
const updateSettings  = usePortfolioStore((s) => s.updateSettings);
```

---

## Calculations Used (all from `src/features/portfolio/calculations.ts`)

| Function | Purpose |
|---|---|
| `calcPortfolioTotals` | `currentValue`, `investedValue`, `gainLoss`, `gainLossPct` |
| `calcSymbolAllocations` | Per-symbol allocation % — respects `allocationBasis` and `allocationIncludeCash` |
| `calcGeographicSplit` | `indiaValuePct`, `usValuePct`, `indiaCurrentValue`, `usCurrentValue` |
| `calcConcentrationRisk` | HHI, `topHoldingPct`, `top5Pct`, risk `level` |
| `calcRebalancingSuggestions` | Over/underweight directions and amounts per region |
| `convert` | FX conversion for filtered sub-totals |

All calculations are wrapped in `useMemo` to avoid recomputing on unrelated re-renders.

---

## Donut Chart Data

Symbol view:
```typescript
const donutSlices = symbolAllocations.map((item, i) => ({
  value: item.allocationPct,
  color: DONUT_PALETTE[i % DONUT_PALETTE.length],
}));
// Cash bucket appended separately using CASH_COLOR (#374151)
```

Geo view:
```typescript
[
  { value: geoSplit.indiaValuePct, color: GEO_INDIA_COLOR },  // #F59E0B
  { value: geoSplit.usValuePct,    color: GEO_US_COLOR },     // #6366F1
]
```

---

## Geo Filter Logic

```typescript
const filteredHoldings = useMemo(() => {
  if (geoFilter === "ALL") return holdings;
  return holdings.filter((h) => {
    const isIndia = h.currency === "INR" || h.symbol.endsWith(".NS") || h.symbol.endsWith(".BO");
    return geoFilter === "INDIA" ? isIndia : !isIndia;
  });
}, [holdings, geoFilter]);
```
Cash holdings filtered by currency: INR → INDIA, USD → US.

---

## Onboarding Guide

- Controlled by `settings.onboardingTipsSeen` (boolean).
- `useEffect` triggers `setShowGuide(true)` when `hydrated && !onboardingTipsSeen`.
- On close: `updateSettings({ onboardingTipsSeen: true })`.
- Modal component: `PortfolioGuideModal`.

---

## Adding New Dashboard Sections

1. Add a pure calculation function to `calculations.ts`.
2. Call it inside `useMemo` in `index.tsx`.
3. Render with an existing component (e.g., `StatCard`) or a new component in `src/components/`.
4. Do not place calculation logic inside JSX.

