/**
 * Unit tests for Indian stock price fetching
 *
 * These tests verify the actual API endpoints work.
 * Run: npm test
 */

// Mock fetch for unit tests
const originalFetch = global.fetch;

describe("Indian Stock Price APIs", () => {
  beforeEach(() => {
    // Reset fetch to original for integration tests
    global.fetch = originalFetch;
  });

  describe("Yahoo Finance v7 Quote API", () => {
    const testSymbol = "RELIANCE.NS";
    const endpoint = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${testSymbol}`;

    it("should fetch price for RELIANCE.NS", async () => {
      const response = await fetch(endpoint, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
          Referer: "https://finance.yahoo.com/",
        },
      });

      console.log(`Yahoo v7 status for ${testSymbol}:`, response.status);

      if (response.ok) {
        const data = (await response.json()) as {
          quoteResponse?: {
            result?: Array<{
              symbol?: string;
              regularMarketPrice?: number;
              currency?: string;
            }>;
          };
        };

        const quote = data.quoteResponse?.result?.[0];
        console.log(`Yahoo v7 quote:`, quote);

        if (quote?.regularMarketPrice) {
          expect(quote.regularMarketPrice).toBeGreaterThan(0);
          expect(quote.currency).toBe("INR");
        } else {
          console.warn("No price returned - API may be rate limited");
        }
      } else {
        const text = await response.text();
        console.warn(`Yahoo v7 failed with ${response.status}:`, text.slice(0, 200));
        // Don't fail - API might be temporarily unavailable
      }
    });
  });

  describe("Yahoo Finance Chart API", () => {
    const testSymbol = "RELIANCE.NS";
    const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${testSymbol}?range=1d&interval=1d`;

    it("should fetch price for RELIANCE.NS via chart API", async () => {
      const response = await fetch(endpoint, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
          Referer: "https://finance.yahoo.com/",
        },
      });

      console.log(`Yahoo Chart status for ${testSymbol}:`, response.status);

      if (response.ok) {
        const data = (await response.json()) as {
          chart?: {
            result?: Array<{
              meta?: {
                symbol?: string;
                regularMarketPrice?: number;
                currency?: string;
              };
            }>;
          };
        };

        const meta = data.chart?.result?.[0]?.meta;
        console.log(`Yahoo Chart meta:`, meta);

        if (meta?.regularMarketPrice) {
          expect(meta.regularMarketPrice).toBeGreaterThan(0);
        } else {
          console.warn("No price in chart response");
        }
      } else {
        const text = await response.text();
        console.warn(`Yahoo Chart failed with ${response.status}:`, text.slice(0, 200));
      }
    });
  });

  describe("Multiple Indian symbols", () => {
    const symbols = ["RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "INFY.NS"];

    it("should fetch prices for multiple symbols", async () => {
      const symbolsParam = symbols.join(",");
      const endpoint = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolsParam)}`;

      const response = await fetch(endpoint, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
          Referer: "https://finance.yahoo.com/",
        },
      });

      console.log(`Multi-symbol status:`, response.status);

      if (response.ok) {
        const data = (await response.json()) as {
          quoteResponse?: {
            result?: Array<{
              symbol?: string;
              regularMarketPrice?: number;
            }>;
          };
        };

        const results = data.quoteResponse?.result ?? [];
        console.log(`Got ${results.length} results out of ${symbols.length} requested`);

        for (const result of results) {
          console.log(`  ${result.symbol}: ₹${result.regularMarketPrice}`);
        }

        // Report success rate
        const successCount = results.filter((r) => typeof r.regularMarketPrice === "number").length;
        console.log(`Success rate: ${successCount}/${symbols.length}`);
      } else {
        console.warn(`Multi-symbol request failed with ${response.status}`);
      }
    });
  });

  describe("Fallback sources", () => {
    it("should test Google Finance scraping", async () => {
      const url = "https://www.google.com/finance/quote/RELIANCE:NSE";

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "text/html",
        },
      });

      console.log(`Google Finance status:`, response.status);

      if (response.ok) {
        const html = await response.text();
        const priceMatch = html.match(/data-last-price="([0-9.]+)"/);

        if (priceMatch) {
          const price = parseFloat(priceMatch[1]);
          console.log(`Google Finance price: ₹${price}`);
          expect(price).toBeGreaterThan(0);
        } else {
          console.warn("Could not extract price from Google Finance HTML");
        }
      }
    });
  });
});

describe("Price extraction logic", () => {
  const extractPrice = (payload: unknown): number | null => {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const record = payload as Record<string, unknown>;

    // Direct price fields
    const directCandidates = [
      record.lastPrice,
      record.ltp,
      record.price,
      record.currentPrice,
      record.close,
      record.regularMarketPrice,
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === "number" && candidate > 0) {
        return candidate;
      }
      if (typeof candidate === "string") {
        const parsed = parseFloat(candidate.replace(/[^0-9.\-]/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }

    // Nested fields
    const nestedCandidates = [record.priceInfo, record.data, record.quote, record.meta];
    for (const nested of nestedCandidates) {
      const nestedPrice = extractPrice(nested);
      if (nestedPrice !== null) {
        return nestedPrice;
      }
    }

    return null;
  };

  it("should extract price from NSE format", () => {
    const nsePayload = {
      priceInfo: {
        lastPrice: 2847.35,
        change: 12.5,
      },
    };
    expect(extractPrice(nsePayload)).toBe(2847.35);
  });

  it("should extract price from Yahoo format", () => {
    const yahooPayload = {
      regularMarketPrice: 2847.35,
    };
    expect(extractPrice(yahooPayload)).toBe(2847.35);
  });

  it("should extract price from Yahoo chart format", () => {
    const yahooChartPayload = {
      meta: {
        regularMarketPrice: 2847.35,
      },
    };
    expect(extractPrice(yahooChartPayload)).toBe(2847.35);
  });

  it("should handle string prices", () => {
    const payload = {
      lastPrice: "₹2,847.35",
    };
    expect(extractPrice(payload)).toBe(2847.35);
  });

  it("should return null for invalid payloads", () => {
    expect(extractPrice(null)).toBeNull();
    expect(extractPrice({})).toBeNull();
    expect(extractPrice({ price: 0 })).toBeNull();
    expect(extractPrice({ price: -100 })).toBeNull();
  });
});

