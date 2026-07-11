/**
 * Simple test for Indian stock prices - no dependencies required
 * Run: node scripts/test-indian-prices.js
 */

const INDIAN_SYMBOLS = ["RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "INFY.NS"];

async function testYahooChartAPI(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
      },
    });
    
    if (!res.ok) {
      return { symbol, success: false, error: `HTTP ${res.status}`, source: "Chart API" };
    }
    
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    
    if (price && price > 0) {
      return { 
        symbol, 
        success: true, 
        price, 
        currency: meta.currency,
        exchange: meta.fullExchangeName,
        source: "Chart API"
      };
    }
    
    return { symbol, success: false, error: "No price in response", source: "Chart API" };
  } catch (err) {
    return { symbol, success: false, error: err.message, source: "Chart API" };
  }
}

async function testYahooV7API(symbols) {
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
      },
    });
    
    if (!res.ok) {
      return symbols.map(s => ({ symbol: s, success: false, error: `HTTP ${res.status}`, source: "v7 API" }));
    }
    
    const data = await res.json();
    const results = data?.quoteResponse?.result ?? [];
    
    const resultMap = new Map(results.map(r => [r.symbol, r]));
    
    return symbols.map(symbol => {
      const r = resultMap.get(symbol);
      if (r?.regularMarketPrice > 0) {
        return {
          symbol,
          success: true,
          price: r.regularMarketPrice,
          currency: r.currency,
          exchange: r.fullExchangeName,
          source: "v7 API"
        };
      }
      return { symbol, success: false, error: "Not in response", source: "v7 API" };
    });
  } catch (err) {
    return symbols.map(s => ({ symbol: s, success: false, error: err.message, source: "v7 API" }));
  }
}

async function testNseBseApi(symbols) {
  const results = [];
  
  try {
    const nseBseApi = await import("nse-bse-api");
    console.log("  nse-bse-api loaded. Exports:", Object.keys(nseBseApi).slice(0, 5).join(", "), "...");
    
    const methodsToTry = ["getEquityStockQuote", "getEquityDetails", "getQuote"];
    
    for (const symbol of symbols) {
      const baseSymbol = symbol.replace(/\.(NS|BO)$/i, "");
      let found = false;
      
      for (const methodName of methodsToTry) {
        const method = nseBseApi[methodName] || nseBseApi.default?.[methodName];
        if (typeof method !== "function") continue;
        
        try {
          const data = await method(baseSymbol);
          const price = extractPrice(data);
          
          if (price && price > 0) {
            results.push({
              symbol,
              success: true,
              price,
              source: `nse-bse-api (${methodName})`
            });
            found = true;
            break;
          }
        } catch {
          // Try next method
        }
      }
      
      if (!found) {
        results.push({ symbol, success: false, error: "No method worked", source: "nse-bse-api" });
      }
    }
  } catch (err) {
    console.log("  Could not import nse-bse-api:", err.message);
    return symbols.map(s => ({ symbol: s, success: false, error: "Module not available", source: "nse-bse-api" }));
  }
  
  return results;
}

function extractPrice(payload) {
  if (!payload || typeof payload !== "object") return null;
  
  const candidates = [
    payload.lastPrice,
    payload.ltp,
    payload.price,
    payload.currentPrice,
    payload.close,
    payload.priceInfo?.lastPrice,
    payload.data?.lastPrice,
  ];
  
  for (const c of candidates) {
    if (typeof c === "number" && c > 0) return c;
    if (typeof c === "string") {
      const parsed = parseFloat(c.replace(/[^0-9.\-]/g, ""));
      if (parsed > 0) return parsed;
    }
  }
  
  return null;
}

async function main() {
  console.log("=".repeat(60));
  console.log("INDIAN STOCK PRICE TEST");
  console.log("=".repeat(60));
  console.log(`Testing: ${INDIAN_SYMBOLS.join(", ")}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log("");

  // Test 1: Yahoo Chart API (individual requests)
  console.log("📊 Yahoo Chart API (primary for Indian stocks):");
  console.log("-".repeat(60));
  
  let chartSuccessCount = 0;
  for (const symbol of INDIAN_SYMBOLS) {
    const result = await testYahooChartAPI(symbol);
    if (result.success) {
      console.log(`  ✅ ${result.symbol}: ₹${result.price.toLocaleString()} (${result.exchange})`);
      chartSuccessCount++;
    } else {
      console.log(`  ❌ ${result.symbol}: ${result.error}`);
    }
  }
  console.log(`  Success rate: ${chartSuccessCount}/${INDIAN_SYMBOLS.length}`);
  console.log("");

  // Test 2: Yahoo v7 API (batch request)
  console.log("📊 Yahoo v7 Quote API (batch):");
  console.log("-".repeat(60));
  
  const v7Results = await testYahooV7API(INDIAN_SYMBOLS);
  let v7SuccessCount = 0;
  for (const result of v7Results) {
    if (result.success) {
      console.log(`  ✅ ${result.symbol}: ₹${result.price.toLocaleString()}`);
      v7SuccessCount++;
    } else {
      console.log(`  ❌ ${result.symbol}: ${result.error}`);
    }
  }
  console.log(`  Success rate: ${v7SuccessCount}/${INDIAN_SYMBOLS.length}`);
  console.log("");

  // Test 3: nse-bse-api package (fallback)
  console.log("📊 nse-bse-api package (fallback):");
  console.log("-".repeat(60));
  
  const nseBseResults = await testNseBseApi(INDIAN_SYMBOLS);
  let nseBseSuccessCount = 0;
  for (const result of nseBseResults) {
    if (result.success) {
      console.log(`  ✅ ${result.symbol}: ₹${result.price.toLocaleString()} (${result.source})`);
      nseBseSuccessCount++;
    } else {
      console.log(`  ❌ ${result.symbol}: ${result.error}`);
    }
  }
  console.log(`  Success rate: ${nseBseSuccessCount}/${INDIAN_SYMBOLS.length}`);
  console.log("");

  // Summary
  console.log("=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Yahoo Chart API:  ${chartSuccessCount}/${INDIAN_SYMBOLS.length} successful`);
  console.log(`Yahoo v7 API:     ${v7SuccessCount}/${INDIAN_SYMBOLS.length} successful`);
  console.log(`nse-bse-api:      ${nseBseSuccessCount}/${INDIAN_SYMBOLS.length} successful`);
  console.log("");
  
  const anyWorking = chartSuccessCount > 0 || v7SuccessCount > 0 || nseBseSuccessCount > 0;
  
  if (anyWorking) {
    console.log("✅ At least one data source is working for Indian stocks!");
    console.log("");
    console.log("Fallback order in api/quote.ts:");
    console.log("  1. Yahoo Chart API (primary)");
    console.log("  2. Yahoo v7 Quote API");
    console.log("  3. nse-bse-api package");
  } else {
    console.log("❌ All APIs failed - possible causes:");
    console.log("   1. Rate limiting from all providers");
    console.log("   2. Network/firewall blocking requests");
    console.log("   3. Market is closed and no cached data");
    console.log("");
    console.log("Try again in a few minutes, or check from a different network.");
  }
}

main().catch(console.error);

