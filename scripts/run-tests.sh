#!/bin/bash
# Test Indian Stock Price Fetching
# Run this script: bash scripts/run-tests.sh

echo "================================================"
echo "Indian Stock Price Fetch Tests"
echo "================================================"
echo ""

# Install dependencies first
echo "1. Installing dependencies..."
npm install

echo ""
echo "2. Running quick API test..."
echo ""

# Test Yahoo Chart API directly (most reliable for Indian stocks)
echo "Testing RELIANCE.NS via Yahoo Chart API:"
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?range=1d&interval=1d" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Accept: application/json" \
  -H "Referer: https://finance.yahoo.com/" | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    const meta = data?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice) {
      console.log('  ✅ Price: ₹' + meta.regularMarketPrice);
      console.log('  Currency: ' + meta.currency);
      console.log('  Exchange: ' + meta.fullExchangeName);
    } else {
      console.log('  ❌ No price found');
      console.log('  Response:', JSON.stringify(data).slice(0, 200));
    }
  "

echo ""
echo "Testing HDFCBANK.NS via Yahoo Chart API:"
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/HDFCBANK.NS?range=1d&interval=1d" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Accept: application/json" \
  -H "Referer: https://finance.yahoo.com/" | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    const meta = data?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice) {
      console.log('  ✅ Price: ₹' + meta.regularMarketPrice);
    } else {
      console.log('  ❌ No price found');
    }
  "

echo ""
echo "Testing TCS.NS via Yahoo Chart API:"
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/TCS.NS?range=1d&interval=1d" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Accept: application/json" \
  -H "Referer: https://finance.yahoo.com/" | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    const meta = data?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice) {
      console.log('  ✅ Price: ₹' + meta.regularMarketPrice);
    } else {
      console.log('  ❌ No price found');
    }
  "

echo ""
echo "================================================"
echo "3. Testing Yahoo v7 Quote API (batch):"
echo "================================================"
curl -s "https://query2.finance.yahoo.com/v7/finance/quote?symbols=RELIANCE.NS,HDFCBANK.NS,TCS.NS" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Accept: application/json" \
  -H "Referer: https://finance.yahoo.com/" | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    const results = data?.quoteResponse?.result ?? [];
    if (results.length > 0) {
      results.forEach(r => {
        console.log('  ' + r.symbol + ': ₹' + r.regularMarketPrice);
      });
    } else {
      console.log('  ❌ No results (API may be rate-limited)');
      console.log('  Response:', JSON.stringify(data).slice(0, 300));
    }
  "

echo ""
echo "================================================"
echo "Done! If Chart API works but v7 doesn't, that's normal."
echo "The api/quote.ts now uses Chart API as primary for Indian stocks."
echo "================================================"

