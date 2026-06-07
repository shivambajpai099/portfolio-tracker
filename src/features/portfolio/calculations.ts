import type { AllocationBasis, CashHolding, Currency, FxRates, Holding, LivePriceCache, TargetAllocation } from "../../types/portfolio";

// ---------------------------------------------------------------------------
// FX helpers
// ---------------------------------------------------------------------------

export const toINR = (value: number, currency: Currency, rates: FxRates): number =>
  currency === "INR" ? value : value * rates.USDINR;

export const toUSD = (value: number, currency: Currency, rates: FxRates): number =>
  currency === "USD" ? value : value / rates.USDINR;

export const convert = (value: number, from: Currency, to: Currency, rates: FxRates): number => {
  if (from === to) {
    return value;
  }
  return to === "INR" ? toINR(value, from, rates) : toUSD(value, from, rates);
};

const normalizeIndiaTicker = (symbol: string): string => symbol.trim().toUpperCase().replace(/\.(NS|BO)$/i, "");

// ---------------------------------------------------------------------------
// Live price resolution
// ---------------------------------------------------------------------------

/**
 * Returns the market price for a holding.
 * Uses the live price cache when available; falls back to the stored marketPrice.
 */
export const resolveMarketPrice = (holding: Holding, priceCache?: LivePriceCache): number => {
  const key = holding.symbol.toUpperCase();
  const entry = priceCache?.bySymbol[key] ?? priceCache?.bySymbol[normalizeIndiaTicker(key)];
  return entry?.price ?? holding.marketPrice;
};

// ---------------------------------------------------------------------------
// Holding-level
// ---------------------------------------------------------------------------

export const holdingCost = (holding: Holding): number =>
  holding.quantity * holding.averagePrice;

export const holdingMarketValue = (holding: Holding, priceCache?: LivePriceCache): number =>
  holding.quantity * resolveMarketPrice(holding, priceCache);

export const holdingGainLoss = (holding: Holding, priceCache?: LivePriceCache): number =>
  holdingMarketValue(holding, priceCache) - holdingCost(holding);

export const holdingGainLossPct = (holding: Holding, priceCache?: LivePriceCache): number => {
  const cost = holdingCost(holding);
  return cost === 0 ? 0 : (holdingGainLoss(holding, priceCache) / cost) * 100;
};

// ---------------------------------------------------------------------------
// Portfolio totals
// ---------------------------------------------------------------------------

export interface PortfolioTotals {
  currentValue: number;
  investedValue: number;
  gainLoss: number;
  gainLossPct: number;
  currency: Currency;
}

export const calcPortfolioTotals = (
  holdings: Holding[],
  cashHoldings: CashHolding[],
  rates: FxRates,
  reportingCurrency: Currency,
  priceCache?: LivePriceCache
): PortfolioTotals => {
  let currentValue = 0;
  let investedValue = 0;

  for (const holding of holdings) {
    currentValue += convert(holdingMarketValue(holding, priceCache), holding.currency, reportingCurrency, rates);
    investedValue += convert(holdingCost(holding), holding.currency, reportingCurrency, rates);
  }

  for (const cash of cashHoldings) {
    const cashInReporting = convert(cash.balance, cash.currency, reportingCurrency, rates);
    currentValue += cashInReporting;
    investedValue += cashInReporting;
  }

  const gainLoss = currentValue - investedValue;
  const gainLossPct = investedValue === 0 ? 0 : (gainLoss / investedValue) * 100;

  return { currentValue, investedValue, gainLoss, gainLossPct, currency: reportingCurrency };
};

// ---------------------------------------------------------------------------
// Allocation by symbol (grouped across accounts)
// ---------------------------------------------------------------------------

export interface SymbolAllocation {
  symbol: string;
  companyName: string;
  currentValue: number;
  investedValue: number;
  gainLoss: number;
  gainLossPct: number;
  allocationPct: number;
  currency: Currency;
  accountIds: string[];
}

