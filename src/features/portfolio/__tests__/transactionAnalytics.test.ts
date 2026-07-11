/**
 * Transaction Analytics Engine Tests
 * 
 * Unit tests for all analytics calculations derived from transaction history.
 */

import {
  calcInvestmentJourney,
  calcCapitalDeployment,
  calcConvictionAnalysis,
  calcDCAInsights,
  calcPerformanceBreakdown,
  calcWinRateAnalysis,
  calcHoldingPeriodAnalytics,
  calcInvestorBehaviorInsights,
  calcBestWorstInvestments,
  calcInvestmentActivityCalendar,
  calcTransactionAnalytics,
} from "../transactionAnalytics";
import type { Transaction, SellTransactionRealization } from "../../../types/transaction";
import type { Holding, FxRates } from "../../../types/portfolio";

// Test fixtures
const createTransaction = (
  overrides: Partial<Transaction> = {}
): Transaction => ({
  id: `tx-${Date.now()}-${Math.random()}`,
  accountId: "account-1",
  symbol: "AAPL",
  companyName: "Apple Inc",
  transactionDate: "2024-01-15T10:00:00.000Z",
  type: "BUY",
  quantity: 10,
  pricePerShare: 150,
  currency: "USD",
  createdAt: "2024-01-15T10:00:00.000Z",
  ...overrides,
});

const createHolding = (overrides: Partial<Holding> = {}): Holding => ({
  id: `holding-${Date.now()}-${Math.random()}`,
  accountId: "account-1",
  symbol: "AAPL",
  companyName: "Apple Inc",
  quantity: 10,
  averagePrice: 150,
  marketPrice: 180,
  currency: "USD",
  asOf: "2024-01-15T10:00:00.000Z",
  updatedAt: "2024-06-15T10:00:00.000Z",
  ...overrides,
});

const fxRates: FxRates = {
  USDINR: 83.5,
  fetchedAt: "2024-06-15T10:00:00.000Z",
};

describe("calcInvestmentJourney", () => {
  it("returns empty journey for no transactions", () => {
    const result = calcInvestmentJourney([], []);
    
    expect(result.firstInvestmentDate).toBeNull();
    expect(result.lastInvestmentDate).toBeNull();
    expect(result.totalTransactionCount).toBe(0);
    expect(result.buyTransactionCount).toBe(0);
    expect(result.sellTransactionCount).toBe(0);
    expect(result.uniqueSymbolsOwned).toBe(0);
  });

  it("calculates journey metrics correctly", () => {
    const transactions: Transaction[] = [
      createTransaction({ transactionDate: "2023-01-15T10:00:00.000Z", type: "BUY", symbol: "AAPL" }),
      createTransaction({ transactionDate: "2023-06-15T10:00:00.000Z", type: "BUY", symbol: "NVDA" }),
      createTransaction({ transactionDate: "2024-01-15T10:00:00.000Z", type: "SELL", symbol: "AAPL" }),
    ];
    const holdings = [createHolding({ symbol: "NVDA" })];

    const result = calcInvestmentJourney(transactions, holdings);

    expect(result.firstInvestmentDate).toBe("2023-01-15T10:00:00.000Z");
    expect(result.lastInvestmentDate).toBe("2024-01-15T10:00:00.000Z");
    expect(result.totalTransactionCount).toBe(3);
    expect(result.buyTransactionCount).toBe(2);
    expect(result.sellTransactionCount).toBe(1);
    expect(result.uniqueSymbolsOwned).toBe(2);
    expect(result.uniqueSymbolsCurrentlyHeld).toBe(1);
    expect(result.activeDurationDays).toBeGreaterThan(0);
  });
});

