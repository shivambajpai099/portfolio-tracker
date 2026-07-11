/**
 * Transaction Analytics Engine
 *
 * Provides comprehensive analytics derived from transaction history including:
 * - Investment journey metrics
 * - Capital deployment analytics
 * - Conviction analysis
 * - DCA insights
 * - Win/loss rate analysis
 * - Holding period analytics
 * - Portfolio evolution
 * - Behavior insights
 */

import type { Currency, FxRates, Holding } from "../../types/portfolio";
import type { Transaction, SellTransactionRealization } from "../../types/transaction";
import { convert } from "./calculations";

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

const sortTransactionsByDate = (transactions: Transaction[]): Transaction[] => {
  return [...transactions].sort((a, b) => {
    const dateA = new Date(a.transactionDate).getTime();
    const dateB = new Date(b.transactionDate).getTime();
    return dateA - dateB;
  });
};

const daysBetween = (startDate: string, endDate: string): number => {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
};

const monthKey = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
};

const yearKey = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return String(date.getFullYear());
};

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short" });
};

// ---------------------------------------------------------------------------
// 1. Investment Journey
// ---------------------------------------------------------------------------

export interface InvestmentJourney {
  firstInvestmentDate: string | null;
  lastInvestmentDate: string | null;
  totalTransactionCount: number;
  buyTransactionCount: number;
  sellTransactionCount: number;
  activeDurationDays: number;
  activeDurationYears: number;
  uniqueSymbolsOwned: number;
  uniqueSymbolsCurrentlyHeld: number;
}

export const calcInvestmentJourney = (
  transactions: Transaction[],
  currentHoldings: Holding[]
): InvestmentJourney => {
  if (transactions.length === 0) {
    return {
      firstInvestmentDate: null,
      lastInvestmentDate: null,
      totalTransactionCount: 0,
      buyTransactionCount: 0,
      sellTransactionCount: 0,
      activeDurationDays: 0,
      activeDurationYears: 0,
      uniqueSymbolsOwned: 0,
      uniqueSymbolsCurrentlyHeld: currentHoldings.length,
    };
  }

  const sorted = sortTransactionsByDate(transactions);
  const firstInvestmentDate = sorted[0].transactionDate;
  const lastInvestmentDate = sorted[sorted.length - 1].transactionDate;

  const buyTxs = transactions.filter((tx) => tx.type === "BUY");
  const sellTxs = transactions.filter((tx) => tx.type === "SELL");

  const uniqueSymbols = new Set<string>();
  for (const tx of transactions) {
    uniqueSymbols.add(tx.symbol.toUpperCase());
  }

  const currentSymbols = new Set<string>();
  for (const holding of currentHoldings) {
    currentSymbols.add(holding.symbol.toUpperCase());
  }

  const activeDurationDays = daysBetween(firstInvestmentDate, new Date().toISOString());
  const activeDurationYears = activeDurationDays / 365;

  return {
    firstInvestmentDate,
    lastInvestmentDate,
    totalTransactionCount: transactions.length,
    buyTransactionCount: buyTxs.length,
    sellTransactionCount: sellTxs.length,
    activeDurationDays,
    activeDurationYears,
    uniqueSymbolsOwned: uniqueSymbols.size,
    uniqueSymbolsCurrentlyHeld: currentSymbols.size,
  };
};

// ---------------------------------------------------------------------------
// 2. Capital Deployment Analytics
// ---------------------------------------------------------------------------

export interface MonthlyCapital {
  monthKey: string;
  monthLabel: string;
  invested: number;
  withdrawn: number;
  net: number;
  cumulativeInvested: number;
  transactionCount: number;
}

export interface CapitalDeployment {
  totalInvested: number;
  totalWithdrawn: number;
  netInvested: number;
  averageMonthlyInvestment: number;
  largestInvestmentMonth: { monthKey: string; monthLabel: string; amount: number } | null;
  largestSinglePurchase: { symbol: string; amount: number; date: string } | null;
  monthlyData: MonthlyCapital[];
  yearlyData: Array<{ year: string; invested: number; withdrawn: number; net: number }>;
  byAsset: Array<{ symbol: string; companyName: string; totalInvested: number; totalWithdrawn: number; net: number }>;
}