export const calcSymbolAllocations = (
  holdings: Holding[],
  cashHoldings: CashHolding[],
  rates: FxRates,
  reportingCurrency: Currency,
  allocationBasis: AllocationBasis = "CURRENT_VALUE",
  allocationIncludeCash = true,
  priceCache?: LivePriceCache
): SymbolAllocation[] => {
  const map = new Map<string, SymbolAllocation>();

  for (const holding of holdings) {
    const symbol = holding.symbol.toUpperCase();
    const current = convert(holdingMarketValue(holding, priceCache), holding.currency, reportingCurrency, rates);
    const invested = convert(holdingCost(holding), holding.currency, reportingCurrency, rates);

    const existing = map.get(symbol);
    if (!existing) {
      map.set(symbol, {
        symbol,
        companyName: holding.companyName,
        currentValue: current,
        investedValue: invested,
        gainLoss: current - invested,
        gainLossPct: 0,
        allocationPct: 0,
        currency: reportingCurrency,
        accountIds: [holding.accountId],
      });
      continue;
    }

    existing.currentValue += current;
    existing.investedValue += invested;
    existing.gainLoss = existing.currentValue - existing.investedValue;
    if (!existing.accountIds.includes(holding.accountId)) {
      existing.accountIds.push(holding.accountId);
    }
  }

  const items = [...map.values()];
  const holdingsTotal = items.reduce(
    (sum, item) => sum + (allocationBasis === "INVESTED_VALUE" ? item.investedValue : item.currentValue),
    0
  );

  let cashTotal = 0;
  if (allocationIncludeCash) {
    for (const cash of cashHoldings) {
      cashTotal += convert(cash.balance, cash.currency, reportingCurrency, rates);
    }
  }

  const denominator = holdingsTotal + cashTotal;

  for (const item of items) {
    const numerator = allocationBasis === "INVESTED_VALUE" ? item.investedValue : item.currentValue;
    item.allocationPct = denominator > 0 ? (numerator / denominator) * 100 : 0;
    item.gainLossPct = item.investedValue > 0 ? (item.gainLoss / item.investedValue) * 100 : 0;
  }

  return items.sort((a, b) => b.currentValue - a.currentValue);
};

// ---------------------------------------------------------------------------
// Top allocations
// ---------------------------------------------------------------------------

export const topAllocations = (allocations: SymbolAllocation[], limit = 5): SymbolAllocation[] =>
  [...allocations].sort((a, b) => b.allocationPct - a.allocationPct).slice(0, limit);

// ---------------------------------------------------------------------------
// India vs US geographic split
// ---------------------------------------------------------------------------

export interface GeographicSplit {
  indiaValuePct: number;
  usValuePct: number;
  indiaCurrentValue: number;
  usCurrentValue: number;
  currency: Currency;
}

const isIndiaSymbol = (symbol: string, currency: Currency): boolean =>
  currency === "INR" || symbol.endsWith(".NS") || symbol.endsWith(".BO");

export const calcGeographicSplit = (
  holdings: Holding[],
  rates: FxRates,
  reportingCurrency: Currency,
  priceCache?: LivePriceCache
): GeographicSplit => {
  let indiaValue = 0;
  let usValue = 0;

  for (const holding of holdings) {
    const value = convert(holdingMarketValue(holding, priceCache), holding.currency, reportingCurrency, rates);
    if (isIndiaSymbol(holding.symbol, holding.currency)) {
      indiaValue += value;
    } else {
      usValue += value;
    }
  }

  const total = indiaValue + usValue;
  return {
    indiaCurrentValue: indiaValue,
    usCurrentValue: usValue,
    indiaValuePct: total > 0 ? (indiaValue / total) * 100 : 0,
    usValuePct: total > 0 ? (usValue / total) * 100 : 0,
    currency: reportingCurrency,
  };
};

// ---------------------------------------------------------------------------
// Concentration risk
// ---------------------------------------------------------------------------

export interface ConcentrationRisk {
  /** Herfindahl-Hirschman Index (0–10000). Higher = more concentrated. */
  hhi: number;
  /** Label: LOW < 1500, MODERATE < 2500, HIGH >= 2500 */
  level: "LOW" | "MODERATE" | "HIGH";
  /** Number of distinct symbols */
  symbolCount: number;
  /** Weight of the single largest position in percent */
  topHoldingPct: number;
  /** Weight of top 5 positions combined in percent */
  top5Pct: number;
}

