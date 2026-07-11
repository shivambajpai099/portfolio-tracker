#!/usr/bin/env npx ts-node
/**
 * Quick test script for Indian stock prices
 * Run: npx ts-node scripts/test-indian-stocks.ts
 */

const SYMBOLS = ["RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "INFY.NS"];

async function testYahooV7(symbol: string): Promise<{ price?: number; error?: string }> {
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
      },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json() as { quoteResponse?: { result?: Array<{ regularMarketPrice?: number }> } };
    const price = data.quoteResponse?.result?.[0]?.regularMarketPrice;
    return price ? { price } : { error: "No price in response" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown" };
  }
}

async function testYahooChart(symbol: string): Promise<{ price?: number; error?: string }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
      },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price ? { price } : { error: "No price in response" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown" };
  }
}

async function main() {
  console.log("Testing Indian stock price APIs...\n");

  for (const symbol of SYMBOLS) {
    console.log(`${symbol}:`);

    const v7 = await testYahooV7(symbol);
    console.log(`  Yahoo v7 Quote: ${v7.price ? `₹${v7.price}` : `❌ ${v7.error}`}`);

    const chart = await testYahooChart(symbol);
    console.log(`  Yahoo Chart:    ${chart.price ? `₹${chart.price}` : `❌ ${chart.error}`}`);

    console.log();
  }
}

main();

