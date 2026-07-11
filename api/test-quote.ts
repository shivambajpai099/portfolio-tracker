import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Simple test endpoint that directly fetches from Yahoo Chart API
 * GET /api/test-quote?symbols=RELIANCE.NS,HDFCBANK.NS
 */

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

type YahooQuoteItem = {
  symbol: string;
  regularMarketPrice: number;
  regularMarketTime: number;
  currency: string;
  exchange: string;
  fullExchangeName: string;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  const rawSymbols = String(req.query.symbols ?? "RELIANCE.NS");
  const symbols = rawSymbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  console.log(`[test-quote] Symbols: ${symbols.join(", ")}`);

  const results: YahooQuoteItem[] = [];

  for (const symbol of symbols) {
    console.log(`[test-quote] Fetching ${symbol}...`);
    
    try {
      const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
      console.log(`[test-quote] URL: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
          Referer: "https://finance.yahoo.com/",
        },
      });

      console.log(`[test-quote] Response status: ${response.status}`);

      if (!response.ok) {
        console.log(`[test-quote] HTTP error for ${symbol}: ${response.status}`);
        continue;
      }

      const text = await response.text();
      console.log(`[test-quote] Response length: ${text.length}`);

      const data = JSON.parse(text) as {
        chart?: {
          result?: Array<{
            meta?: {
              symbol?: string;
              regularMarketPrice?: number;
              currency?: string;
              exchangeName?: string;
              fullExchangeName?: string;
              regularMarketTime?: number;
            };
          }>;
          error?: { description?: string };
        };
      };

      if (data.chart?.error) {
        console.log(`[test-quote] API error for ${symbol}: ${data.chart.error.description}`);
        continue;
      }

      const meta = data.chart?.result?.[0]?.meta;
      console.log(`[test-quote] Meta: ${JSON.stringify(meta)?.slice(0, 200)}`);

      if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
        results.push({
          symbol: meta.symbol ?? symbol,
          regularMarketPrice: meta.regularMarketPrice,
          regularMarketTime: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
          currency: meta.currency ?? "INR",
          exchange: meta.exchangeName ?? "NSE",
          fullExchangeName: meta.fullExchangeName ?? "NSE",
        });
        console.log(`[test-quote] Got price for ${symbol}: ${meta.regularMarketPrice}`);
      } else {
        console.log(`[test-quote] No price in meta for ${symbol}`);
      }
    } catch (error) {
      console.log(`[test-quote] Exception for ${symbol}:`, error);
    }
  }

  console.log(`[test-quote] Total results: ${results.length}`);

  // Return in same format as /api/quote
  res.status(200).json({
    quoteResponse: {
      result: results,
    },
  });
}
