/**
 * Debug utility for Indian stock price fetching
 * 
 * To use in the browser console:
 * 1. Copy this file content
 * 2. Paste in browser console on your app
 * 3. Run: debugIndianStocks()
 */

export async function debugIndianStocks() {
  const symbols = ["RELIANCE.NS", "HDFCBANK.NS", "TCS.NS"];
  
  console.group("🇮🇳 Indian Stock Price Debug");
  console.log("Testing symbols:", symbols);
  console.log("Timestamp:", new Date().toISOString());
  console.log("");

  // Test 1: Proxy endpoint (/api/quote)
  console.group("1️⃣ Proxy API (/api/quote)");
  try {
    const proxyUrl = `/api/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
    console.log("URL:", proxyUrl);
    
    const res = await fetch(proxyUrl);
    console.log("Status:", res.status);
    
    if (res.ok) {
      const data = await res.json();
      const results = data?.quoteResponse?.result ?? [];
      console.log("Results count:", results.length);
      
      for (const r of results) {
        console.log(`  ${r.symbol}: ₹${r.regularMarketPrice}`);
      }
      
      if (results.length === 0) {
        console.warn("⚠️ Proxy returned empty results");
      }
    } else {
      const text = await res.text();
      console.error("❌ Proxy failed:", text.slice(0, 200));
    }
  } catch (err) {
    console.error("❌ Proxy error:", err);
  }
  console.groupEnd();

  // Test 2: Direct Yahoo v7 Quote API
  console.group("2️⃣ Direct Yahoo v7 Quote API");
  try {
    const yahooUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
    console.log("URL:", yahooUrl);
    
    const res = await fetch(yahooUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
      },
    });
    console.log("Status:", res.status);
    
    if (res.ok) {
      const data = await res.json();
      const results = data?.quoteResponse?.result ?? [];
      console.log("Results count:", results.length);
      
      for (const r of results) {
        console.log(`  ${r.symbol}: ₹${r.regularMarketPrice}`);
      }
    } else {
      const text = await res.text();
      console.error("❌ Yahoo v7 failed:", text.slice(0, 200));
    }
  } catch (err) {
    console.error("❌ Yahoo v7 error:", err);
  }
  console.groupEnd();

  // Test 3: Direct Yahoo Chart API
  console.group("3️⃣ Direct Yahoo Chart API");
  for (const symbol of symbols.slice(0, 1)) {
    try {
      const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
      console.log(`URL (${symbol}):`, chartUrl);
      
      const res = await fetch(chartUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
          Referer: "https://finance.yahoo.com/",
        },
      });
      console.log("Status:", res.status);
      
      if (res.ok) {
        const data = await res.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        console.log(`  ${symbol}: ₹${price}`);
      } else {
        const text = await res.text();
        console.error("❌ Yahoo Chart failed:", text.slice(0, 200));
      }
    } catch (err) {
      console.error("❌ Yahoo Chart error:", err);
    }
  }
  console.groupEnd();

  console.groupEnd();
  
  console.log("\n📋 Summary:");
  console.log("If proxy API works but returns empty results, check server logs in Vercel.");
  console.log("If direct Yahoo APIs fail, they may be blocking your IP or CORS is an issue.");
  console.log("The app should be using /api/quote on web, which proxies through Vercel.");
}

// Auto-run if in browser
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).debugIndianStocks = debugIndianStocks;
  console.log("🔧 Debug utility loaded. Run: debugIndianStocks()");
}