export const calcCapitalDeployment = (
  transactions: Transaction[],
  fxRates: FxRates,
  reportingCurrency: Currency
): CapitalDeployment => {
  if (transactions.length === 0) {
    return {
      totalInvested: 0,
      totalWithdrawn: 0,
      netInvested: 0,
      averageMonthlyInvestment: 0,
      largestInvestmentMonth: null,
      largestSinglePurchase: null,
      monthlyData: [],
      yearlyData: [],
      byAsset: [],
    };
  }

  const sorted = sortTransactionsByDate(transactions);
  const monthlyMap = new Map<string, MonthlyCapital>();
  const yearlyMap = new Map<string, { invested: number; withdrawn: number }>();
  const assetMap = new Map<string, { companyName: string; totalInvested: number; totalWithdrawn: number }>();

  let totalInvested = 0;
  let totalWithdrawn = 0;
  let largestPurchase: { symbol: string; amount: number; date: string } | null = null;

  for (const tx of sorted) {
    const amount = convert(tx.quantity * tx.pricePerShare, tx.currency, reportingCurrency, fxRates);
    const mk = monthKey(tx.transactionDate);
    const yk = yearKey(tx.transactionDate);
    const symbol = tx.symbol.toUpperCase();

    // Monthly aggregation
    if (!monthlyMap.has(mk)) {
      monthlyMap.set(mk, {
        monthKey: mk,
        monthLabel: formatDate(tx.transactionDate),
        invested: 0,
        withdrawn: 0,
        net: 0,
        cumulativeInvested: 0,
        transactionCount: 0,
      });
    }
    const monthly = monthlyMap.get(mk)!;
    monthly.transactionCount += 1;

    // Yearly aggregation
    if (!yearlyMap.has(yk)) {
      yearlyMap.set(yk, { invested: 0, withdrawn: 0 });
    }
    const yearly = yearlyMap.get(yk)!;

    // Asset aggregation
    if (!assetMap.has(symbol)) {
      assetMap.set(symbol, { companyName: tx.companyName, totalInvested: 0, totalWithdrawn: 0 });
    }
    const asset = assetMap.get(symbol)!;

    if (tx.type === "BUY") {
      totalInvested += amount;
      monthly.invested += amount;
      yearly.invested += amount;
      asset.totalInvested += amount;

      if (!largestPurchase || amount > largestPurchase.amount) {
        largestPurchase = { symbol, amount, date: tx.transactionDate };
      }
    } else {
      totalWithdrawn += amount;
      monthly.withdrawn += amount;
      yearly.withdrawn += amount;
      asset.totalWithdrawn += amount;
    }
  }

  // Calculate net and cumulative
  const monthKeys = [...monthlyMap.keys()].sort();
  let cumulative = 0;
  for (const mk of monthKeys) {
    const m = monthlyMap.get(mk)!;
    m.net = m.invested - m.withdrawn;
    cumulative += m.net;
    m.cumulativeInvested = cumulative;
  }

  // Find largest investment month
  let largestMonth: { monthKey: string; monthLabel: string; amount: number } | null = null;
  for (const m of monthlyMap.values()) {
    if (!largestMonth || m.invested > largestMonth.amount) {
      largestMonth = { monthKey: m.monthKey, monthLabel: m.monthLabel, amount: m.invested };
    }
  }

  const monthlyData = [...monthlyMap.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const activeMonths = monthlyData.filter((m) => m.invested > 0).length;
  const averageMonthlyInvestment = activeMonths > 0 ? totalInvested / activeMonths : 0;

  const yearlyData = [...yearlyMap.entries()]
    .map(([year, data]) => ({ year, ...data, net: data.invested - data.withdrawn }))
    .sort((a, b) => a.year.localeCompare(b.year));

  const byAsset = [...assetMap.entries()]
    .map(([symbol, data]) => ({
      symbol,
      companyName: data.companyName,
      totalInvested: data.totalInvested,
      totalWithdrawn: data.totalWithdrawn,
      net: data.totalInvested - data.totalWithdrawn,
    }))
    .sort((a, b) => b.totalInvested - a.totalInvested);

  return {
    totalInvested,
    totalWithdrawn,
    netInvested: totalInvested - totalWithdrawn,
    averageMonthlyInvestment,
    largestInvestmentMonth: largestMonth,
    largestSinglePurchase: largestPurchase,
    monthlyData,
    yearlyData,
    byAsset,
  };
};

// ---------------------------------------------------------------------------
// 3. Conviction Analysis
// ---------------------------------------------------------------------------

export interface ConvictionPosition {
  symbol: string;
  companyName: string;
  purchaseCount: number;
  totalInvested: number;
  averageHoldingPeriodDays: number;
  currentValue: number;
  unrealizedGainLoss: number;
  unrealizedGainLossPct: number;
  isCurrentlyHeld: boolean;
}

export interface ConvictionAnalysis {
  topConvictionHoldings: ConvictionPosition[];
  mostAccumulatedPositions: ConvictionPosition[];
  totalPositionsEverOwned: number;
  averagePurchasesPerPosition: number;
}

export const calcConvictionAnalysis = (
  transactions: Transaction[],
  currentHoldings: Holding[],
  fxRates: FxRates,
  reportingCurrency: Currency
): ConvictionAnalysis => {
  if (transactions.length === 0) {
    return {
      topConvictionHoldings: [],
      mostAccumulatedPositions: [],
      totalPositionsEverOwned: 0,
      averagePurchasesPerPosition: 0,
    };
  }

  const positionMap = new Map<string, {
    companyName: string;
    purchaseCount: number;
    totalInvested: number;
    purchaseDates: string[];
  }>();

  const buyTxs = transactions.filter((tx) => tx.type === "BUY");

  for (const tx of buyTxs) {
    const symbol = tx.symbol.toUpperCase();
    const amount = convert(tx.quantity * tx.pricePerShare, tx.currency, reportingCurrency, fxRates);

    if (!positionMap.has(symbol)) {
      positionMap.set(symbol, {
        companyName: tx.companyName,
        purchaseCount: 0,
        totalInvested: 0,
        purchaseDates: [],
      });
    }

    const pos = positionMap.get(symbol)!;
    pos.purchaseCount += 1;
    pos.totalInvested += amount;
    pos.purchaseDates.push(tx.transactionDate);
  }

  // Map current holdings for value lookup
  const holdingMap = new Map<string, Holding>();
  for (const holding of currentHoldings) {
    holdingMap.set(holding.symbol.toUpperCase(), holding);
  }

  const positions: ConvictionPosition[] = [];
  for (const [symbol, data] of positionMap.entries()) {
    const holding = holdingMap.get(symbol);
    const currentValue = holding
      ? convert(holding.quantity * holding.marketPrice, holding.currency, reportingCurrency, fxRates)
      : 0;
    const investedValue = holding
      ? convert(holding.quantity * holding.averagePrice, holding.currency, reportingCurrency, fxRates)
      : 0;

    // Calculate average holding period (from purchases to now or sell)
    const sortedDates = data.purchaseDates.sort();
    const now = new Date().toISOString();
    const avgHoldingDays = sortedDates.reduce((sum, date) => sum + daysBetween(date, now), 0) / sortedDates.length;

    positions.push({
      symbol,
      companyName: data.companyName,
      purchaseCount: data.purchaseCount,
      totalInvested: data.totalInvested,
      averageHoldingPeriodDays: avgHoldingDays,
      currentValue,
      unrealizedGainLoss: currentValue - investedValue,
      unrealizedGainLossPct: investedValue > 0 ? ((currentValue - investedValue) / investedValue) * 100 : 0,
      isCurrentlyHeld: Boolean(holding && holding.quantity > 0),
    });
  }

  const topByPurchaseCount = [...positions].sort((a, b) => b.purchaseCount - a.purchaseCount).slice(0, 10);
  const topByInvestedAmount = [...positions].sort((a, b) => b.totalInvested - a.totalInvested).slice(0, 10);

  const totalPositions = positions.length;
  const totalPurchases = buyTxs.length;
  const avgPurchasesPerPosition = totalPositions > 0 ? totalPurchases / totalPositions : 0;

  return {
    topConvictionHoldings: topByPurchaseCount,
    mostAccumulatedPositions: topByInvestedAmount,
    totalPositionsEverOwned: totalPositions,
    averagePurchasesPerPosition: avgPurchasesPerPosition,
  };
};

// ---------------------------------------------------------------------------
// 4. DCA (Dollar Cost Averaging) Insights
// ---------------------------------------------------------------------------

export interface DCAPosition {
  symbol: string;
  companyName: string;
  currency: Currency;
  purchaseCount: number;
  totalSharesBought: number;
  totalAmountInvested: number;
  averageBuyPrice: number;
  lowestBuyPrice: number;
  highestBuyPrice: number;
  currentMarketPrice: number;
  gainLossVsAvgCost: number;
  gainLossVsAvgCostPct: number;
  purchaseHistory: Array<{ date: string; price: number; quantity: number; amount: number }>;
}

export interface DCAInsights {
  positions: DCAPosition[];
  totalPositionsWithMultipleBuys: number;
  averageBuysPerPosition: number;
}

export const calcDCAInsights = (
  transactions: Transaction[],
  currentHoldings: Holding[],
  fxRates: FxRates,
  reportingCurrency: Currency
): DCAInsights => {
  if (transactions.length === 0) {
    return {
      positions: [],
      totalPositionsWithMultipleBuys: 0,
      averageBuysPerPosition: 0,
    };
  }

  const positionMap = new Map<string, DCAPosition>();
  const buyTxs = transactions.filter((tx) => tx.type === "BUY");

  // Map current holdings for market price lookup
  const holdingMap = new Map<string, Holding>();
  for (const holding of currentHoldings) {
    holdingMap.set(holding.symbol.toUpperCase(), holding);
  }

  for (const tx of buyTxs) {
    const symbol = tx.symbol.toUpperCase();
    const holding = holdingMap.get(symbol);
    const currentMarketPrice = holding?.marketPrice ?? tx.pricePerShare;

    if (!positionMap.has(symbol)) {
      positionMap.set(symbol, {
        symbol,
        companyName: tx.companyName,
        currency: tx.currency,
        purchaseCount: 0,
        totalSharesBought: 0,
        totalAmountInvested: 0,
        averageBuyPrice: 0,
        lowestBuyPrice: tx.pricePerShare,
        highestBuyPrice: tx.pricePerShare,
        currentMarketPrice,
        gainLossVsAvgCost: 0,
        gainLossVsAvgCostPct: 0,
        purchaseHistory: [],
      });
    }

    const pos = positionMap.get(symbol)!;
    pos.purchaseCount += 1;
    pos.totalSharesBought += tx.quantity;
    pos.totalAmountInvested += tx.quantity * tx.pricePerShare;
    pos.lowestBuyPrice = Math.min(pos.lowestBuyPrice, tx.pricePerShare);
    pos.highestBuyPrice = Math.max(pos.highestBuyPrice, tx.pricePerShare);
    pos.currentMarketPrice = currentMarketPrice;
    pos.purchaseHistory.push({
      date: tx.transactionDate,
      price: tx.pricePerShare,
      quantity: tx.quantity,
      amount: tx.quantity * tx.pricePerShare,
    });
  }

  // Calculate averages and gain/loss
  const positions: DCAPosition[] = [];
  for (const pos of positionMap.values()) {
    pos.averageBuyPrice = pos.totalSharesBought > 0 ? pos.totalAmountInvested / pos.totalSharesBought : 0;
    pos.gainLossVsAvgCost = pos.currentMarketPrice - pos.averageBuyPrice;
    pos.gainLossVsAvgCostPct = pos.averageBuyPrice > 0
      ? ((pos.currentMarketPrice - pos.averageBuyPrice) / pos.averageBuyPrice) * 100
      : 0;
    pos.purchaseHistory.sort((a, b) => a.date.localeCompare(b.date));
    positions.push(pos);
  }

  positions.sort((a, b) => b.purchaseCount - a.purchaseCount);

  const multiplebuysPositions = positions.filter((p) => p.purchaseCount > 1);
  const totalBuys = buyTxs.length;
  const avgBuysPerPosition = positions.length > 0 ? totalBuys / positions.length : 0;

  return {
    positions,
    totalPositionsWithMultipleBuys: multiplebuysPositions.length,
    averageBuysPerPosition: avgBuysPerPosition,
  };
};

// ---------------------------------------------------------------------------
// 5. Realized vs Unrealized Performance
// ---------------------------------------------------------------------------

export interface PerformanceBreakdown {
  realizedGains: number;
  realizedLosses: number;
  netRealized: number;
  unrealizedGains: number;
  unrealizedLosses: number;
  netUnrealized: number;
  totalReturn: number;
  byAsset: Array<{
    symbol: string;
    companyName: string;
    realizedGainLoss: number;
    unrealizedGainLoss: number;
    totalReturn: number;
    currentValue: number;
  }>;
}

export const calcPerformanceBreakdown = (
  transactions: Transaction[],
  currentHoldings: Holding[],
  realizations: SellTransactionRealization[],
  fxRates: FxRates,
  reportingCurrency: Currency
): PerformanceBreakdown => {
  // Sum realized gains/losses from all realizations
  let realizedGains = 0;
  let realizedLosses = 0;

  const symbolRealized = new Map<string, number>();

  for (const realization of realizations) {
    const tx = transactions.find((t) => t.id === realization.sellTransactionId);
    const currency = tx?.currency ?? "USD";
    const gl = convert(realization.totalRealizedGainLoss, currency, reportingCurrency, fxRates);
    const symbol = tx?.symbol.toUpperCase() ?? "UNKNOWN";

    symbolRealized.set(symbol, (symbolRealized.get(symbol) ?? 0) + gl);

    if (gl >= 0) {
      realizedGains += gl;
    } else {
      realizedLosses += Math.abs(gl);
    }
  }

  // Calculate unrealized from current holdings
  let unrealizedGains = 0;
  let unrealizedLosses = 0;

  const holdingData = new Map<string, { companyName: string; currentValue: number; unrealized: number }>();

  for (const holding of currentHoldings) {
    const symbol = holding.symbol.toUpperCase();
    const currentValue = convert(holding.quantity * holding.marketPrice, holding.currency, reportingCurrency, fxRates);
    const costBasis = convert(holding.quantity * holding.averagePrice, holding.currency, reportingCurrency, fxRates);
    const unrealized = currentValue - costBasis;

    holdingData.set(symbol, {
      companyName: holding.companyName,
      currentValue,
      unrealized,
    });

    if (unrealized >= 0) {
      unrealizedGains += unrealized;
    } else {
      unrealizedLosses += Math.abs(unrealized);
    }
  }

  // Build byAsset combining realized and unrealized
  const allSymbols = new Set([...symbolRealized.keys(), ...holdingData.keys()]);
  const byAsset: PerformanceBreakdown["byAsset"] = [];

  for (const symbol of allSymbols) {
    const realized = symbolRealized.get(symbol) ?? 0;
    const holdInfo = holdingData.get(symbol);
    const unrealized = holdInfo?.unrealized ?? 0;
    const companyName = holdInfo?.companyName ?? symbol;
    const currentValue = holdInfo?.currentValue ?? 0;

    byAsset.push({
      symbol,
      companyName,
      realizedGainLoss: realized,
      unrealizedGainLoss: unrealized,
      totalReturn: realized + unrealized,
      currentValue,
    });
  }

  byAsset.sort((a, b) => b.totalReturn - a.totalReturn);

  return {
    realizedGains,
    realizedLosses,
    netRealized: realizedGains - realizedLosses,
    unrealizedGains,
    unrealizedLosses,
    netUnrealized: unrealizedGains - unrealizedLosses,
    totalReturn: realizedGains - realizedLosses + unrealizedGains - unrealizedLosses,
    byAsset,
  };
};

// ---------------------------------------------------------------------------
// 6. Win Rate Analysis (Closed Lots)
// ---------------------------------------------------------------------------

export interface ClosedTrade {
  symbol: string;
  companyName: string;
  buyDate: string;
  sellDate: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  gainLoss: number;
  gainLossPct: number;
  holdingPeriodDays: number;
  isWin: boolean;
}

export interface WinRateAnalysis {
  totalClosedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  largestWin: ClosedTrade | null;
  largestLoss: ClosedTrade | null;
  closedTrades: ClosedTrade[];
  totalProfit: number;
  totalLoss: number;
  profitFactor: number;
}

export const calcWinRateAnalysis = (
  transactions: Transaction[],
  realizations: SellTransactionRealization[],
  fxRates: FxRates,
  reportingCurrency: Currency
): WinRateAnalysis => {
  if (realizations.length === 0) {
    return {
      totalClosedTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      largestWin: null,
      largestLoss: null,
      closedTrades: [],
      totalProfit: 0,
      totalLoss: 0,
      profitFactor: 0,
    };
  }

  // Build transaction lookup
  const txMap = new Map<string, Transaction>();
  for (const tx of transactions) {
    txMap.set(tx.id, tx);
  }

  const closedTrades: ClosedTrade[] = [];

  for (const realization of realizations) {
    const sellTx = txMap.get(realization.sellTransactionId);
    if (!sellTx) continue;

    // For each lot consumption, create a closed trade record
    for (const consumption of realization.lotConsumptions) {
      const buyTx = txMap.get(consumption.lotTransactionId);
      if (!buyTx) continue;

      const gainLoss = convert(consumption.realizedGainLoss, sellTx.currency, reportingCurrency, fxRates);
      const buyValue = convert(consumption.quantityConsumed * consumption.costBasisPerShare, sellTx.currency, reportingCurrency, fxRates);
      const gainLossPct = buyValue > 0 ? (gainLoss / buyValue) * 100 : 0;
      const holdingPeriodDays = daysBetween(buyTx.transactionDate, sellTx.transactionDate);

      closedTrades.push({
        symbol: sellTx.symbol.toUpperCase(),
        companyName: sellTx.companyName,
        buyDate: buyTx.transactionDate,
        sellDate: sellTx.transactionDate,
        quantity: consumption.quantityConsumed,
        buyPrice: consumption.costBasisPerShare,
        sellPrice: consumption.salePricePerShare,
        gainLoss,
        gainLossPct,
        holdingPeriodDays,
        isWin: gainLoss >= 0,
      });
    }
  }

  const winningTrades = closedTrades.filter((t) => t.isWin);
  const losingTrades = closedTrades.filter((t) => !t.isWin);

  const totalProfit = winningTrades.reduce((sum, t) => sum + t.gainLoss, 0);
  const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.gainLoss, 0));
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
  const averageWin = winningTrades.length > 0 ? totalProfit / winningTrades.length : 0;
  const averageLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;

  const sortedByGain = [...closedTrades].sort((a, b) => b.gainLoss - a.gainLoss);
  const largestWin = sortedByGain.find((t) => t.isWin) ?? null;
  const largestLoss = sortedByGain.reverse().find((t) => !t.isWin) ?? null;

  return {
    totalClosedTrades: closedTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    averageWin,
    averageLoss,
    largestWin,
    largestLoss,
    closedTrades,
    totalProfit,
    totalLoss,
    profitFactor,
  };
};

