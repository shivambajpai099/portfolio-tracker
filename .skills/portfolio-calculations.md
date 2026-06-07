# Skill: Portfolio Calculations

## Scope
`src/features/portfolio/calculations.ts` — all pure financial math.
`src/features/portfolio/selectors.ts` — derived exposure aggregation.

---

## Design Rules

- Every function is **pure** (no side effects, no store access, no imports from stores).
- Screen files call these functions inside `useMemo`; no business logic lives in JSX.
- All money values are floating-point numbers in the holding's native currency unless explicitly converted.
- Return types are exported interfaces so screens can type-annotate `useMemo` results.

---

## FX Helpers

```typescript
toINR(value, currency, rates)      // USD → INR if currency === "USD"
toUSD(value, currency, rates)      // INR → USD if currency === "INR"
convert(value, from, to, rates)    // generic bidirectional converter
```
`FxRates = { USDINR: number }` — only one rate is tracked; all conversions go through this.

---

## Live Price Resolution

```typescript
resolveMarketPrice(holding, priceCache?)
// Returns priceCache.bySymbol[symbol].price if present and fresh, else holding.marketPrice
```
The `priceCache` parameter is optional. If omitted the stored `marketPrice` is used (offline mode).

---

## Holding-Level

```typescript
holdingCost(holding)                          // quantity × averagePrice
holdingMarketValue(holding, priceCache?)      // quantity × resolveMarketPrice
holdingGainLoss(holding, priceCache?)         // marketValue − cost
holdingGainLossPct(holding, priceCache?)      // gainLoss / cost × 100
```

---

## Portfolio Totals

```typescript
calcPortfolioTotals(holdings, cashHoldings, rates, reportingCurrency, priceCache?)
// Returns: PortfolioTotals { currentValue, investedValue, gainLoss, gainLossPct, currency }
```
Cash balances are included in both `currentValue` and `investedValue` (cash neither gains nor loses).

---

## Symbol Allocations

```typescript
calcSymbolAllocations(
  holdings, cashHoldings, rates, reportingCurrency,
  allocationBasis?,       // "CURRENT_VALUE" (default) | "INVESTED_VALUE"
  allocationIncludeCash?, // true (default)
  priceCache?
)
// Returns: SymbolAllocation[] sorted by currentValue DESC
```

`SymbolAllocation`:
```typescript
{
  symbol, companyName,
  currentValue, investedValue, gainLoss, gainLossPct,
  allocationPct,   // share of portfolio denominator
  currency,        // reportingCurrency
  accountIds       // all account IDs that hold this symbol
}
```

Holdings sharing the same `symbol` across different accounts are **merged** into one entry.

---

## Geographic Split

```typescript
calcGeographicSplit(holdings, rates, reportingCurrency, priceCache?)
// Returns: GeographicSplit { indiaValuePct, usValuePct, indiaCurrentValue, usCurrentValue, currency }
```

India detection:
```typescript
currency === "INR" || symbol.endsWith(".NS") || symbol.endsWith(".BO")
```

---

## Concentration Risk

```typescript
calcConcentrationRisk(allocations)
// Returns: ConcentrationRisk { hhi, level, symbolCount, topHoldingPct, top5Pct }
```

- `hhi` — Herfindahl-Hirschman Index: `Σ(allocationPct²)`. Range 0–10000.
- `level`: LOW < 1500, MODERATE < 2500, HIGH ≥ 2500.

---

## Portfolio Snapshot (composite)

```typescript
calcPortfolioSnapshot(holdings, cashHoldings, rates, reportingCurrency, allocationBasis?, allocationIncludeCash?, priceCache?)
// Returns: PortfolioSnapshot { totals, allocations, topAllocations, geographicSplit, concentration }
```

Convenience wrapper that computes all dimensions in one call.

---

## Rebalancing Suggestions

```typescript
calcRebalancingSuggestions(indiaValue, usValue, cashValue, target, reportingCurrency)
// Returns: RebalancingResult { suggestions, totalValue, currency, targetsValid }
```

`RebalancingSuggestion` per region:
```typescript
{
  region: "INDIA" | "US" | "CASH",
  currentPct, targetPct,
  diffPct,    // positive = overweight
  diffValue,  // in reporting currency; positive = sell, negative = buy
  direction: "OVERWEIGHT" | "UNDERWEIGHT" | "ON_TARGET"
}
```
Differences < 1 percentage point are treated as `ON_TARGET`.

---

## Deploy Cash

```typescript
calcDeployCash(deployAmount, target, reportingCurrency)
// Returns: DeployCashResult { deployAmount, slices, currency }
```

`DeployCashSlice`:
```typescript
{ region: "INDIA" | "US" | "CASH", label, pct, amount }
```

Target percentages are normalised before use — safe even when they don't sum to exactly 100.

---

## Selectors (`selectors.ts`)

```typescript
exposureBySymbol(holdings, usdInr)
// Returns: ExposureBySymbol[] sorted by totalValueInINR DESC
// { symbol, companyName, totalQuantity, totalValueInINR, totalValueInUSD }
// Aggregates across all accounts (same symbol in multiple accounts → one row)
```

---

## Adding a New Calculation

1. Write a pure function at the bottom of `calculations.ts`.
2. Export its return-type interface from the same file.
3. Use `useMemo` in the consuming screen:
   ```typescript
   const result = useMemo(
     () => myNewCalc(holdings, fxRates, settings.reportingCurrency),
     [holdings, fxRates, settings.reportingCurrency]
   );
   ```

