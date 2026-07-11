#!/usr/bin/env node
/**
 * Test the nse-bse-api package for Indian stock prices
 * Run: node scripts/test-nse-bse-api.mjs
 */

const SYMBOLS = ["RELIANCE", "HDFCBANK", "TCS", "INFY"];

async function main() {
  console.log("Testing nse-bse-api package...\n");

  try {
    // Dynamic import of nse-bse-api
    const nseBseApi = await import("nse-bse-api");

    console.log("Available exports:", Object.keys(nseBseApi));
    console.log();

    // Try different method patterns
    const methodsToTry = [
      "getEquityStockQuote",
      "getEquityDetails",
      "getQuote",
      "getStockQuote",
      "getNseQuote",
      "getBseQuote",
    ];

    for (const methodName of methodsToTry) {
      const method = nseBseApi[methodName] || nseBseApi.default?.[methodName];
      if (typeof method === "function") {
        console.log(`Found method: ${methodName}`);
      }
    }

    console.log("\n--- Testing with RELIANCE ---\n");

    // Try getEquityStockQuote (most common pattern)
    if (typeof nseBseApi.getEquityStockQuote === "function") {
      try {
        console.log("Calling getEquityStockQuote('RELIANCE')...");
        const result = await nseBseApi.getEquityStockQuote("RELIANCE");
        console.log("Result:", JSON.stringify(result, null, 2).slice(0, 1000));
      } catch (e) {
        console.log("Error:", e.message);
      }
    }

    // Try getEquityDetails
    if (typeof nseBseApi.getEquityDetails === "function") {
      try {
        console.log("\nCalling getEquityDetails('RELIANCE')...");
        const result = await nseBseApi.getEquityDetails("RELIANCE");
        console.log("Result:", JSON.stringify(result, null, 2).slice(0, 1000));
      } catch (e) {
        console.log("Error:", e.message);
      }
    }

    // Check for default export
    if (nseBseApi.default) {
      console.log("\nDefault export methods:", Object.keys(nseBseApi.default));
    }

  } catch (error) {
    console.error("Failed to import nse-bse-api:", error.message);
    console.log("\nTrying alternative approach...");

    // Try fetching from NSE API directly
    console.log("\n--- Direct NSE API Test ---\n");

    try {
      // First get cookies
      const homeRes = await fetch("https://www.nseindia.com", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });

      const cookies = homeRes.headers.get("set-cookie") || "";
      console.log("Got cookies:", cookies.slice(0, 100), "...");

      // Then fetch quote
      const quoteRes = await fetch("https://www.nseindia.com/api/quote-equity?symbol=RELIANCE", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
          Referer: "https://www.nseindia.com/",
          Cookie: cookies,
        },
      });

      console.log("NSE Quote Status:", quoteRes.status);

      if (quoteRes.ok) {
        const data = await quoteRes.json();
        console.log("Price:", data.priceInfo?.lastPrice);
      } else {
        const text = await quoteRes.text();
        console.log("Error response:", text.slice(0, 200));
      }
    } catch (e) {
      console.error("NSE API error:", e.message);
    }
  }
}

main();

