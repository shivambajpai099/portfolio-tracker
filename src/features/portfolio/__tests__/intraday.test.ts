/**
 * Intraday round-trip filtering tests.
 */

import { excludeIntradayRoundTrips } from "../intraday";
import type { Transaction } from "../../../types/transaction";

const makeTransaction = (
  overrides: Partial<Transaction> & {
    symbol: string;
    type: "BUY" | "SELL";
    quantity: number;
    pricePerShare: number;
  }
): Transaction => ({
  id: `tx-${Date.now()}-${Math.random()}`,
  accountId: "acc-1",
  companyName: overrides.symbol,
  transactionDate: "2024-01-15",
  currency: "USD",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("excludeIntradayRoundTrips", () => {
  it("removes a fully-offset same-day BUY/SELL round-trip", () => {
    const txs: Transaction[] = [
      makeTransaction({ symbol: "AAPL", type: "BUY", quantity: 100, pricePerShare: 150, transactionDate: "2024-01-15T09:30:00Z" }),
      makeTransaction({ symbol: "AAPL", type: "SELL", quantity: 100, pricePerShare: 152, transactionDate: "2024-01-15T14:00:00Z" }),
    ];
    expect(excludeIntradayRoundTrips(txs)).toHaveLength(0);
  });

  it("keeps the net overnight surplus when buys exceed same-day sells", () => {
    const txs: Transaction[] = [
      makeTransaction({ symbol: "AAPL", type: "BUY", quantity: 100, pricePerShare: 150, transactionDate: "2024-01-15T09:30:00Z" }),
      makeTransaction({ symbol: "AAPL", type: "SELL", quantity: 40, pricePerShare: 152, transactionDate: "2024-01-15T14:00:00Z" }),
    ];
    const result = excludeIntradayRoundTrips(txs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "BUY", quantity: 60 });
  });

  it("keeps the net overnight surplus when sells exceed same-day buys", () => {
    const txs: Transaction[] = [
      makeTransaction({ symbol: "AAPL", type: "BUY", quantity: 30, pricePerShare: 150, transactionDate: "2024-01-15T09:30:00Z" }),
      makeTransaction({ symbol: "AAPL", type: "SELL", quantity: 100, pricePerShare: 152, transactionDate: "2024-01-15T14:00:00Z" }),
    ];
    const result = excludeIntradayRoundTrips(txs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "SELL", quantity: 70 });
  });

  it("does not net BUY and SELL across different days", () => {
    const txs: Transaction[] = [
      makeTransaction({ symbol: "AAPL", type: "BUY", quantity: 100, pricePerShare: 150, transactionDate: "2024-01-15T09:30:00Z" }),
      makeTransaction({ symbol: "AAPL", type: "SELL", quantity: 100, pricePerShare: 152, transactionDate: "2024-01-16T09:30:00Z" }),
    ];
    expect(excludeIntradayRoundTrips(txs)).toHaveLength(2);
  });

  it("does not net across different accounts on the same day", () => {
    const txs: Transaction[] = [
      makeTransaction({ symbol: "AAPL", type: "BUY", quantity: 100, pricePerShare: 150, accountId: "acc-1" }),
      makeTransaction({ symbol: "AAPL", type: "SELL", quantity: 100, pricePerShare: 152, accountId: "acc-2" }),
    ];
    expect(excludeIntradayRoundTrips(txs)).toHaveLength(2);
  });

  it("does not net across different symbols", () => {
    const txs: Transaction[] = [
      makeTransaction({ symbol: "AAPL", type: "BUY", quantity: 100, pricePerShare: 150 }),
      makeTransaction({ symbol: "MSFT", type: "SELL", quantity: 100, pricePerShare: 152 }),
    ];
    expect(excludeIntradayRoundTrips(txs)).toHaveLength(2);
  });

  it("returns an equivalent list when there is nothing intraday", () => {
    const txs: Transaction[] = [
      makeTransaction({ symbol: "AAPL", type: "BUY", quantity: 100, pricePerShare: 150, transactionDate: "2024-01-15" }),
      makeTransaction({ symbol: "MSFT", type: "BUY", quantity: 50, pricePerShare: 300, transactionDate: "2024-01-16" }),
    ];
    expect(excludeIntradayRoundTrips(txs)).toHaveLength(2);
  });

  it("nets legs of the same underlying recorded with inconsistent exchange suffixes", () => {
    // Broker logged the intraday BUY without suffix and the SELL with .NS.
    const txs: Transaction[] = [
      makeTransaction({ symbol: "INFY", type: "BUY", quantity: 50, pricePerShare: 1500, transactionDate: "2024-03-10T09:30:00Z" }),
      makeTransaction({ symbol: "INFY.NS", type: "SELL", quantity: 50, pricePerShare: 1490, transactionDate: "2024-03-10T14:00:00Z" }),
    ];
    expect(excludeIntradayRoundTrips(txs)).toHaveLength(0);
  });

  it("nets legs regardless of case and surrounding whitespace", () => {
    const txs: Transaction[] = [
      makeTransaction({ symbol: " reliance.ns ", type: "BUY", quantity: 20, pricePerShare: 2800, transactionDate: "2024-03-10" }),
      makeTransaction({ symbol: "RELIANCE", type: "SELL", quantity: 20, pricePerShare: 2790, transactionDate: "2024-03-10" }),
    ];
    expect(excludeIntradayRoundTrips(txs)).toHaveLength(0);
  });

  it("removes the intraday loss leg for a stock that is also held long-term", () => {
    // Long-held lot (kept) + same-day intraday round-trip at a loss (removed),
    // even though the intraday legs use a different suffix than the held lot.
    const txs: Transaction[] = [
      makeTransaction({ symbol: "INFY.NS", type: "BUY", quantity: 100, pricePerShare: 1400, transactionDate: "2024-01-01" }),
      makeTransaction({ symbol: "INFY", type: "BUY", quantity: 50, pricePerShare: 1500, transactionDate: "2024-03-10T09:30:00Z" }),
      makeTransaction({ symbol: "INFY", type: "SELL", quantity: 50, pricePerShare: 1480, transactionDate: "2024-03-10T14:00:00Z" }),
    ];
    const result = excludeIntradayRoundTrips(txs);
    // Only the long-term hold survives; no SELL remains to realize a phantom loss.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "BUY", quantity: 100 });
    expect(result.some((t) => t.type === "SELL")).toBe(false);
  });
});