// ---------------------------------------------------------------------------
// 7. Holding Period Analytics
// ---------------------------------------------------------------------------

export interface HoldingPeriodPosition {
  symbol: string;
  companyName: string;
  holdingDays: number;
  holdingYears: number;
  firstPurchaseDate: string;
  isActive: boolean;
}

export interface HoldingPeriodAnalytics {
  averageHoldingPeriodDays: number;
  longestHeldPosition: HoldingPeriodPosition | null;
  shortestHeldPosition: HoldingPeriodPosition | null;
  newestPosition: HoldingPeriodPosition | null;
  oldestPosition: HoldingPeriodPosition | null;
  averageAgeOfCurrentPortfolioDays: number;
  positionsByAge: HoldingPeriodPosition[];
  holdingDurationDistribution: {
    lessThan30Days: number;
    days30to90: number;
    days90to180: number;
    days180to365: number;
    moreThan365: number;
  };
}

export const calcHoldingPeriodAnalytics = (
  transactions: Transaction[],
  currentHoldings: Holding[],
  closedTrades: ClosedTrade[]
): HoldingPeriodAnalytics => {
  const now = new Date().toISOString();
  const positions: HoldingPeriodPosition[] = [];

  // Current holdings - calculate from first purchase date
  const firstPurchaseMap = new Map<string, string>();
  const buyTxs = transactions.filter((tx) => tx.type === "BUY");
  
  for (const tx of buyTxs) {
    const symbol = tx.symbol.toUpperCase();
    const existing = firstPurchaseMap.get(symbol);
    if (!existing || tx.transactionDate < existing) {
      firstPurchaseMap.set(symbol, tx.transactionDate);
    }
  }

  // Active positions
  for (const holding of currentHoldings) {
    const symbol = holding.symbol.toUpperCase();
    const firstPurchase = firstPurchaseMap.get(symbol) ?? holding.asOf ?? now;
    const holdingDays = daysBetween(firstPurchase, now);

    positions.push({
      symbol,
      companyName: holding.companyName,
      holdingDays,
      holdingYears: holdingDays / 365,
      firstPurchaseDate: firstPurchase,
      isActive: true,
    });
  }

  // Closed positions - use average holding period from closed trades
  const closedBySymbol = new Map<string, { totalDays: number; count: number; lastSellDate: string; companyName: string }>();
  for (const trade of closedTrades) {
    const symbol = trade.symbol;
    if (!closedBySymbol.has(symbol)) {
      closedBySymbol.set(symbol, { totalDays: 0, count: 0, lastSellDate: trade.sellDate, companyName: trade.companyName });
    }
    const entry = closedBySymbol.get(symbol)!;
    entry.totalDays += trade.holdingPeriodDays;
    entry.count += 1;
    if (trade.sellDate > entry.lastSellDate) {
      entry.lastSellDate = trade.sellDate;
    }
  }

  // For closed-only positions (not currently held)
  const activeSymbols = new Set(currentHoldings.map((h) => h.symbol.toUpperCase()));
  for (const [symbol, data] of closedBySymbol.entries()) {
    if (!activeSymbols.has(symbol)) {
      const avgDays = data.count > 0 ? data.totalDays / data.count : 0;
      positions.push({
        symbol,
        companyName: data.companyName,
        holdingDays: avgDays,
        holdingYears: avgDays / 365,
        firstPurchaseDate: firstPurchaseMap.get(symbol) ?? data.lastSellDate,
        isActive: false,
      });
    }
  }

  // Calculate metrics
  const activePositions = positions.filter((p) => p.isActive);
  const allHoldingDays = positions.map((p) => p.holdingDays);
  const avgHoldingDays = allHoldingDays.length > 0
    ? allHoldingDays.reduce((a, b) => a + b, 0) / allHoldingDays.length
    : 0;

  const avgAgeCurrentPortfolio = activePositions.length > 0
    ? activePositions.reduce((sum, p) => sum + p.holdingDays, 0) / activePositions.length
    : 0;

  const sortedByDays = [...positions].sort((a, b) => b.holdingDays - a.holdingDays);
  const longestHeld = sortedByDays[0] ?? null;
  const shortestHeld = sortedByDays[sortedByDays.length - 1] ?? null;

  const sortedByDate = [...activePositions].sort((a, b) => a.firstPurchaseDate.localeCompare(b.firstPurchaseDate));
  const oldestPosition = sortedByDate[0] ?? null;
  const newestPosition = sortedByDate[sortedByDate.length - 1] ?? null;

  // Distribution
  const distribution = {
    lessThan30Days: positions.filter((p) => p.holdingDays < 30).length,
    days30to90: positions.filter((p) => p.holdingDays >= 30 && p.holdingDays < 90).length,
    days90to180: positions.filter((p) => p.holdingDays >= 90 && p.holdingDays < 180).length,
    days180to365: positions.filter((p) => p.holdingDays >= 180 && p.holdingDays < 365).length,
    moreThan365: positions.filter((p) => p.holdingDays >= 365).length,
  };

  return {
    averageHoldingPeriodDays: avgHoldingDays,
    longestHeldPosition: longestHeld,
    shortestHeldPosition: shortestHeld,
    newestPosition,
    oldestPosition,
    averageAgeOfCurrentPortfolioDays: avgAgeCurrentPortfolio,
    positionsByAge: sortedByDays,
    holdingDurationDistribution: distribution,
  };
};

