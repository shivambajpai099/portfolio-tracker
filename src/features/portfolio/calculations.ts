import type { CashHolding, Currency, FxRates, Holding } from "../../types/portfolio";

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

// ---------------------------------------------------------------------------
// Holding-level
// ---------------------------------------------------------------------------

export const holdingCost = (holding: Holding): number =>
  holding.quantity * holding.averagePrice;

export const holdingMarketValue = (holding: Holding): number =>
  holding.quantity * holding.marketPrice;

export const holdingGainLoss = (holding: Holding): number =>
  holdingMarketValue(holding) - holdingCost(holding);

export const holdingGainLossPct = (holding: Holding): number => {
  const cost = holdingCost(holding);
  return cost === 0 ? 0 : (holdingGainLoss(holding) / cost) * 100;
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
  reportingCurrency: Currency
): PortfolioTotals => {
  let currentValue = 0;
  let investedValue = 0;

  for (const holding of holdings) {
    currentValue += convert(holdingMarketValue(holding), holding.currency, reportingCurrency, rates);
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
  rates: FxRates,
  reportingCurrency: Currency
): SymbolAllocation[] => {
  const map = new Map<string, SymbolAllocation>();

  for (const holding of holdings) {
    const symbol = holding.symbol.toUpperCase();
    const current = convert(holdingMarketValue(holding), holding.currency, reportingCurrency, rates);
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
  const totalCurrent = items.reduce((sum, item) => sum + item.currentValue, 0);

  for (const item of items) {
    item.allocationPct = totalCurrent > 0 ? (item.currentValue / totalCurrent) * 100 : 0;
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
  reportingCurrency: Currency
): GeographicSplit => {
  let indiaValue = 0;
  let usValue = 0;

  for (const holding of holdings) {
    const value = convert(holdingMarketValue(holding), holding.currency, reportingCurrency, rates);
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
  reportingCurrency: Currency
): PortfolioSnapshot => {
  const allocations = calcSymbolAllocations(holdings, rates, reportingCurrency);
  return {
    totals: calcPortfolioTotals(holdings, cashHoldings, rates, reportingCurrency),
    allocations,
    topAllocations: topAllocations(allocations),
    geographicSplit: calcGeographicSplit(holdings, rates, reportingCurrency),
    concentration: calcConcentrationRisk(allocations),
  };
};


