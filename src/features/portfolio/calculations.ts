import type { AllocationBasis, CashHolding, Currency, FxRates, Holding, LivePriceCache } from "../../types/portfolio";

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

// Rebalancing/deploy-cash and snapshot/concentration helpers were removed with the Overview cleanup.