// ---------------------------------------------------------------------------
// 8. Portfolio Evolution
// ---------------------------------------------------------------------------

export interface PortfolioStateAtDate {
  date: string;
  holdings: Array<{
    symbol: string;
    quantity: number;
    costBasis: number;
    allocationPct: number;
  }>;
  totalInvestedCapital: number;
  totalCostBasis: number;
}

export interface PortfolioEvolution {
  snapshots: PortfolioStateAtDate[];
  yearlyAllocations: Array<{
    year: string;
    topHoldings: Array<{ symbol: string; allocationPct: number }>;
  }>;
}

export const calcPortfolioEvolution = (
  transactions: Transaction[],
  fxRates: FxRates,
  reportingCurrency: Currency
): PortfolioEvolution => {
  if (transactions.length === 0) {
    return { snapshots: [], yearlyAllocations: [] };
  }

  const sorted = sortTransactionsByDate(transactions);
  
  // Track positions over time
  type PositionState = {
    quantity: number;
    totalCost: number;
    lots: Array<{ quantity: number; cost: number; date: string }>;
  };

  const positions = new Map<string, PositionState>();
  const snapshots: PortfolioStateAtDate[] = [];
  let currentYear = "";
  let totalInvested = 0;

  for (const tx of sorted) {
    const symbol = tx.symbol.toUpperCase();
    const amount = convert(tx.quantity * tx.pricePerShare, tx.currency, reportingCurrency, fxRates);

    if (!positions.has(symbol)) {
      positions.set(symbol, { quantity: 0, totalCost: 0, lots: [] });
    }
    const pos = positions.get(symbol)!;

    if (tx.type === "BUY") {
      pos.quantity += tx.quantity;
      pos.totalCost += amount;
      pos.lots.push({ quantity: tx.quantity, cost: amount, date: tx.transactionDate });
      totalInvested += amount;
    } else {
      // SELL - consume lots FIFO
      let remaining = tx.quantity;
      while (remaining > 0 && pos.lots.length > 0) {
        const lot = pos.lots[0];
        if (lot.quantity <= remaining) {
          remaining -= lot.quantity;
          pos.quantity -= lot.quantity;
          pos.totalCost -= lot.cost;
          pos.lots.shift();
        } else {
          const fraction = remaining / lot.quantity;
          const costRemoved = lot.cost * fraction;
          lot.quantity -= remaining;
          lot.cost -= costRemoved;
          pos.quantity -= remaining;
          pos.totalCost -= costRemoved;
          remaining = 0;
        }
      }
    }

    // Create yearly snapshots
    const txYear = yearKey(tx.transactionDate);
    if (txYear !== currentYear) {
      currentYear = txYear;
      
      // Calculate total cost basis for allocation calculation
      let totalCostBasis = 0;
      const holdingsArray: PortfolioStateAtDate["holdings"] = [];
      
      for (const [, posState] of positions.entries()) {
        if (posState.quantity > 0) {
          totalCostBasis += posState.totalCost;
        }
      }

      for (const [sym, posState] of positions.entries()) {
        if (posState.quantity > 0) {
          holdingsArray.push({
            symbol: sym,
            quantity: posState.quantity,
            costBasis: posState.totalCost,
            allocationPct: totalCostBasis > 0 ? (posState.totalCost / totalCostBasis) * 100 : 0,
          });
        }
      }

      holdingsArray.sort((a, b) => b.allocationPct - a.allocationPct);

      snapshots.push({
        date: tx.transactionDate,
        holdings: holdingsArray,
        totalInvestedCapital: totalInvested,
        totalCostBasis,
      });
    }
  }

  // Build yearly allocations summary
  const yearlyAllocations = snapshots.map((snapshot) => ({
    year: yearKey(snapshot.date),
    topHoldings: snapshot.holdings.slice(0, 5).map((h) => ({
      symbol: h.symbol,
      allocationPct: h.allocationPct,
    })),
  }));

  return { snapshots, yearlyAllocations };
};

