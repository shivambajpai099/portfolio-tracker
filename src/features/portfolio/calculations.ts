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

// ---------------------------------------------------------------------------
// Per-Holding Performance History (Approach A: Transaction-dates only)
// ---------------------------------------------------------------------------

export interface HoldingPerformancePoint {
  /** ISO date string */
  date: string;
  /** Total cost basis (invested) at this point */
  invested: number;
  /** Current market value at this point (shares_held × market_price) */
  current: number;
}

export interface HoldingPerformanceHistory {
  /** Data points at each transaction date + today */
  points: HoldingPerformancePoint[];
  /** Currency of the values */
  currency: Currency;
  /** Symbol this history is for */
  symbol: string;
}

/**
 * Transaction input for performance calculation.
 * Requires transactionDate, type, quantity, and pricePerShare.
 */
export interface PerformanceTransaction {
  transactionDate: string;
  type: "BUY" | "SELL";
  quantity: number;
  pricePerShare: number;
}

/**
 * Calculates the performance history (invested vs current) for a single holding
 * based on its transaction history.
 * 
 * Uses average cost basis method:
 * - BUY: shares_held += qty, total_cost_basis += qty * price_paid
 * - SELL: reduce total_cost_basis by qty_sold * (total_cost_basis / shares_held),
 *         then reduce shares_held by qty_sold
 * 
 * At each transaction date, records:
 * - invested = total_cost_basis
 * - current = shares_held × market_price_at_that_date
 * 
 * For Approach A, we use pricePerShare as the market price at transaction date
 * (since we don't have historical market prices stored separately).
 * 
 * Finally, adds today's point using the current market price.
 * 
 * @param transactions - All transactions for this symbol, will be sorted by date
 * @param currentMarketPrice - Today's market price for the final data point
 * @param symbol - The ticker symbol
 * @param currency - The currency of the holding
 * @returns HoldingPerformanceHistory with points at each transaction date + today
 */
