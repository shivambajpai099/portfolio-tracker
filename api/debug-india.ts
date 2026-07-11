import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Debug endpoint to test Indian stock price fetching
 * GET /api/debug-india?symbols=RELIANCE.NS,HDFCBANK.NS
 */

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUOTE_URL = "https://query2.finance.yahoo.com/v7/finance/quote";

interface TestResult {
  source: string;
  symbol: string;
  success: boolean;
  price?: number;
  currency?: string;
  error?: string;
  responseStatus?: number;
  responseTime?: number;
}

const testYahooChart = async (symbol: string): Promise<TestResult> => {
  const start = Date.now();
  try {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
      },
    });

    const responseTime = Date.now() - start;

    if (!response.ok) {
      return {
        source: "Yahoo Chart API",
        symbol,
        success: false,
        error: `HTTP ${response.status}`,
        responseStatus: response.status,
        responseTime,
      };
    }

    const data = await response.json() as {
      chart?: {
        result?: Array<{ meta?: { regularMarketPrice?: number; currency?: string } }>;
        error?: { description?: string };
      };
    };

    if (data.chart?.error) {
      return {
        source: "Yahoo Chart API",
        symbol,
        success: false,
        error: data.chart.error.description,
        responseTime,
      };
    }

    const meta = data.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
      return {
        source: "Yahoo Chart API",
        symbol,
        success: true,
        price: meta.regularMarketPrice,
        currency: meta.currency,
        responseTime,
      };
    }

    return {
      source: "Yahoo Chart API",
      symbol,
      success: false,
      error: "No price in response",
      responseTime,
    };
  } catch (err) {
    return {
      source: "Yahoo Chart API",
      symbol,
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      responseTime: Date.now() - start,
    };
  }
};

const testYahooV7 = async (symbols: string[]): Promise<TestResult[]> => {
  const start = Date.now();
  try {
    const url = `${YAHOO_QUOTE_URL}?symbols=${encodeURIComponent(symbols.join(","))}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
      },
    });

    const responseTime = Date.now() - start;

    if (!response.ok) {
      return symbols.map((symbol) => ({
        source: "Yahoo v7 API",
        symbol,
        success: false,
        error: `HTTP ${response.status}`,
        responseStatus: response.status,
        responseTime,
      }));
    }

    const data = await response.json() as {
      quoteResponse?: {
        result?: Array<{ symbol?: string; regularMarketPrice?: number; currency?: string }>;
      };
    };

    const results = data.quoteResponse?.result ?? [];
    const resultMap = new Map(results.map((r) => [r.symbol, r]));

    return symbols.map((symbol) => {
      const r = resultMap.get(symbol);
      if (r?.regularMarketPrice && r.regularMarketPrice > 0) {
        return {
          source: "Yahoo v7 API",
          symbol,
          success: true,
          price: r.regularMarketPrice,
          currency: r.currency,
          responseTime,
        };
      }
      return {
        source: "Yahoo v7 API",
        symbol,
        success: false,
        error: "Not in response",
        responseTime,
      };
    });
  } catch (err) {
    return symbols.map((symbol) => ({
      source: "Yahoo v7 API",
      symbol,
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      responseTime: Date.now() - start,
    }));
  }
};

const testNseBseApi = async (symbols: string[]): Promise<TestResult[]> => {
  const results: TestResult[] = [];

  try {
    const start = Date.now();
    const nseBseApi = await import("nse-bse-api") as Record<string, unknown>;
    const importTime = Date.now() - start;

    const exports = Object.keys(nseBseApi);
    console.log(`nse-bse-api loaded in ${importTime}ms. Exports:`, exports);

    const methodsToTry = ["getEquityStockQuote", "getEquityDetails", "getQuote"];

    for (const symbol of symbols) {
      const baseSymbol = symbol.replace(/\.(NS|BO)$/i, "");
      let found = false;

      for (const methodName of methodsToTry) {
        let method = nseBseApi[methodName];
        if (!method && nseBseApi.default && typeof nseBseApi.default === "object") {
          method = (nseBseApi.default as Record<string, unknown>)[methodName];
        }

        if (typeof method !== "function") continue;

        try {
          const methodStart = Date.now();
          const data = await (method as (s: string) => Promise<unknown>)(baseSymbol);
          const methodTime = Date.now() - methodStart;

          // Extract price from various possible structures
          const extractPrice = (obj: unknown): number | null => {
            if (!obj || typeof obj !== "object") return null;
            const record = obj as Record<string, unknown>;
            
            const candidates = [
              record.lastPrice,
              record.ltp,
              record.price,
              (record.priceInfo as Record<string, unknown>)?.lastPrice,
            ];

            for (const c of candidates) {
              if (typeof c === "number" && c > 0) return c;
              if (typeof c === "string") {
                const parsed = parseFloat(c.replace(/[^0-9.\-]/g, ""));
                if (parsed > 0) return parsed;
              }
            }
            return null;
          };

          const price = extractPrice(data);

          if (price !== null && price > 0) {
            results.push({
              source: `nse-bse-api (${methodName})`,
              symbol,
              success: true,
              price,
              currency: "INR",
              responseTime: methodTime,
            });
            found = true;
            break;
          }
        } catch (err) {
          // Try next method
        }
      }

      if (!found) {
        results.push({
          source: "nse-bse-api",
          symbol,
          success: false,
          error: "No method returned price",
        });
      }
    }
  } catch (err) {
    return symbols.map((symbol) => ({
      source: "nse-bse-api",
      symbol,
      success: false,
      error: `Module import failed: ${err instanceof Error ? err.message : "Unknown"}`,
    }));
  }

  return results;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const rawSymbols = String(req.query.symbols ?? "RELIANCE.NS,HDFCBANK.NS,TCS.NS");
  const symbols = rawSymbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  console.log(`[debug-india] Testing symbols: ${symbols.join(", ")}`);

  const allResults: TestResult[] = [];

  // Test Yahoo Chart API (parallel)
  console.log("[debug-india] Testing Yahoo Chart API...");
  const chartResults = await Promise.all(symbols.map(testYahooChart));
  allResults.push(...chartResults);

  // Test Yahoo v7 API (batch)
  console.log("[debug-india] Testing Yahoo v7 API...");
  const v7Results = await testYahooV7(symbols);
  allResults.push(...v7Results);

  // Test nse-bse-api
  console.log("[debug-india] Testing nse-bse-api...");
  const nseBseResults = await testNseBseApi(symbols);
  allResults.push(...nseBseResults);

  // Summary
  const summary = {
    timestamp: new Date().toISOString(),
    symbols,
    results: allResults,
    successRates: {
      yahooChart: chartResults.filter((r) => r.success).length + "/" + chartResults.length,
      yahooV7: v7Results.filter((r) => r.success).length + "/" + v7Results.length,
      nseBseApi: nseBseResults.filter((r) => r.success).length + "/" + nseBseResults.length,
    },
    workingSources: [
      ...new Set(allResults.filter((r) => r.success).map((r) => r.source)),
    ],
  };

  console.log("[debug-india] Summary:", JSON.stringify(summary.successRates));

  res.status(200).json(summary);
}