// ---------------------------------------------------------------------------
// 9. Investor Behavior Insights
// ---------------------------------------------------------------------------

export interface BehaviorInsight {
  type: "streak" | "pattern" | "preference" | "milestone";
  title: string;
  description: string;
  value?: number | string;
}

export interface InvestorBehaviorInsights {
  insights: BehaviorInsight[];
  mostFrequentlyPurchasedStock: { symbol: string; count: number } | null;
  mostFrequentlySoldStock: { symbol: string; count: number } | null;
  averageTradeSize: number;
  medianTradeSize: number;
  largestTrade: { symbol: string; amount: number; date: string; type: "BUY" | "SELL" } | null;
  smallestTrade: { symbol: string; amount: number; date: string; type: "BUY" | "SELL" } | null;
  consecutiveInvestingMonths: number;
  tradeSizeDistribution: {
    under100: number;
    from100to500: number;
    from500to1000: number;
    from1000to5000: number;
    over5000: number;
  };
  preferredTradingDayOfWeek: { day: string; count: number } | null;
}

export const calcInvestorBehaviorInsights = (
  transactions: Transaction[],
  fxRates: FxRates,
  reportingCurrency: Currency
): InvestorBehaviorInsights => {
  if (transactions.length === 0) {
    return {
      insights: [],
      mostFrequentlyPurchasedStock: null,
      mostFrequentlySoldStock: null,
      averageTradeSize: 0,
      medianTradeSize: 0,
      largestTrade: null,
      smallestTrade: null,
      consecutiveInvestingMonths: 0,
      tradeSizeDistribution: { under100: 0, from100to500: 0, from500to1000: 0, from1000to5000: 0, over5000: 0 },
      preferredTradingDayOfWeek: null,
    };
  }

  const insights: BehaviorInsight[] = [];
  
  // Trade sizes
  const tradeSizes = transactions.map((tx) => 
    convert(tx.quantity * tx.pricePerShare, tx.currency, reportingCurrency, fxRates)
  );
  tradeSizes.sort((a, b) => a - b);
  
  const avgTradeSize = tradeSizes.reduce((a, b) => a + b, 0) / tradeSizes.length;
  const medianTradeSize = tradeSizes[Math.floor(tradeSizes.length / 2)] ?? 0;

  // Largest and smallest trades
  let largestTrade: InvestorBehaviorInsights["largestTrade"] = null;
  let smallestTrade: InvestorBehaviorInsights["smallestTrade"] = null;
  
  for (const tx of transactions) {
    const amount = convert(tx.quantity * tx.pricePerShare, tx.currency, reportingCurrency, fxRates);
    if (!largestTrade || amount > largestTrade.amount) {
      largestTrade = { symbol: tx.symbol, amount, date: tx.transactionDate, type: tx.type };
    }
    if (!smallestTrade || amount < smallestTrade.amount) {
      smallestTrade = { symbol: tx.symbol, amount, date: tx.transactionDate, type: tx.type };
    }
  }

  // Most frequently traded stocks
  const buyCount = new Map<string, number>();
  const sellCount = new Map<string, number>();
  
  for (const tx of transactions) {
    const symbol = tx.symbol.toUpperCase();
    if (tx.type === "BUY") {
      buyCount.set(symbol, (buyCount.get(symbol) ?? 0) + 1);
    } else {
      sellCount.set(symbol, (sellCount.get(symbol) ?? 0) + 1);
    }
  }

  let mostPurchased: { symbol: string; count: number } | null = null;
  for (const [symbol, count] of buyCount.entries()) {
    if (!mostPurchased || count > mostPurchased.count) {
      mostPurchased = { symbol, count };
    }
  }

  let mostSold: { symbol: string; count: number } | null = null;
  for (const [symbol, count] of sellCount.entries()) {
    if (!mostSold || count > mostSold.count) {
      mostSold = { symbol, count };
    }
  }

  // Consecutive investing months
  const monthSet = new Set<string>();
  for (const tx of transactions) {
    if (tx.type === "BUY") {
      monthSet.add(monthKey(tx.transactionDate));
    }
  }
  
  const sortedMonths = [...monthSet].sort();
  let maxConsecutive = 0;
  let currentConsecutive = 1;
  
  for (let i = 1; i < sortedMonths.length; i++) {
    const [prevYear, prevMonth] = sortedMonths[i - 1].split("-").map(Number);
    const [currYear, currMonth] = sortedMonths[i].split("-").map(Number);
    
    const expectedMonth = prevMonth === 12 ? 1 : prevMonth + 1;
    const expectedYear = prevMonth === 12 ? prevYear + 1 : prevYear;
    
    if (currYear === expectedYear && currMonth === expectedMonth) {
      currentConsecutive += 1;
    } else {
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      currentConsecutive = 1;
    }
  }
  maxConsecutive = Math.max(maxConsecutive, currentConsecutive);

  // Trade size distribution
  const distribution = {
    under100: tradeSizes.filter((s) => s < 100).length,
    from100to500: tradeSizes.filter((s) => s >= 100 && s < 500).length,
    from500to1000: tradeSizes.filter((s) => s >= 500 && s < 1000).length,
    from1000to5000: tradeSizes.filter((s) => s >= 1000 && s < 5000).length,
    over5000: tradeSizes.filter((s) => s >= 5000).length,
  };

  // Preferred trading day
  const dayCount = new Map<string, number>();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  for (const tx of transactions) {
    const day = days[new Date(tx.transactionDate).getDay()];
    dayCount.set(day, (dayCount.get(day) ?? 0) + 1);
  }

  let preferredDay: { day: string; count: number } | null = null;
  for (const [day, count] of dayCount.entries()) {
    if (!preferredDay || count > preferredDay.count) {
      preferredDay = { day, count };
    }
  }

  // Generate insights
  if (maxConsecutive >= 12) {
    insights.push({
      type: "streak",
      title: "Consistent Investor",
      description: `You invested every month for ${maxConsecutive} consecutive months.`,
      value: maxConsecutive,
    });
  } else if (maxConsecutive >= 6) {
    insights.push({
      type: "streak",
      title: "Building Momentum",
      description: `You maintained a ${maxConsecutive}-month investing streak.`,
      value: maxConsecutive,
    });
  }

  const under300Pct = (distribution.under100 + distribution.from100to500) / transactions.length * 100;
  if (under300Pct >= 90) {
    insights.push({
      type: "pattern",
      title: "Steady Saver",
      description: `${under300Pct.toFixed(0)}% of your purchases were under $500.`,
      value: under300Pct,
    });
  }

  if (mostPurchased && mostPurchased.count >= 10) {
    insights.push({
      type: "preference",
      title: "High Conviction",
      description: `You purchased ${mostPurchased.symbol} ${mostPurchased.count} times, showing strong conviction.`,
      value: mostPurchased.count,
    });
  }

  insights.push({
    type: "pattern",
    title: "Average Trade Size",
    description: `Your average trade size is ${reportingCurrency === "INR" ? "₹" : "$"}${avgTradeSize.toFixed(0)}.`,
    value: avgTradeSize,
  });

  return {
    insights,
    mostFrequentlyPurchasedStock: mostPurchased,
    mostFrequentlySoldStock: mostSold,
    averageTradeSize: avgTradeSize,
    medianTradeSize,
    largestTrade,
    smallestTrade,
    consecutiveInvestingMonths: maxConsecutive,
    tradeSizeDistribution: distribution,
    preferredTradingDayOfWeek: preferredDay,
  };
};