export const calcConcentrationRisk = (allocations: SymbolAllocation[]): ConcentrationRisk => {
  const symbolCount = allocations.length;

  if (symbolCount === 0) {
    return { hhi: 0, level: "LOW", symbolCount: 0, topHoldingPct: 0, top5Pct: 0 };
  }

  const hhi = allocations.reduce((sum, item) => sum + item.allocationPct ** 2, 0);

  const sorted = [...allocations].sort((a, b) => b.allocationPct - a.allocationPct);
  const topHoldingPct = sorted[0]?.allocationPct ?? 0;
  const top5Pct = sorted.slice(0, 5).reduce((sum, item) => sum + item.allocationPct, 0);

  const level: ConcentrationRisk["level"] = hhi >= 2500 ? "HIGH" : hhi >= 1500 ? "MODERATE" : "LOW";

  return { hhi, level, symbolCount, topHoldingPct, top5Pct };
};

// ---------------------------------------------------------------------------
// Full portfolio snapshot
// ---------------------------------------------------------------------------

export interface PortfolioSnapshot {
  totals: PortfolioTotals;
  allocations: SymbolAllocation[];
  topAllocations: SymbolAllocation[];
  geographicSplit: GeographicSplit;
  concentration: ConcentrationRisk;
}

export const calcPortfolioSnapshot = (
  holdings: Holding[],
  cashHoldings: CashHolding[],
  rates: FxRates,
  reportingCurrency: Currency,
  allocationBasis: AllocationBasis = "CURRENT_VALUE",
  allocationIncludeCash = true,
  priceCache?: LivePriceCache
): PortfolioSnapshot => {
  const allocations = calcSymbolAllocations(holdings, cashHoldings, rates, reportingCurrency, allocationBasis, allocationIncludeCash, priceCache);
  return {
    totals: calcPortfolioTotals(holdings, cashHoldings, rates, reportingCurrency, priceCache),
    allocations,
    topAllocations: topAllocations(allocations),
    geographicSplit: calcGeographicSplit(holdings, rates, reportingCurrency, priceCache),
    concentration: calcConcentrationRisk(allocations),
  };
};

// ---------------------------------------------------------------------------
// Rebalancing suggestions
// ---------------------------------------------------------------------------

export interface RebalancingSuggestion {
  region: "INDIA" | "US" | "CASH";
  label: string;
  targetPct: number;
  currentPct: number;
  /** positive = overweight, negative = underweight (in percentage points) */
  diffPct: number;
  /** Amount to move in reporting currency; positive = reduce, negative = buy more */
  diffValue: number;
  direction: "OVERWEIGHT" | "UNDERWEIGHT" | "ON_TARGET";
}

export interface RebalancingResult {
  suggestions: RebalancingSuggestion[];
  totalValue: number;
  currency: Currency;
  /** Whether the target percentages sum to 100 (within ±0.5). */
  targetsValid: boolean;
}

/** Differences smaller than this (in pct points) are treated as "on target". */
const REBALANCE_THRESHOLD = 1;

export const calcRebalancingSuggestions = (
  indiaValue: number,
  usValue: number,
  cashValue: number,
  target: TargetAllocation,
  reportingCurrency: Currency,
): RebalancingResult => {
  const totalValue = indiaValue + usValue + cashValue;
  const targetSum = target.indiaPct + target.usPct + target.cashPct;
  const targetsValid = Math.abs(targetSum - 100) < 0.5;

  if (totalValue === 0) {
    return { suggestions: [], totalValue: 0, currency: reportingCurrency, targetsValid };
  }

  const build = (
    region: "INDIA" | "US" | "CASH",
    label: string,
    currentValue: number,
    targetPct: number,
  ): RebalancingSuggestion => {
    const currentPct = (currentValue / totalValue) * 100;
    const diffPct = currentPct - targetPct;
    const diffValue = (diffPct / 100) * totalValue;
    const direction: RebalancingSuggestion["direction"] =
      Math.abs(diffPct) < REBALANCE_THRESHOLD
        ? "ON_TARGET"
        : diffPct > 0
        ? "OVERWEIGHT"
        : "UNDERWEIGHT";
    return { region, label, targetPct, currentPct, diffPct, diffValue, direction };
  };

  return {
    suggestions: [
      build("INDIA", "Indian equities", indiaValue, target.indiaPct),
      build("US", "US equities", usValue, target.usPct),
      build("CASH", "Cash", cashValue, target.cashPct),
    ],
    totalValue,
    currency: reportingCurrency,
    targetsValid,
  };
};

