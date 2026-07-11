/**
 * FIFO Calculator Tests
 *
 * Tests for the FIFO-based holdings derivation from transactions.
 */

import { deriveHoldingsFromTransactions, calculateTransactionPnL } from "../fifoCalculator";
import type { Transaction } from "../../../types/transaction";

const makeTransaction = (
  overrides: Partial<Transaction> & { symbol: string; type: "BUY" | "SELL"; quantity: number; pricePerShare: number }
): Transaction => ({
  id: `tx-${Date.now()}-${Math.random()}`,
  accountId: "acc-1",
  companyName: overrides.symbol,
  transactionDate: "2024-01-15",
  currency: "USD",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("deriveHoldingsFromTransactions", () => {
  describe("single buy transactions", () => {
    it("should create a holding from a single BUY transaction", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 150,
          transactionDate: "2024-01-15",
        }),
      ];

      const result = deriveHoldingsFromTransactions(transactions, "acc-1");

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0]).toMatchObject({
        symbol: "AAPL",
        quantity: 10,
        averagePrice: 150,
        currency: "USD",
      });
      expect(result.errors).toHaveLength(0);
    });

    it("should calculate weighted average from multiple BUY transactions", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 100,
          transactionDate: "2024-01-15",
        }),
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 200,
          transactionDate: "2024-01-20",
        }),
      ];

      const result = deriveHoldingsFromTransactions(transactions, "acc-1");

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0].quantity).toBe(20);
      // Weighted average: (10 * 100 + 10 * 200) / 20 = 150
      expect(result.holdings[0].averagePrice).toBe(150);
    });
  });

  describe("partial sells (FIFO)", () => {
    it("should reduce quantity after partial SELL using FIFO", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 100,
          transactionDate: "2024-01-15",
        }),
        makeTransaction({
          symbol: "AAPL",
          type: "SELL",
          quantity: 4,
          pricePerShare: 120,
          transactionDate: "2024-01-20",
        }),
      ];

      const result = deriveHoldingsFromTransactions(transactions, "acc-1");

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0].quantity).toBe(6);
      // Average price should still be 100 (from remaining lot)
      expect(result.holdings[0].averagePrice).toBe(100);
    });

    it("should consume oldest lot first (FIFO)", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          id: "tx-1",
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 100,
          transactionDate: "2024-01-10",
        }),
        makeTransaction({
          id: "tx-2",
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 200,
          transactionDate: "2024-01-15",
        }),
        makeTransaction({
          id: "tx-3",
          symbol: "AAPL",
          type: "SELL",
          quantity: 10,
          pricePerShare: 150,
          transactionDate: "2024-01-20",
        }),
      ];

      const result = deriveHoldingsFromTransactions(transactions, "acc-1");

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0].quantity).toBe(10);
      // After selling the first lot ($100), only the second lot ($200) remains
      expect(result.holdings[0].averagePrice).toBe(200);
    });

    it("should calculate correct average after consuming partial lots", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 100,
          transactionDate: "2024-01-10",
        }),
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 200,
          transactionDate: "2024-01-15",
        }),
        makeTransaction({
          symbol: "AAPL",
          type: "SELL",
          quantity: 15,
          pricePerShare: 180,
          transactionDate: "2024-01-20",
        }),
      ];

      const result = deriveHoldingsFromTransactions(transactions, "acc-1");

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0].quantity).toBe(5);
      // After FIFO: sold 10 @ $100 and 5 @ $200, remaining 5 @ $200
      expect(result.holdings[0].averagePrice).toBe(200);
    });
  });

  describe("full liquidation", () => {
    it("should remove holding when fully liquidated", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 100,
          transactionDate: "2024-01-15",
        }),
        makeTransaction({
          symbol: "AAPL",
          type: "SELL",
          quantity: 10,
          pricePerShare: 150,
          transactionDate: "2024-01-20",
        }),
      ];

      const result = deriveHoldingsFromTransactions(transactions, "acc-1");

      expect(result.holdings).toHaveLength(0);
    });
  });

  describe("oversell handling", () => {
    it("should report error when selling more than available", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 100,
          transactionDate: "2024-01-15",
        }),
        makeTransaction({
          symbol: "AAPL",
          type: "SELL",
          quantity: 15,
          pricePerShare: 120,
          transactionDate: "2024-01-20",
        }),
      ];

      const result = deriveHoldingsFromTransactions(transactions, "acc-1");

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("exceeds available shares");
      expect(result.errors[0]).toContain("Short by 5");
    });
  });

  describe("multi-symbol handling", () => {
    it("should handle multiple symbols independently", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 150,
          transactionDate: "2024-01-15",
        }),
        makeTransaction({
          symbol: "GOOGL",
          type: "BUY",
          quantity: 5,
          pricePerShare: 100,
          transactionDate: "2024-01-15",
        }),
        makeTransaction({
          symbol: "AAPL",
          type: "SELL",
          quantity: 3,
          pricePerShare: 160,
          transactionDate: "2024-01-20",
        }),
      ];

      const result = deriveHoldingsFromTransactions(transactions, "acc-1");

      expect(result.holdings).toHaveLength(2);

      const aapl = result.holdings.find((h) => h.symbol === "AAPL");
      const googl = result.holdings.find((h) => h.symbol === "GOOGL");

      expect(aapl?.quantity).toBe(7);
      expect(googl?.quantity).toBe(5);
    });
  });

  describe("account isolation", () => {
    it("should only process transactions for the specified account", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          accountId: "acc-1",
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 100,
          transactionDate: "2024-01-15",
        }),
        makeTransaction({
          accountId: "acc-2",
          symbol: "AAPL",
          type: "BUY",
          quantity: 20,
          pricePerShare: 200,
          transactionDate: "2024-01-15",
        }),
      ];

      const result1 = deriveHoldingsFromTransactions(transactions, "acc-1");
      const result2 = deriveHoldingsFromTransactions(transactions, "acc-2");

      expect(result1.holdings[0].quantity).toBe(10);
      expect(result1.holdings[0].averagePrice).toBe(100);

      expect(result2.holdings[0].quantity).toBe(20);
      expect(result2.holdings[0].averagePrice).toBe(200);
    });
  });

  describe("market price injection", () => {
    it("should use provided market prices when available", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 100,
          transactionDate: "2024-01-15",
        }),
      ];

      const priceMap = new Map([["AAPL", 180]]);
      const result = deriveHoldingsFromTransactions(transactions, "acc-1", priceMap);

      expect(result.holdings[0].averagePrice).toBe(100); // Cost basis
      expect(result.holdings[0].marketPrice).toBe(180); // Current price
    });

    it("should use average price as market price when not provided", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 100,
          transactionDate: "2024-01-15",
        }),
      ];

      const result = deriveHoldingsFromTransactions(transactions, "acc-1");

      expect(result.holdings[0].marketPrice).toBe(100); // Falls back to avg price
    });
  });

  describe("realizations tracking", () => {
    it("should track realized gains from sells", () => {
      const transactions: Transaction[] = [
        makeTransaction({
          id: "buy-1",
          symbol: "AAPL",
          type: "BUY",
          quantity: 10,
          pricePerShare: 100,
          transactionDate: "2024-01-15",
        }),
        makeTransaction({
          id: "sell-1",
          symbol: "AAPL",
          type: "SELL",
          quantity: 5,
          pricePerShare: 150,
          transactionDate: "2024-01-20",
        }),
      ];

      const result = deriveHoldingsFromTransactions(transactions, "acc-1");

      expect(result.realizations).toHaveLength(1);
      expect(result.realizations[0]).toMatchObject({
        sellTransactionId: "sell-1",
        totalQuantitySold: 5,
        totalProceeds: 750, // 5 * 150
        totalCostBasis: 500, // 5 * 100
        totalRealizedGainLoss: 250, // 750 - 500
      });
    });
  });
});

describe("calculateTransactionPnL", () => {
  it("should calculate realized and unrealized P&L", () => {
    const transactions: Transaction[] = [
      makeTransaction({
        symbol: "AAPL",
        type: "BUY",
        quantity: 10,
        pricePerShare: 100,
        transactionDate: "2024-01-15",
      }),
      makeTransaction({
        symbol: "AAPL",
        type: "SELL",
        quantity: 5,
        pricePerShare: 150,
        transactionDate: "2024-01-20",
      }),
    ];

    const priceMap = new Map([["AAPL", 180]]);
    const pnl = calculateTransactionPnL(transactions, "acc-1", priceMap);

    // Realized: sold 5 @ 150, cost 5 @ 100 = $250 gain
    expect(pnl.totalRealizedGainLoss).toBe(250);

    // Unrealized: 5 remaining @ market 180, cost 100 = (180-100)*5 = $400 gain
    expect(pnl.totalUnrealizedGainLoss).toBe(400);

    // Total cost basis of remaining: 5 * 100 = 500
    expect(pnl.totalCostBasis).toBe(500);

    // Total market value: 5 * 180 = 900
    expect(pnl.totalMarketValue).toBe(900);
  });
});