// ---------------------------------------------------------------------------
// 10. Best and Worst Investments
// ---------------------------------------------------------------------------

export interface InvestmentPerformance {
  symbol: string;
  companyName: string;
  totalInvested: number;
  currentValue: number;
  totalReturn: number;
  totalReturnPct: number;
  isActive: boolean;
  realizedGainLoss: number;
  unrealizedGainLoss: number;
}

export interface BestWorstInvestments {
  bestInvestment: InvestmentPerformance | null;
  worstInvestment: InvestmentPerformance | null;
  topWinners: InvestmentPerformance[];
  topLosers: InvestmentPerformance[];
  allPerformances: InvestmentPerformance[];
}

export const calcBestWorstInvestments = (
  transactions: Transaction[],
  currentHoldings: Holding[],
  realizations: SellTransactionRealization[],
  fxRates: FxRates,
  reportingCurrency: Currency
): BestWorstInvestments => {
  if (transactions.length === 0) {
    return {
      bestInvestment: null,
      worstInvestment: null,
      topWinners: [],
      topLosers: [],
      allPerformances: [],
    };
  }

  // Aggregate by symbol
  const performanceMap = new Map<string, {
    companyName: string;
    totalInvested: number;
    currentValue: number;
    realizedGainLoss: number;
    unrealizedGainLoss: number;
    isActive: boolean;
  }>();

  // Track investments
  const buyTxs = transactions.filter((tx) => tx.type === "BUY");
  for (const tx of buyTxs) {
    const symbol = tx.symbol.toUpperCase();
    const amount = convert(tx.quantity * tx.pricePerShare, tx.currency, reportingCurrency, fxRates);
    
    if (!performanceMap.has(symbol)) {
      performanceMap.set(symbol, {
        companyName: tx.companyName,
        totalInvested: 0,
        currentValue: 0,
        realizedGainLoss: 0,
        unrealizedGainLoss: 0,
        isActive: false,
      });
    }
    performanceMap.get(symbol)!.totalInvested += amount;
  }

  // Add realized gains
  const txMap = new Map<string, Transaction>();
  for (const tx of transactions) {
    txMap.set(tx.id, tx);
  }

  for (const realization of realizations) {
    const tx = txMap.get(realization.sellTransactionId);
    if (!tx) continue;
    const symbol = tx.symbol.toUpperCase();
    const gl = convert(realization.totalRealizedGainLoss, tx.currency, reportingCurrency, fxRates);
    
    if (performanceMap.has(symbol)) {
      performanceMap.get(symbol)!.realizedGainLoss += gl;
    }
  }

  // Add current holdings value
  for (const holding of currentHoldings) {
    const symbol = holding.symbol.toUpperCase();
    const currentValue = convert(holding.quantity * holding.marketPrice, holding.currency, reportingCurrency, fxRates);
    const costBasis = convert(holding.quantity * holding.averagePrice, holding.currency, reportingCurrency, fxRates);
    const unrealized = currentValue - costBasis;

    if (performanceMap.has(symbol)) {
      const perf = performanceMap.get(symbol)!;
      perf.currentValue = currentValue;
      perf.unrealizedGainLoss = unrealized;
      perf.isActive = true;
    }
  }

  // Build performance array
  const allPerformances: InvestmentPerformance[] = [];
  for (const [symbol, data] of performanceMap.entries()) {
    const totalReturn = data.realizedGainLoss + data.unrealizedGainLoss;
    const totalReturnPct = data.totalInvested > 0 ? (totalReturn / data.totalInvested) * 100 : 0;

    allPerformances.push({
      symbol,
      companyName: data.companyName,
      totalInvested: data.totalInvested,
      currentValue: data.currentValue,
      totalReturn,
      totalReturnPct,
      isActive: data.isActive,
      realizedGainLoss: data.realizedGainLoss,
      unrealizedGainLoss: data.unrealizedGainLoss,
    });
  }

  // Sort by total return
  allPerformances.sort((a, b) => b.totalReturn - a.totalReturn);

  const topWinners = allPerformances.filter((p) => p.totalReturn > 0).slice(0, 5);
  const topLosers = [...allPerformances].filter((p) => p.totalReturn < 0).sort((a, b) => a.totalReturn - b.totalReturn).slice(0, 5);

  return {
    bestInvestment: allPerformances[0] ?? null,
    worstInvestment: allPerformances[allPerformances.length - 1] ?? null,
    topWinners,
    topLosers,
    allPerformances,
  };
};

