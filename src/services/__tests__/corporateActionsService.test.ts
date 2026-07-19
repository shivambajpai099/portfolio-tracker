/**
 * Corporate Actions Service tests
 *
 * Verifies the Yahoo split-event → StockSplit mapping, deduplication,
 * chronological sorting, and per-symbol fail-soft behavior. `fetch` is mocked.
 */

import { fetchStockSplits } from "../corporateActionsService";

const chartResponse = (splits: Record<string, unknown>) => ({
  ok: true,
  json: async () => ({ chart: { result: [{ events: { splits } }] } }),
});

describe("fetchStockSplits", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("maps Yahoo split events to StockSplit (ratio + effective date + isin)", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      chartResponse({
        "1598832000": { date: 1598832000, numerator: 4, denominator: 1, splitRatio: "4:1" },
      })
    ) as unknown as typeof fetch;

    const { splits, errors } = await fetchStockSplits([{ symbol: "AAPL", isin: "US0378331005" }]);

    expect(errors).toHaveLength(0);
    expect(splits).toHaveLength(1);
    expect(splits[0]).toMatchObject({
      type: "split",
      symbol: "AAPL",
      isin: "US0378331005",
      ratio: { newShares: 4, oldShares: 1 },
      effectiveDate: new Date(1598832000 * 1000).toISOString().slice(0, 10),
    });
  });

  it("deduplicates symbols and sorts splits chronologically", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      chartResponse({
        a: { date: 1600000000, numerator: 2, denominator: 1 },
        b: { date: 1500000000, numerator: 3, denominator: 1 },
      })
    ) as unknown as typeof fetch;

    const { splits } = await fetchStockSplits([
      { symbol: "AAPL" },
      { symbol: "aapl" }, // duplicate (case) → fetched once
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(splits.map((s) => s.effectiveDate)).toEqual([...splits.map((s) => s.effectiveDate)].sort());
  });

  it("skips malformed events and fails soft on fetch errors", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(chartResponse({ x: { date: 1600000000, numerator: 0, denominator: 1 } })) // invalid ratio
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) }) as unknown as typeof fetch;

    const { splits, errors } = await fetchStockSplits([{ symbol: "AAA" }, { symbol: "BBB" }]);

    expect(splits).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("BBB");
  });

  it("queries the .NS variant for INR securities and labels with the bare symbol", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      chartResponse({
        "1658966400": { date: 1658966400, numerator: 10, denominator: 1, splitRatio: "10:1" },
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { splits } = await fetchStockSplits([{ symbol: "TATASTEEL", currency: "INR" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("TATASTEEL.NS");
    expect(splits).toHaveLength(1);
    expect(splits[0]).toMatchObject({
      symbol: "TATASTEEL", // display symbol stays bare so it matches transactions
      ratio: { newShares: 10, oldShares: 1 },
    });
  });
});

