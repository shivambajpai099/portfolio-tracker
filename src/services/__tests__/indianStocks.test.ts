/**
 * Tests for Indian stock price fetching
 *
 * Run with:
 *   npx ts-node src/services/__tests__/indianStocks.test.ts
 *
 * Or after installing jest:
 *   npm install --save-dev jest @types/jest ts-jest
 *   npx jest src/services/__tests__/indianStocks.test.ts
 */

const INDIAN_TEST_SYMBOLS = ["RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "INFY.NS", "TATAMOTORS.BO"];

const YAHOO_QUOTE_BASE_URLS = [
  "https://query2.finance.yahoo.com",
  "https://query1.finance.yahoo.com",
];

const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

interface TestResult {
  symbol: string;
  source: string;
  success: boolean;
  price?: number;
  error?: string;
  responseStatus?: number;
  responseBody?: string;
}

async function testYahooQuoteApi(symbol: string): Promise<TestResult> {
  const path = `/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;

  for (const baseUrl of YAHOO_QUOTE_BASE_URLS) {
    const endpoint = `${baseUrl}${path}`;

    try {
      const response = await fetch(endpoint, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://finance.yahoo.com/",
        },
      });

      const text = await response.text();

      if (!response.ok) {
        return {
          symbol,
          source: `Yahoo Quote (${baseUrl})`,
          success: false,
          responseStatus: response.status,
          responseBody: text.slice(0, 500),
          error: `HTTP ${response.status}`,
        };
      }

      const payload = JSON.parse(text) as {
        quoteResponse?: {
          result?: Array<{
            symbol?: string;
            regularMarketPrice?: number;
          }>;
        };
      };

      const price = payload.quoteResponse?.result?.[0]?.regularMarketPrice;

      if (typeof price === "number" && price > 0) {
        return {
          symbol,
          source: `Yahoo Quote (${baseUrl})`,
          success: true,
          price,
        };
      }

      return {
        symbol,
        source: `Yahoo Quote (${baseUrl})`,
        success: false,
        error: "Price not found in response",
        responseBody: text.slice(0, 500),
      };
    } catch (error) {
      // Try next URL
      continue;
    }
  }

  return {
    symbol,
    source: "Yahoo Quote (all URLs)",
    success: false,
    error: "All Yahoo Quote URLs failed",
  };
}

async function testYahooChartApi(symbol: string): Promise<TestResult> {
  const endpoint = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false&events=div,splits`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://finance.yahoo.com/",
      },
    });

    const text = await response.text();

    if (!response.ok) {
      return {
        symbol,
        source: "Yahoo Chart API",
        success: false,
        responseStatus: response.status,
        responseBody: text.slice(0, 500),
        error: `HTTP ${response.status}`,
      };
    }

    const payload = JSON.parse(text) as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
          };
        }>;
      };
    };

    const price = payload.chart?.result?.[0]?.meta?.regularMarketPrice;

    if (typeof price === "number" && price > 0) {
      return {
        symbol,
        source: "Yahoo Chart API",
        success: true,
        price,
      };
    }

    return {
      symbol,
      source: "Yahoo Chart API",
      success: false,
      error: "Price not found in response",
      responseBody: text.slice(0, 500),
    };
  } catch (error) {
    return {
      symbol,
      source: "Yahoo Chart API",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function testNseDirectApi(symbol: string): Promise<TestResult> {
  // Only test .NS symbols with NSE API
  if (!symbol.endsWith(".NS")) {
    return {
      symbol,
      source: "NSE Direct API",
      success: false,
      error: "Not an NSE symbol",
    };
  }

  const baseSymbol = symbol.replace(/\.NS$/i, "");
  const endpoint = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(baseSymbol)}`;

  try {
    // First get cookies from NSE homepage
    const homeResponse = await fetch("https://www.nseindia.com", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    // Extract cookies - this is tricky in Node.js
    const cookies = homeResponse.headers.get("set-cookie") ?? "";

    const response = await fetch(endpoint, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.nseindia.com/",
        Cookie: cookies,
      },
    });

    const text = await response.text();

    if (!response.ok) {
      return {
        symbol,
        source: "NSE Direct API",
        success: false,
        responseStatus: response.status,
        responseBody: text.slice(0, 500),
        error: `HTTP ${response.status}`,
      };
    }

    const payload = JSON.parse(text) as {
      priceInfo?: { lastPrice?: number };
    };

    const price = payload.priceInfo?.lastPrice;

    if (typeof price === "number" && price > 0) {
      return {
        symbol,
        source: "NSE Direct API",
        success: true,
        price,
      };
    }

    return {
      symbol,
      source: "NSE Direct API",
      success: false,
      error: "Price not found in response",
      responseBody: text.slice(0, 500),
    };
  } catch (error) {
    return {
      symbol,
      source: "NSE Direct API",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function testGoogleFinance(symbol: string): Promise<TestResult> {
  // Google Finance uses different symbol formats
  // RELIANCE.NS -> RELIANCE:NSE
  const baseSymbol = symbol.replace(/\.(NS|BO)$/i, "");
  const exchange = symbol.endsWith(".BO") ? "BOM" : "NSE";

  const url = `https://www.google.com/finance/quote/${baseSymbol}:${exchange}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const text = await response.text();

    if (!response.ok) {
      return {
        symbol,
        source: "Google Finance",
        success: false,
        responseStatus: response.status,
        error: `HTTP ${response.status}`,
      };
    }

    // Try to extract price from HTML (very basic scraping)
    // Google Finance puts the price in a div with data-last-price attribute
    const priceMatch = text.match(/data-last-price="([0-9.]+)"/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      if (price > 0) {
        return {
          symbol,
          source: "Google Finance",
          success: true,
          price,
        };
      }
    }

    // Alternative: look for price in YMlKec class (known Google Finance pattern)
    const altMatch = text.match(/class="YMlKec fxKbKc"[^>]*>₹?([0-9,]+\.?[0-9]*)</);
    if (altMatch) {
      const price = parseFloat(altMatch[1].replace(/,/g, ""));
      if (price > 0) {
        return {
          symbol,
          source: "Google Finance",
          success: true,
          price,
        };
      }
    }

    return {
      symbol,
      source: "Google Finance",
      success: false,
      error: "Could not extract price from HTML",
      responseBody: text.slice(0, 300),
    };
  } catch (error) {
    return {
      symbol,
      source: "Google Finance",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function runAllTests(): Promise<void> {
  console.log("=".repeat(80));
  console.log("INDIAN STOCK PRICE FETCH TESTS");
  console.log("=".repeat(80));
  console.log(`Testing symbols: ${INDIAN_TEST_SYMBOLS.join(", ")}\n`);

  const allResults: TestResult[] = [];

  for (const symbol of INDIAN_TEST_SYMBOLS) {
    console.log(`\n--- Testing ${symbol} ---\n`);

    // Test all sources
    const yahooQuote = await testYahooQuoteApi(symbol);
    console.log(`Yahoo Quote: ${yahooQuote.success ? `✅ ₹${yahooQuote.price}` : `❌ ${yahooQuote.error}`}`);
    if (!yahooQuote.success && yahooQuote.responseStatus) {
      console.log(`  Status: ${yahooQuote.responseStatus}`);
    }
    if (!yahooQuote.success && yahooQuote.responseBody) {
      console.log(`  Response: ${yahooQuote.responseBody.slice(0, 200)}...`);
    }
    allResults.push(yahooQuote);

    const yahooChart = await testYahooChartApi(symbol);
    console.log(`Yahoo Chart: ${yahooChart.success ? `✅ ₹${yahooChart.price}` : `❌ ${yahooChart.error}`}`);
    if (!yahooChart.success && yahooChart.responseStatus) {
      console.log(`  Status: ${yahooChart.responseStatus}`);
    }
    allResults.push(yahooChart);

    const nseDirect = await testNseDirectApi(symbol);
    console.log(`NSE Direct:  ${nseDirect.success ? `✅ ₹${nseDirect.price}` : `❌ ${nseDirect.error}`}`);
    if (!nseDirect.success && nseDirect.responseStatus) {
      console.log(`  Status: ${nseDirect.responseStatus}`);
    }
    allResults.push(nseDirect);

    const googleFinance = await testGoogleFinance(symbol);
    console.log(`Google Fin:  ${googleFinance.success ? `✅ ₹${googleFinance.price}` : `❌ ${googleFinance.error}`}`);
    allResults.push(googleFinance);

    // Add a small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  const bySource = new Map<string, { success: number; failed: number }>();

  for (const result of allResults) {
    const source = result.source.split(" (")[0]; // Normalize source name
    const current = bySource.get(source) ?? { success: 0, failed: 0 };
    if (result.success) {
      current.success += 1;
    } else {
      current.failed += 1;
    }
    bySource.set(source, current);
  }

  for (const [source, stats] of bySource) {
    const total = stats.success + stats.failed;
    const rate = Math.round((stats.success / total) * 100);
    console.log(`${source}: ${stats.success}/${total} (${rate}%)`);
  }

  // Recommendations
  console.log("\n" + "=".repeat(80));
  console.log("RECOMMENDATIONS");
  console.log("=".repeat(80));

  const bestSource = [...bySource.entries()].sort((a, b) => b[1].success - a[1].success)[0];
  if (bestSource && bestSource[1].success > 0) {
    console.log(`\n✅ Best working source: ${bestSource[0]} (${bestSource[1].success} successes)`);
  } else {
    console.log("\n❌ No source is currently working for Indian stocks!");
    console.log("\nPossible solutions:");
    console.log("1. Use nse-bse-api package (already installed)");
    console.log("2. Try a different market data provider (e.g., Alpha Vantage, Twelve Data)");
    console.log("3. Use server-side proxy with proper cookie handling for NSE");
  }
}

// Run tests
runAllTests().catch(console.error);