// ---------------------------------------------------------------------------
// 11. Investment Activity Calendar
// ---------------------------------------------------------------------------

export interface ActivityDay {
  date: string;
  transactionCount: number;
  totalAmount: number;
  buyCount: number;
  sellCount: number;
}

export interface ActivityMonth {
  monthKey: string;
  monthLabel: string;
  transactionCount: number;
  totalAmount: number;
  tradingDays: number;
}

export interface InvestmentActivityCalendar {
  dailyActivity: ActivityDay[];
  monthlyActivity: ActivityMonth[];
  totalTradingDays: number;
  mostActiveMonth: ActivityMonth | null;
  mostActiveYear: { year: string; transactionCount: number } | null;
  averageTransactionsPerMonth: number;
  activityByYear: Array<{ year: string; transactionCount: number; totalAmount: number }>;
  longestInactiveStreak: number;
}

export const calcInvestmentActivityCalendar = (
  transactions: Transaction[],
  fxRates: FxRates,
  reportingCurrency: Currency
): InvestmentActivityCalendar => {
  if (transactions.length === 0) {
    return {
      dailyActivity: [],
      monthlyActivity: [],
      totalTradingDays: 0,
      mostActiveMonth: null,
      mostActiveYear: null,
      averageTransactionsPerMonth: 0,
      activityByYear: [],
      longestInactiveStreak: 0,
    };
  }

  const dailyMap = new Map<string, ActivityDay>();
  const monthlyMap = new Map<string, ActivityMonth>();
  const yearlyMap = new Map<string, { transactionCount: number; totalAmount: number }>();

  for (const tx of transactions) {
    const dateKey = tx.transactionDate.split("T")[0];
    const mk = monthKey(tx.transactionDate);
    const yk = yearKey(tx.transactionDate);
    const amount = convert(tx.quantity * tx.pricePerShare, tx.currency, reportingCurrency, fxRates);

    // Daily
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        transactionCount: 0,
        totalAmount: 0,
        buyCount: 0,
        sellCount: 0,
      });
    }
    const daily = dailyMap.get(dateKey)!;
    daily.transactionCount += 1;
    daily.totalAmount += amount;
    if (tx.type === "BUY") daily.buyCount += 1;
    else daily.sellCount += 1;

    // Monthly
    if (!monthlyMap.has(mk)) {
      monthlyMap.set(mk, {
        monthKey: mk,
        monthLabel: formatDate(tx.transactionDate),
        transactionCount: 0,
        totalAmount: 0,
        tradingDays: 0,
      });
    }
    monthlyMap.get(mk)!.transactionCount += 1;
    monthlyMap.get(mk)!.totalAmount += amount;

    // Yearly
    if (!yearlyMap.has(yk)) {
      yearlyMap.set(yk, { transactionCount: 0, totalAmount: 0 });
    }
    yearlyMap.get(yk)!.transactionCount += 1;
    yearlyMap.get(yk)!.totalAmount += amount;
  }

  // Calculate trading days per month
  for (const [mk, month] of monthlyMap.entries()) {
    const tradingDays = [...dailyMap.values()].filter((d) => monthKey(d.date) === mk).length;
    month.tradingDays = tradingDays;
  }

  const dailyActivity = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const monthlyActivity = [...monthlyMap.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const activityByYear = [...yearlyMap.entries()]
    .map(([year, data]) => ({ year, ...data }))
    .sort((a, b) => a.year.localeCompare(b.year));

  // Most active
  let mostActiveMonth: ActivityMonth | null = null;
  for (const month of monthlyActivity) {
    if (!mostActiveMonth || month.transactionCount > mostActiveMonth.transactionCount) {
      mostActiveMonth = month;
    }
  }

  let mostActiveYear: { year: string; transactionCount: number } | null = null;
  for (const year of activityByYear) {
    if (!mostActiveYear || year.transactionCount > mostActiveYear.transactionCount) {
      mostActiveYear = { year: year.year, transactionCount: year.transactionCount };
    }
  }

  // Calculate longest inactive streak
  const sortedDates = dailyActivity.map((d) => d.date).sort();
  let longestInactiveStreak = 0;
  for (let i = 1; i < sortedDates.length; i++) {
    const gap = daysBetween(sortedDates[i - 1], sortedDates[i]);
    if (gap > longestInactiveStreak) {
      longestInactiveStreak = gap;
    }
  }

  const avgTransactionsPerMonth = monthlyActivity.length > 0
    ? transactions.length / monthlyActivity.length
    : 0;

  return {
    dailyActivity,
    monthlyActivity,
    totalTradingDays: dailyActivity.length,
    mostActiveMonth,
    mostActiveYear,
    averageTransactionsPerMonth: avgTransactionsPerMonth,
    activityByYear,
    longestInactiveStreak,
  };
};

