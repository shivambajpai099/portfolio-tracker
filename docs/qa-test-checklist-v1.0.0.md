# Portfolio Tracker v1.0.0 - QA Test Checklist

Use this checklist for manual validation before release.

## 1) Authentication

- [ ] Signup succeeds with valid email/password
- [ ] Login succeeds with existing credentials
- [ ] Logout clears session and routes to login
- [ ] Session persists across app restart
- [ ] Auth redirects behave correctly (`(auth)` vs `(tabs)`)
- [ ] Missing Supabase env shows graceful error messages

## 2) Accounts and Cash

- [ ] Create BROKER account
- [ ] Create SAVINGS account with initial balance
- [ ] Edit account fields and persist changes
- [ ] Delete account removes linked holdings and cash rows
- [ ] Add INR/USD cash rows per account
- [ ] Inline cash edit updates totals correctly

## 3) Holdings CRUD

- [ ] Add holding via ticker search
- [ ] Live price fetch fills market price when available
- [ ] Fallback to average buy price if live price unavailable
- [ ] Edit holding quantity/average/market/account
- [ ] Delete holding updates totals and snapshots
- [ ] Refresh prices updates holdings market prices

## 4) Holdings Explorer

- [ ] Group by stock/account/country/asset type
- [ ] Sorting options reorder as expected
- [ ] Currency filter (ALL/INR/USD) works
- [ ] Performance filter (ALL/GAIN/LOSS) works
- [ ] Expand/collapse grouped lots works

## 5) Dashboard and Allocation Controls

- [ ] Geo filters (ALL/INDIA/US) affect dashboard values
- [ ] Allocation basis toggle (current/invested) updates list and percentages
- [ ] Include/exclude cash toggle changes denominator behavior
- [ ] Allocation donut and ranked list are consistent
- [ ] Concentration warning appears at non-low levels

## 6) Portfolio Health / Rebalancing / Deploy Cash

- [ ] Portfolio Health card renders with valid insights
- [ ] Target allocation save validates total ~= 100%
- [ ] Rebalancing suggestions reflect target/current deltas
- [ ] Deploy Cash allocation bars update with entered amount
- [ ] Rebalancing/edit target flow persists across restart

## 7) X-Ray

- [ ] Top 5/Top 10/largest/cash metrics calculate
- [ ] Country donut + legend values align
- [ ] Sector donut + rows render without crashes
- [ ] US target delta insight shown when target exists

## 8) Drift

- [ ] New snapshots are stored when holdings/cash are updated
- [ ] 1M/3M/6M comparison cards render when enough history exists
- [ ] Allocation change text and trend arrows are consistent
- [ ] Top holdings drift section updates correctly

## 9) Timeline + Monthly Review

- [ ] 1M/3M/6M/1Y/ALL filters update chart scope
- [ ] Total/Invested/Gain charts render and can select points
- [ ] Summary deltas update per selected range
- [ ] Monthly review metrics populate for selected month
- [ ] Narrative summary text updates correctly
- [ ] Export monthly review as image works (web download/native share)

## 10) Settings / Data Ops

- [ ] FX rate save updates calculations
- [ ] Reporting currency switch updates money formatting
- [ ] Allocation setting controls persist
- [ ] History retention (6M/1Y/2Y/ALL) prunes snapshot history
- [ ] JSON export creates valid file
- [ ] JSON import restores data correctly
- [ ] Clear all data empties portfolio state

## 11) Cloud Sync

- [ ] Local state loads immediately before cloud sync
- [ ] New user seeds cloud snapshot on first sync
- [ ] Local updates push to cloud (debounced)
- [ ] Pull newer remote snapshot replaces local
- [ ] Sync recovers after transient network failures
- [ ] User A cannot access User B snapshot (RLS policy check)

## 12) API/Proxy

- [ ] `/api/search` returns quotes for valid query
- [ ] `/api/quote` returns quoteResponse for valid symbols
- [ ] Cached responses return `X-Cache: HIT/STALE` as expected
- [ ] Upstream failures return graceful fallback/error
- [ ] Symbol validation/rate limits are respected

## 13) Cross-Platform Basics

- [ ] iOS: primary flows run without blocking errors
- [ ] Android: primary flows run without blocking errors
- [ ] Web: routes load without 404 under Vercel rewrites
- [ ] Web favicon and dark theme metadata present

## Exit Criteria

Release can proceed when:

- [ ] All P0/P1 defects are resolved
- [ ] No data-loss bug remains in import/export/sync flows
- [ ] No auth or RLS breach is present
- [ ] Core workflows complete on all target platforms