describe("calcCapitalDeployment", () => {
  it("returns empty deployment for no transactions", () => {
    const result = calcCapitalDeployment([], fxRates, "USD");
    
    expect(result.totalInvested).toBe(0);
    expect(result.totalWithdrawn).toBe(0);
    expect(result.netInvested).toBe(0);
    expect(result.monthlyData).toHaveLength(0);
  });

  it("calculates capital deployment correctly", () => {
    const transactions: Transaction[] = [
      createTransaction({ 
        transactionDate: "2024-01-15T10:00:00.000Z", 
        type: "BUY", 
        quantity: 10, 
        pricePerShare: 100 
      }),
      createTransaction({ 
        transactionDate: "2024-02-15T10:00:00.000Z", 
        type: "BUY", 
        quantity: 5, 
        pricePerShare: 120 
      }),
      createTransaction({ 
        transactionDate: "2024-03-15T10:00:00.000Z", 
        type: "SELL", 
        quantity: 5, 
        pricePerShare: 130 
      }),
    ];

    const result = calcCapitalDeployment(transactions, fxRates, "USD");

    expect(result.totalInvested).toBe(1000 + 600); // 10*100 + 5*120
    expect(result.totalWithdrawn).toBe(650); // 5*130
    expect(result.netInvested).toBe(1600 - 650);
    expect(result.monthlyData.length).toBeGreaterThan(0);
    expect(result.byAsset.length).toBe(1);
    expect(result.byAsset[0].symbol).toBe("AAPL");
  });

  it("identifies largest single purchase", () => {
    const transactions: Transaction[] = [
      createTransaction({ quantity: 10, pricePerShare: 100 }),
      createTransaction({ quantity: 50, pricePerShare: 200, symbol: "NVDA" }),
      createTransaction({ quantity: 5, pricePerShare: 50 }),
    ];

    const result = calcCapitalDeployment(transactions, fxRates, "USD");

    expect(result.largestSinglePurchase?.symbol).toBe("NVDA");
    expect(result.largestSinglePurchase?.amount).toBe(10000);
  });
});

describe("calcConvictionAnalysis", () => {
  it("returns empty analysis for no transactions", () => {
    const result = calcConvictionAnalysis([], [], fxRates, "USD");
    
    expect(result.topConvictionHoldings).toHaveLength(0);
    expect(result.totalPositionsEverOwned).toBe(0);
  });

  it("ranks positions by purchase count", () => {
    const transactions: Transaction[] = [
      // AAPL - 3 purchases
      createTransaction({ symbol: "AAPL", transactionDate: "2024-01-01T10:00:00.000Z" }),
      createTransaction({ symbol: "AAPL", transactionDate: "2024-02-01T10:00:00.000Z" }),
      createTransaction({ symbol: "AAPL", transactionDate: "2024-03-01T10:00:00.000Z" }),
      // NVDA - 2 purchases
      createTransaction({ symbol: "NVDA", transactionDate: "2024-01-15T10:00:00.000Z" }),
      createTransaction({ symbol: "NVDA", transactionDate: "2024-02-15T10:00:00.000Z" }),
      // MSFT - 1 purchase
      createTransaction({ symbol: "MSFT", transactionDate: "2024-01-20T10:00:00.000Z" }),
    ];
    const holdings = [createHolding({ symbol: "AAPL" })];

    const result = calcConvictionAnalysis(transactions, holdings, fxRates, "USD");

    expect(result.topConvictionHoldings[0].symbol).toBe("AAPL");
    expect(result.topConvictionHoldings[0].purchaseCount).toBe(3);
    expect(result.topConvictionHoldings[1].symbol).toBe("NVDA");
    expect(result.topConvictionHoldings[1].purchaseCount).toBe(2);
    expect(result.totalPositionsEverOwned).toBe(3);
  });
});

describe("calcDCAInsights", () => {
  it("calculates DCA metrics correctly", () => {
    const transactions: Transaction[] = [
      createTransaction({ symbol: "AAPL", pricePerShare: 100, quantity: 10 }),
      createTransaction({ symbol: "AAPL", pricePerShare: 120, quantity: 10 }),
      createTransaction({ symbol: "AAPL", pricePerShare: 80, quantity: 10 }),
    ];
    const holdings = [createHolding({ symbol: "AAPL", marketPrice: 110 })];

    const result = calcDCAInsights(transactions, holdings, fxRates, "USD");

    const aaplPosition = result.positions.find((p) => p.symbol === "AAPL");
    expect(aaplPosition).toBeDefined();
    expect(aaplPosition!.purchaseCount).toBe(3);
    expect(aaplPosition!.totalSharesBought).toBe(30);
    expect(aaplPosition!.averageBuyPrice).toBe(100); // (100+120+80)/3 * 10 shares each
    expect(aaplPosition!.lowestBuyPrice).toBe(80);
    expect(aaplPosition!.highestBuyPrice).toBe(120);
  });
});

