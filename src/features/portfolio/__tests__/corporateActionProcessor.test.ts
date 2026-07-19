/**
 * Corporate Action Processor — Stock Split tests
 *
 * Covers single/multiple splits, effective-date boundaries, buys after splits,
 * partial sells through FIFO, intraday trades after splits, ISIN vs symbol
 * matching, idempotency, and regression of existing FIFO holdings/P&L.
 */

import {
  CorporateActionProcessor,
  processCorporateActions,
  applyStockSplit,
  corporateActionId,
  type StockSplit,
} from "../corporateActionProcessor";
import { deriveHoldingsFromTransactions, getAllRealizations } from "../fifoCalculator";
import { excludeIntradayRoundTrips } from "../intraday";
import type { Transaction } from "../../../types/transaction";

const makeTx = (
  overrides: Partial<Transaction> & {
    type: "BUY" | "SELL";
    quantity: number;
    pricePerShare: number;
    transactionDate: string;
  }
): Transaction => ({
  id: `tx-${Math.random().toString(36).slice(2)}`,
  accountId: "acc-1",
  symbol: "AAPL",
  companyName: "Apple Inc",
  currency: "USD",
  createdAt: "2020-01-01T00:00:00.000Z",
  ...overrides,
});

const invested = (tx: Transaction): number => tx.quantity * tx.pricePerShare;

const split = (overrides: Partial<StockSplit> = {}): StockSplit => ({
  type: "split",
  symbol: "AAPL",
  effectiveDate: "2021-01-01",
  ratio: { newShares: 5, oldShares: 1 },
  ...overrides,
});

describe("applyStockSplit", () => {
  it("multiplies quantity, divides price, and preserves invested amount", () => {
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01" });
    const [result] = applyStockSplit([tx], split()); // 5-for-1

    expect(result.quantity).toBe(50);
    expect(result.pricePerShare).toBe(20);
    expect(invested(result)).toBeCloseTo(invested(tx), 6);
  });

  it("supports reverse splits (1-for-2)", () => {
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01" });
    const [result] = applyStockSplit([tx], split({ ratio: { newShares: 1, oldShares: 2 } }));

    expect(result.quantity).toBe(5);
    expect(result.pricePerShare).toBe(200);
    expect(invested(result)).toBeCloseTo(1000, 6);
  });

  it("only adjusts transactions strictly BEFORE the effective date", () => {
    const before = makeTx({ type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-12-31T23:59:00.000Z" });
    const onDate = makeTx({ type: "BUY", quantity: 10, pricePerShare: 20, transactionDate: "2021-01-01T00:00:00.000Z" });
    const after = makeTx({ type: "BUY", quantity: 4, pricePerShare: 25, transactionDate: "2021-03-01" });

    const result = applyStockSplit([before, onDate, after], split());

    expect(result[0].quantity).toBe(50); // adjusted
    expect(result[1].quantity).toBe(10); // on effective date — untouched
    expect(result[2].quantity).toBe(4); // after — untouched
  });

  it("records the split id for idempotency and does not double-apply", () => {
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01" });
    const s = split();
    const once = applyStockSplit([tx], s);
    const twice = applyStockSplit(once, s);

    expect(once[0].quantity).toBe(50);
    expect(twice[0].quantity).toBe(50); // unchanged on re-apply
    expect(twice[0].appliedCorporateActions).toEqual([corporateActionId(s)]);
  });

  it("ignores invalid ratios", () => {
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01" });
    const result = applyStockSplit([tx], split({ ratio: { newShares: 0, oldShares: 1 } }));
    expect(result[0].quantity).toBe(10);
  });
});

describe("security matching (ISIN primary, symbol fallback)", () => {
  it("matches by ISIN when present on both sides", () => {
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01", isin: "US0378331005", symbol: "AAPL" });
    const result = applyStockSplit([tx], split({ isin: "us0378331005", symbol: "WRONG" }));
    expect(result[0].quantity).toBe(50); // matched on ISIN, not symbol
  });

  it("does NOT match when ISINs differ even if symbols are equal", () => {
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01", isin: "US0378331005", symbol: "AAPL" });
    const result = applyStockSplit([tx], split({ isin: "INE000000000", symbol: "AAPL" }));
    expect(result[0].quantity).toBe(10); // not adjusted
  });

  it("falls back to symbol when the transaction has no ISIN", () => {
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01", symbol: "AAPL" });
    const result = applyStockSplit([tx], split({ isin: "US0378331005", symbol: "AAPL" }));
    expect(result[0].quantity).toBe(50);
  });

  it("matches symbols regardless of exchange suffix / case", () => {
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01", symbol: "reliance.ns" });
    const result = applyStockSplit([tx], split({ symbol: "RELIANCE" }));
    expect(result[0].quantity).toBe(50);
  });
});

describe("CorporateActionProcessor.process — multiple splits", () => {
  it("applies multiple splits chronologically and compounds the factor", () => {
    // Bought before both splits; 2-for-1 then 3-for-1 → total 6x.
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 120, transactionDate: "2019-01-01" });
    const splits: StockSplit[] = [
      split({ effectiveDate: "2021-01-01", ratio: { newShares: 3, oldShares: 1 } }),
      split({ effectiveDate: "2020-01-01", ratio: { newShares: 2, oldShares: 1 } }),
    ];
    const [result] = processCorporateActions([tx], splits);

    expect(result.quantity).toBe(60); // 10 * 2 * 3
    expect(result.pricePerShare).toBeCloseTo(20, 6); // 120 / 6
    expect(invested(result)).toBeCloseTo(1200, 6);
    expect(result.appliedCorporateActions).toHaveLength(2);
  });

  it("only applies the split(s) whose effective date is after the transaction", () => {
    // Bought between the two splits → only the later split applies.
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 40, transactionDate: "2020-06-01" });
    const splits: StockSplit[] = [
      split({ effectiveDate: "2020-01-01", ratio: { newShares: 2, oldShares: 1 } }),
      split({ effectiveDate: "2021-01-01", ratio: { newShares: 3, oldShares: 1 } }),
    ];
    const [result] = processCorporateActions([tx], splits);

    expect(result.quantity).toBe(30); // only the 3-for-1
    expect(result.pricePerShare).toBeCloseTo(40 / 3, 6);
    expect(invested(result)).toBeCloseTo(400, 6);
  });

  it("is idempotent across full re-processing", () => {
    const tx = makeTx({ type: "BUY", quantity: 10, pricePerShare: 120, transactionDate: "2019-01-01" });
    const splits: StockSplit[] = [
      split({ effectiveDate: "2020-01-01", ratio: { newShares: 2, oldShares: 1 } }),
      split({ effectiveDate: "2021-01-01", ratio: { newShares: 3, oldShares: 1 } }),
    ];
    const processor = new CorporateActionProcessor(splits);
    const once = processor.process([tx]);
    const twice = processor.process(once);

    expect(twice).toEqual(once);
  });
});