// ---------------------------------------------------------------------------
// Master Analytics Function
// ---------------------------------------------------------------------------

export interface TransactionAnalytics {
  journey: InvestmentJourney;
  capitalDeployment: CapitalDeployment;
  conviction: ConvictionAnalysis;
  dca: DCAInsights;
  performance: PerformanceBreakdown;
  winRate: WinRateAnalysis;
  holdingPeriods: HoldingPeriodAnalytics;
  evolution: PortfolioEvolution;
  behavior: InvestorBehaviorInsights;
  bestWorst: BestWorstInvestments;
  activity: InvestmentActivityCalendar;
  hasData: boolean;
}

export const calcTransactionAnalytics = (
  transactions: Transaction[],
  currentHoldings: Holding[],
  realizations: SellTransactionRealization[],
  fxRates: FxRates,
  reportingCurrency: Currency
): TransactionAnalytics => {
  const hasData = transactions.length > 0;

  const journey = calcInvestmentJourney(transactions, currentHoldings);
  const capitalDeployment = calcCapitalDeployment(transactions, fxRates, reportingCurrency);
  const conviction = calcConvictionAnalysis(transactions, currentHoldings, fxRates, reportingCurrency);
  const dca = calcDCAInsights(transactions, currentHoldings, fxRates, reportingCurrency);
  const performance = calcPerformanceBreakdown(transactions, currentHoldings, realizations, fxRates, reportingCurrency);
  const winRate = calcWinRateAnalysis(transactions, realizations, fxRates, reportingCurrency);
  const holdingPeriods = calcHoldingPeriodAnalytics(transactions, currentHoldings, winRate.closedTrades);
  const evolution = calcPortfolioEvolution(transactions, fxRates, reportingCurrency);
  const behavior = calcInvestorBehaviorInsights(transactions, fxRates, reportingCurrency);
  const bestWorst = calcBestWorstInvestments(transactions, currentHoldings, realizations, fxRates, reportingCurrency);
  const activity = calcInvestmentActivityCalendar(transactions, fxRates, reportingCurrency);

  return {
    journey,
    capitalDeployment,
    conviction,
    dca,
    performance,
    winRate,
    holdingPeriods,
    evolution,
    behavior,
    bestWorst,
    activity,
    hasData,
  };
};