describe("calcWinRateAnalysis", () => {
  it("returns empty analysis for no realizations", () => {
    const result = calcWinRateAnalysis([], [], fxRates, "USD");
    
    expect(result.totalClosedTrades).toBe(0);
    expect(result.winRate).toBe(0);
  });

  it("calculates win rate correctly", () => {
    const transactions: Transaction[] = [
      createTransaction({ id: "buy-1", type: "BUY", symbol: "AAPL", pricePerShare: 100, quantity: 10 }),
      createTransaction({ id: "sell-1", type: "SELL", symbol: "AAPL", pricePerShare: 120, quantity: 5 }),
      createTransaction({ id: "buy-2", type: "BUY", symbol: "NVDA", pricePerShare: 200, quantity: 10 }),
      createTransaction({ id: "sell-2", type: "SELL", symbol: "NVDA", pricePerShare: 180, quantity: 10 }),
    ];

    const realizations: SellTransactionRealization[] = [
      {
        sellTransactionId: "sell-1",
        sellDate: "2024-06-01T10:00:00.000Z",
        totalQuantitySold: 5,
        totalProceeds: 600,
        totalCostBasis: 500,
        totalRealizedGainLoss: 100, // Win
        lotConsumptions: [{
          lotTransactionId: "buy-1",
          quantityConsumed: 5,
          costBasisPerShare: 100,
          salePricePerShare: 120,
          realizedGainLoss: 100,
        }],
      },
      {
        sellTransactionId: "sell-2",
        sellDate: "2024-07-01T10:00:00.000Z",
        totalQuantitySold: 10,
        totalProceeds: 1800,
        totalCostBasis: 2000,
        totalRealizedGainLoss: -200, // Loss
        lotConsumptions: [{
          lotTransactionId: "buy-2",
          quantityConsumed: 10,
          costBasisPerShare: 200,
          salePricePerShare: 180,
          realizedGainLoss: -200,
        }],
      },
    ];

    const result = calcWinRateAnalysis(transactions, realizations, fxRates, "USD");

    expect(result.totalClosedTrades).toBe(2);
    expect(result.winningTrades).toBe(1);
    expect(result.losingTrades).toBe(1);
    expect(result.winRate).toBe(50);
    expect(result.totalProfit).toBe(100);
    expect(result.totalLoss).toBe(200);
  });
});

describe("calcHoldingPeriodAnalytics", () => {
  it("calculates holding periods for active positions", () => {
    const transactions: Transaction[] = [
      createTransaction({ 
        symbol: "AAPL", 
        transactionDate: "2023-01-15T10:00:00.000Z" 
      }),
    ];
    const holdings = [
      createHolding({ 
        symbol: "AAPL", 
        asOf: "2023-01-15T10:00:00.000Z" 
      }),
    ];

    const result = calcHoldingPeriodAnalytics(transactions, holdings, []);

    expect(result.positionsByAge.length).toBe(1);
    expect(result.positionsByAge[0].symbol).toBe("AAPL");
    expect(result.positionsByAge[0].isActive).toBe(true);
    expect(result.positionsByAge[0].holdingDays).toBeGreaterThan(0);
  });
});