describe("FIFO integration", () => {
  it("derives split-adjusted holdings for a buy before the split", () => {
    const txs = processCorporateActions(
      [makeTx({ type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01" })],
      [split()]
    );
    const { holdings } = deriveHoldingsFromTransactions(txs, "acc-1");

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ symbol: "AAPL", quantity: 50, averagePrice: 20 });
  });

  it("handles a partial sell after a split with correct remaining qty and realized P&L", () => {
    const raw = [
      makeTx({ id: "b1", type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01" }),
      makeTx({ id: "s1", type: "SELL", quantity: 20, pricePerShare: 30, transactionDate: "2021-06-01" }),
    ];
    const txs = processCorporateActions(raw, [split()]); // buy → 50 @ 20; sell is post-split (untouched)
    const { holdings } = deriveHoldingsFromTransactions(txs, "acc-1");
    const realizations = getAllRealizations(txs);

    expect(holdings[0].quantity).toBe(30); // 50 bought - 20 sold
    expect(holdings[0].averagePrice).toBe(20);
    // Realized: sold 20 @ 30, cost basis 20 → (30-20)*20 = 200
    const realized = realizations.reduce((sum, r) => sum + r.totalRealizedGainLoss, 0);
    expect(realized).toBeCloseTo(200, 6);
  });

  it("leaves buys placed after the split untouched", () => {
    const raw = [
      makeTx({ id: "b1", type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01" }), // → 50 @ 20
      makeTx({ id: "b2", type: "BUY", quantity: 5, pricePerShare: 22, transactionDate: "2021-02-01" }), // untouched
    ];
    const txs = processCorporateActions(raw, [split()]);
    const { holdings } = deriveHoldingsFromTransactions(txs, "acc-1");

    // 50 @ 20 + 5 @ 22 = 55 shares, cost 1000 + 110 = 1110 → avg 20.18...
    expect(holdings[0].quantity).toBe(55);
    expect(holdings[0].averagePrice).toBeCloseTo(1110 / 55, 6);
  });
});

describe("intraday trades after a split", () => {
  it("processor leaves post-split intraday legs untouched and the intraday filter nets them out", () => {
    const raw = [
      makeTx({ id: "hold", type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01" }), // long hold, pre-split
      makeTx({ id: "in-b", type: "BUY", quantity: 8, pricePerShare: 25, transactionDate: "2021-03-01T09:30:00.000Z" }),
      makeTx({ id: "in-s", type: "SELL", quantity: 8, pricePerShare: 26, transactionDate: "2021-03-01T14:00:00.000Z" }),
    ];
    const normalized = processCorporateActions(raw, [split()]);

    // Intraday legs (post-split) are unchanged by the processor.
    const intradayBuy = normalized.find((t) => t.id === "in-b")!;
    expect(intradayBuy.quantity).toBe(8);
    expect(intradayBuy.appliedCorporateActions).toBeUndefined();

    // Downstream intraday filter removes the matched round-trip, leaving the hold.
    const filtered = excludeIntradayRoundTrips(normalized);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("hold");
    expect(filtered[0].quantity).toBe(50); // split-adjusted long position
  });
});

describe("regression — existing calculations unaffected without splits", () => {
  it("processing with no events is an identity passthrough", () => {
    const raw = [
      makeTx({ id: "b1", type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01" }),
      makeTx({ id: "s1", type: "SELL", quantity: 4, pricePerShare: 150, transactionDate: "2021-06-01" }),
    ];
    const result = processCorporateActions(raw, []);
    expect(result).toEqual(raw);
  });

  it("FIFO holdings/P&L match whether processed (no splits) or raw", () => {
    const raw = [
      makeTx({ id: "b1", type: "BUY", quantity: 10, pricePerShare: 100, transactionDate: "2020-06-01" }),
      makeTx({ id: "b2", type: "BUY", quantity: 10, pricePerShare: 120, transactionDate: "2020-09-01" }),
      makeTx({ id: "s1", type: "SELL", quantity: 5, pricePerShare: 150, transactionDate: "2021-06-01" }),
    ];
    const processed = processCorporateActions(raw, []);

    const rawResult = deriveHoldingsFromTransactions(raw, "acc-1");
    const procResult = deriveHoldingsFromTransactions(processed, "acc-1");

    expect(procResult.holdings).toEqual(rawResult.holdings);
    expect(getAllRealizations(processed)).toEqual(getAllRealizations(raw));
  });
});