export const calcHoldingPerformanceHistory = (
  transactions: PerformanceTransaction[],
  currentMarketPrice: number,
  symbol: string,
  currency: Currency
): HoldingPerformanceHistory => {
  if (transactions.length === 0) {
    return { points: [], currency, symbol };
  }

  // Sort transactions by date ascending
  const sortedTxs = [...transactions].sort(
    (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
  );

  const points: HoldingPerformancePoint[] = [];
  let sharesHeld = 0;
  let totalCostBasis = 0;

  for (const tx of sortedTxs) {
    if (tx.type === "BUY") {
      sharesHeld += tx.quantity;
      totalCostBasis += tx.quantity * tx.pricePerShare;
    } else if (tx.type === "SELL") {
      if (sharesHeld > 0) {
        const avgCost = totalCostBasis / sharesHeld;
        // Reduce cost basis by avg cost of shares sold, NOT by sale proceeds
        totalCostBasis -= tx.quantity * avgCost;
        sharesHeld -= tx.quantity;
        
        // Prevent floating point errors from making values negative
        if (sharesHeld < 0.0001) {
          sharesHeld = 0;
          totalCostBasis = 0;
        }
        if (totalCostBasis < 0) {
          totalCostBasis = 0;
        }
      }
    }

    // For Approach A, use pricePerShare as the market price at transaction date
    // This is the best available approximation without historical price data
    const marketPriceAtDate = tx.pricePerShare;

    points.push({
      date: tx.transactionDate,
      invested: totalCostBasis,
      current: sharesHeld * marketPriceAtDate,
    });
  }

  // Add today's point using current market price (if we still have shares)
  const today = new Date().toISOString().split("T")[0] + "T00:00:00.000Z";
  const lastTxDate = sortedTxs[sortedTxs.length - 1].transactionDate.split("T")[0];
  const todayDateOnly = today.split("T")[0];

  // Only add today's point if it's different from the last transaction date
  if (lastTxDate !== todayDateOnly) {
    points.push({
      date: today,
      invested: totalCostBasis,
      current: sharesHeld * currentMarketPrice,
    });
  } else {
    // Update the last point with current market price
    if (points.length > 0) {
      points[points.length - 1].current = sharesHeld * currentMarketPrice;
    }
  }

  return { points, currency, symbol };
};

// ---------------------------------------------------------------------------
// Portfolio Performance History (aggregated Approach A across all holdings)
// ---------------------------------------------------------------------------

export type PortfolioPerformanceView = "monthly" | "quarterly" | "yearly";

/** A transaction input for the portfolio performance calculation. */
export interface PortfolioPerformanceTransaction {
  transactionDate: string;
  type: "BUY" | "SELL";
  quantity: number;
  pricePerShare: number;
  symbol: string;
  currency: Currency;
}

export interface PortfolioPerformancePoint {
  /** ISO date string (first day of the period) */
  date: string;
  /** Aggregated cost basis across all holdings in the reporting currency */
  investedAmount: number;
  /** Aggregated market value across all holdings in the reporting currency */
  currentValue: number;
}

/**
 * Calculates the portfolio-wide performance history (invested vs current) by
 * aggregating the SAME per-holding logic (see calcHoldingPerformanceHistory)
 * across every symbol.
 *
 * For each symbol we maintain running state using the average cost basis method:
 * - BUY: shares += qty, costBasis += qty × price
 * - SELL: reduce costBasis by qty × avgCost, then reduce shares
 *
 * At every transaction date the aggregate snapshot is recorded:
 * - invested = Σ costBasis (per symbol, converted to reporting currency)
 * - current  = Σ shares × mostRecentTxPrice (Approach A, converted)
 *
 * The trailing point (today's period) uses live market prices for `current`,
 * mirroring how the per-holding chart adds a final "today" point.
 *
 * Points are bucketed by period (monthly/quarterly/yearly) so the last
 * transaction within each period wins, matching the dashboard's time toggle.
 *
 * @param transactions - All transactions across all accounts/symbols
 * @param currentPrices - Map of UPPERCASE symbol → current market price (native currency)
 * @param fxRates - FX rates for currency conversion
 * @param reportingCurrency - Currency to express aggregated values in
 * @param view - Period bucketing granularity
 */
export const calcPortfolioPerformanceHistory = (
  transactions: PortfolioPerformanceTransaction[],
  currentPrices: Map<string, number>,
  fxRates: FxRates,
  reportingCurrency: Currency,
  view: PortfolioPerformanceView
): PortfolioPerformancePoint[] => {
  if (transactions.length === 0) return [];

  const sorted = [...transactions].sort(
    (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
  );

  interface SymbolState {
    shares: number;
    costBasis: number;
    lastPrice: number;
    currency: Currency;
  }
  const state = new Map<string, SymbolState>();

  const periodKey = (d: Date): string => {
    if (view === "monthly") {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    if (view === "quarterly") {
      return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    }
    return `${d.getFullYear()}`;
  };

  const periodDate = (key: string): string => {
    if (view === "monthly") {
      const [year, month] = key.split("-");
      return new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1).toISOString();
    }
    if (view === "quarterly") {
      const [year, q] = key.split("-Q");
      return new Date(parseInt(year, 10), (parseInt(q, 10) - 1) * 3, 1).toISOString();
    }
    return new Date(parseInt(key, 10), 0, 1).toISOString();
  };

  // Aggregate current invested + market value across every symbol, converting
  // each symbol's native values into the reporting currency.
  const aggregate = (): { invested: number; current: number } => {
    let invested = 0;
    let current = 0;
    for (const s of state.values()) {
      invested += convert(s.costBasis, s.currency, reportingCurrency, fxRates);
      current += convert(s.shares * s.lastPrice, s.currency, reportingCurrency, fxRates);
    }
    return { invested, current };
  };

  // Bucket by period; the last transaction in each period overwrites the value.
  const byPeriod = new Map<string, { invested: number; current: number }>();

  for (const tx of sorted) {
    const key = tx.symbol.toUpperCase();
    const s = state.get(key) ?? { shares: 0, costBasis: 0, lastPrice: 0, currency: tx.currency };

    if (tx.type === "BUY") {
      s.shares += tx.quantity;
      s.costBasis += tx.quantity * tx.pricePerShare;
    } else if (s.shares > 0) {
      const avgCost = s.costBasis / s.shares;
      s.costBasis -= tx.quantity * avgCost;
      s.shares -= tx.quantity;
      if (s.shares < 0.0001) {
        s.shares = 0;
        s.costBasis = 0;
      }
      if (s.costBasis < 0) {
        s.costBasis = 0;
      }
    }

    // Approach A: most recent transaction price approximates market price.
    s.lastPrice = tx.pricePerShare;
    s.currency = tx.currency;
    state.set(key, s);

    byPeriod.set(periodKey(new Date(tx.transactionDate)), aggregate());
  }

  const periods = [...byPeriod.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const points: PortfolioPerformancePoint[] = periods.map(([key, agg]) => ({
    date: periodDate(key),
    investedAmount: agg.invested,
    currentValue: agg.current,
  }));

  // Final "today" point: recompute `current` using live market prices.
  let liveInvested = 0;
  let liveCurrent = 0;
  for (const [key, s] of state.entries()) {
    liveInvested += convert(s.costBasis, s.currency, reportingCurrency, fxRates);
    const livePrice = currentPrices.get(key) ?? s.lastPrice;
    liveCurrent += convert(s.shares * livePrice, s.currency, reportingCurrency, fxRates);
  }

  const todayKey = periodKey(new Date());
  const lastKey = periods.length > 0 ? periods[periods.length - 1][0] : null;

  if (lastKey === todayKey && points.length > 0) {
    // Refresh the current period with live market values.
    points[points.length - 1].investedAmount = liveInvested;
    points[points.length - 1].currentValue = liveCurrent;
  } else {
    points.push({
      date: periodDate(todayKey),
      investedAmount: liveInvested,
      currentValue: liveCurrent,
    });
  }

  return points;
};

// Rebalancing/deploy-cash and snapshot/concentration helpers were removed with the Overview cleanup.