describe("calcInvestorBehaviorInsights", () => {
  it("calculates trade size statistics", () => {
    const transactions: Transaction[] = [
      createTransaction({ quantity: 10, pricePerShare: 100 }), // $1000
      createTransaction({ quantity: 5, pricePerShare: 50 }),   // $250
      createTransaction({ quantity: 2, pricePerShare: 75 }),   // $150
    ];

    const result = calcInvestorBehaviorInsights(transactions, fxRates, "USD");

    expect(result.averageTradeSize).toBeCloseTo(466.67, 0);
    expect(result.largestTrade?.amount).toBe(1000);
    expect(result.smallestTrade?.amount).toBe(150);
  });

  it("identifies most frequently purchased stock", () => {
    const transactions: Transaction[] = [
      createTransaction({ symbol: "AAPL" }),
      createTransaction({ symbol: "AAPL" }),
      createTransaction({ symbol: "AAPL" }),
      createTransaction({ symbol: "NVDA" }),
      createTransaction({ symbol: "NVDA" }),
    ];

    const result = calcInvestorBehaviorInsights(transactions, fxRates, "USD");

    expect(result.mostFrequentlyPurchasedStock?.symbol).toBe("AAPL");
    expect(result.mostFrequentlyPurchasedStock?.count).toBe(3);
  });
});

describe("calcBestWorstInvestments", () => {
  it("identifies best and worst investments", () => {
    const transactions: Transaction[] = [
      createTransaction({ symbol: "AAPL", quantity: 10, pricePerShare: 100 }),
      createTransaction({ symbol: "NVDA", quantity: 10, pricePerShare: 100 }),
    ];
    const holdings = [
      createHolding({ symbol: "AAPL", quantity: 10, averagePrice: 100, marketPrice: 150 }), // +50%
      createHolding({ symbol: "NVDA", quantity: 10, averagePrice: 100, marketPrice: 80 }),  // -20%
    ];

    const result = calcBestWorstInvestments(transactions, holdings, [], fxRates, "USD");

    expect(result.bestInvestment?.symbol).toBe("AAPL");
    expect(result.bestInvestment?.totalReturn).toBe(500); // (150-100)*10
    expect(result.worstInvestment?.symbol).toBe("NVDA");
    expect(result.worstInvestment?.totalReturn).toBe(-200); // (80-100)*10
  });
});

describe("calcInvestmentActivityCalendar", () => {
  it("calculates activity statistics", () => {
    const transactions: Transaction[] = [
      createTransaction({ transactionDate: "2024-01-15T10:00:00.000Z" }),
      createTransaction({ transactionDate: "2024-01-20T10:00:00.000Z" }),
      createTransaction({ transactionDate: "2024-02-15T10:00:00.000Z" }),
    ];

    const result = calcInvestmentActivityCalendar(transactions, fxRates, "USD");

    expect(result.totalTradingDays).toBe(3);
    expect(result.monthlyActivity.length).toBe(2); // Jan and Feb
    expect(result.averageTransactionsPerMonth).toBe(1.5);
  });
});

describe("calcTransactionAnalytics", () => {
  it("returns all analytics combined", () => {
    const transactions: Transaction[] = [
      createTransaction({ transactionDate: "2024-01-15T10:00:00.000Z" }),
    ];
    const holdings = [createHolding()];
    const realizations: SellTransactionRealization[] = [];

    const result = calcTransactionAnalytics(transactions, holdings, realizations, fxRates, "USD");

    expect(result.hasData).toBe(true);
    expect(result.journey).toBeDefined();
    expect(result.capitalDeployment).toBeDefined();
    expect(result.conviction).toBeDefined();
    expect(result.dca).toBeDefined();
    expect(result.performance).toBeDefined();
    expect(result.winRate).toBeDefined();
    expect(result.holdingPeriods).toBeDefined();
    expect(result.evolution).toBeDefined();
    expect(result.behavior).toBeDefined();
    expect(result.bestWorst).toBeDefined();
    expect(result.activity).toBeDefined();
  });

  it("handles empty data gracefully", () => {
    const result = calcTransactionAnalytics([], [], [], fxRates, "USD");

    expect(result.hasData).toBe(false);
    expect(result.journey.totalTransactionCount).toBe(0);
    expect(result.capitalDeployment.totalInvested).toBe(0);
  });
});