// ---------------------------------------------------------------------------
// Deploy cash
// ---------------------------------------------------------------------------

export interface DeployCashSlice {
  region: "INDIA" | "US" | "CASH";
  label: string;
  /** Normalised percentage share of the deploy amount (sums to 100). */
  pct: number;
  amount: number;
}

export interface DeployCashResult {
  deployAmount: number;
  slices: DeployCashSlice[];
  currency: Currency;
}

export interface DeployCashAllocationContext {
  indiaCurrentValue: number;
  usCurrentValue: number;
  cashCurrentValue: number;
}

/**
 * Splits `deployAmount` across India equities, US equities, and cash-reserve.
 *
 * When current portfolio allocation is provided, the planner sends deployable
 * cash only to underweight equity buckets and keeps the remainder as cash so
 * the target cash reserve is preserved as closely as possible without selling.
 *
 * The target percentages are normalised before use so the function is safe
 * even when targets don't sum to exactly 100.
 */
export const calcDeployCash = (
  deployAmount: number,
  target: TargetAllocation,
  reportingCurrency: Currency,
  currentAllocation?: DeployCashAllocationContext,
): DeployCashResult => {
  const targetTotal = target.indiaPct + target.usPct + target.cashPct;

  if (targetTotal === 0 || deployAmount <= 0) {
    return { deployAmount, slices: [], currency: reportingCurrency };
  }

  // When current allocation is available, allocate deployable cash only to
  // underweight equity buckets. Any remaining amount stays as cash so we do
  // not buy overweight positions just to force the target mix.
  if (currentAllocation) {
    const currentTotal =
      currentAllocation.indiaCurrentValue + currentAllocation.usCurrentValue + currentAllocation.cashCurrentValue;

    if (currentTotal > 0) {
      const raw: Array<{
        region: DeployCashSlice["region"];
        label: string;
        currentValue: number;
        targetPct: number;
      }> = [
        {
          region: "INDIA",
          label: "India equities",
          currentValue: currentAllocation.indiaCurrentValue,
          targetPct: target.indiaPct,
        },
        {
          region: "US",
          label: "US equities",
          currentValue: currentAllocation.usCurrentValue,
          targetPct: target.usPct,
        },
      ];

      const needs = raw
        .map((item) => {
          const targetValue = (item.targetPct / targetTotal) * currentTotal;
          return {
            ...item,
            need: Math.max(0, targetValue - item.currentValue),
          };
        })
        .filter((item) => item.need > 0);

      const totalNeed = needs.reduce((sum, item) => sum + item.need, 0);

      if (totalNeed === 0) {
        return {
          deployAmount,
          slices: [{ region: "CASH", label: "Keep as cash", pct: 100, amount: deployAmount }],
          currency: reportingCurrency,
        };
      }

      const equityDeploy = Math.min(deployAmount, totalNeed);
      const equitySlices: DeployCashSlice[] = needs
        .map((item) => ({
          region: item.region,
          label: item.label,
          pct: (item.need / totalNeed) * (equityDeploy / deployAmount) * 100,
          amount: (item.need / totalNeed) * equityDeploy,
        }))
        .filter((item) => item.amount > 0);

      const cashAmount = deployAmount - equityDeploy;
      const slices: DeployCashSlice[] = [...equitySlices];

      if (cashAmount > 0) {
        slices.push({
          region: "CASH",
          label: "Keep as cash",
          pct: (cashAmount / deployAmount) * 100,
          amount: cashAmount,
        });
      }

      return { deployAmount, slices, currency: reportingCurrency };
    }
  }

  const norm = (v: number) => (v / targetTotal) * 100;

  const raw: Array<{ region: DeployCashSlice["region"]; label: string; pct: number }> = [
    { region: "INDIA", label: "India equities",  pct: norm(target.indiaPct) },
    { region: "US",    label: "US equities",     pct: norm(target.usPct)    },
    { region: "CASH",  label: "Keep as cash",    pct: norm(target.cashPct)  },
  ];

  const slices: DeployCashSlice[] = raw
    .filter((r) => r.pct > 0)
    .map((r) => ({ ...r, amount: (r.pct / 100) * deployAmount }));

  return { deployAmount, slices, currency: reportingCurrency };
};


