# Insights Tab — Feature Audit

> Portable analysis of everything the **Insights** tab computes and renders. Paste this into any LLM to decide what to keep, simplify, or cut. Each item lists **what it shows**, **where the data comes from**, whether it is **actually rendered**, and a **verdict** (Keep / Question / Waste).

App: Portfolio Tracker (Expo / React Native, local-first). Reporting currency-aware (INR/USD). All money values converted via `convert()` + `fxRates`.

---

## 1. Where the code lives

| Concern | File |
|---|---|
| UI screen (live tab) | `app/(tabs)/insights.tsx` (~1,927 lines) |
| Analytics engine (pure) | `src/features/portfolio/transactionAnalytics.ts` (`calcTransactionAnalytics`) |
| FIFO realized gains | `src/features/portfolio/fifoCalculator.ts` (`getAllRealizations`) |
| Intraday filter | `src/features/portfolio/intraday.ts` (`excludeIntradayRoundTrips`) |
| Holdings source | `src/features/portfolio/selectors.ts` (`selectAllHoldings`) |
| Duplicate/hidden screen | `app/(tabs)/transactionInsights.tsx` (~1,248 lines, `href: null`) |

**Data inputs:** `transactions`, `holdings` (manual + FIFO-derived), `cashHoldings`, `allocationSnapshots`, `fxRates`, `settings`.

**Live tabs:** `index` (Portfolio), `insights` (Insights), `settings`. Everything else (`holdings`, `accounts`, `transactionInsights`, `xray`, `drift`, `timeline`) is hidden (`href: null`).

---

## 2. Screen structure

Fixed header + **3 collapsible groups**, each with collapsible **sub-sections** (accordion-in-accordion). 11 sub-sections total.

```
Header: Country allocation block (India / US / Cash split)
├─ Group 1: Performance
│   ├─ Performance Breakdown
│   ├─ Win Rate Analysis
│   ├─ Best & Worst
│   └─ Monthly Review
├─ Group 2: Portfolio Evolution
│   ├─ Risk Snapshot
│   ├─ Drift Over Time
│   └─ (Yearly allocation evolution)
└─ Group 3: Investing Behavior
    ├─ Capital Deployment
    ├─ DCA Insights
    ├─ Conviction Analysis
    ├─ Behavior Insights
    └─ Holding Periods
```

---

## 3. Feature-by-feature inventory

### Header — Country Allocation Block
- **Shows:** India vs US vs Cash split (% of equity and % of portfolio).
- **Source:** `holdings` + `cashHoldings`, `convert()`. Computed inline (`countryData`).
- **Rendered:** Yes.
- **Verdict:** **Keep** — core to the dual-market value prop. Overlaps Portfolio tab / X-ray; consider dedupe.

### Group 1 — Performance

**1.1 Performance Breakdown**
- **Shows:** Donut of Realized/Unrealized Gains & Losses + total return; per-asset breakdown.
- **Source:** `analytics.performance` (`calcPerformanceBreakdown`).
- **Rendered:** Yes. **Verdict:** **Keep** — highest-signal view.

**1.2 Win Rate Analysis**
- **Shows:** Win rate %, winners/losers, avg win/loss, profit factor, largest win/loss.
- **Source:** `analytics.winRate` (`calcWinRateAnalysis`) — per-lot closed trades from FIFO.
- **Rendered:** Yes. **Verdict:** **Question** — trading-desk framing vs anti-trading stance; valuable for active traders, noise for buy-and-hold. Now protected by intraday filter.

**1.3 Best & Worst**
- **Shows:** Best/worst investment, top 5 winners/losers by total return.
- **Source:** `analytics.bestWorst` (`calcBestWorstInvestments`).
- **Rendered:** Yes. **Verdict:** **Keep** — intuitive, universal.

**1.4 Monthly Review**
- **Shows:** Narrative sentences per month (value change, net capital added, gain/loss, best position).
- **Source:** `monthlyReviewData` from `allocationSnapshots` (NOT the analytics engine).
- **Rendered:** Yes (month picker). **Verdict:** **Question** — empty for new users; overlaps Drift; high maintenance.

### Group 2 — Portfolio Evolution

**2.1 Risk Snapshot**
- **Shows:** Concentration (top-5/top-10/largest %), sector breakdown.
- **Source:** `riskData` — `calcSymbolAllocations` + hardcoded `SYMBOL_SECTOR` + `inferSector()` heuristic.
- **Rendered:** Yes. **Verdict:** **Question** — duplicates X-ray; sector inference unreliable beyond ~15 symbols.

**2.2 Drift Over Time**
- **Shows:** 1M & 3M allocation & holding changes vs baseline snapshot.
- **Source:** `driftData` from `allocationSnapshots`.
- **Rendered:** Yes. **Verdict:** **Question** — duplicates Drift screen; empty without history.

**2.3 Yearly Allocation Evolution**
- **Shows:** Top-5 holdings' allocation per year.
- **Source:** `analytics.evolution.yearlyAllocations` (`calcPortfolioEvolution`).
- **Rendered:** Yes. **Verdict:** **Question** — cost-basis-weighted; needs multi-year history.

### Group 3 — Investing Behavior

**3.1 Capital Deployment**
- **Shows:** Total invested/withdrawn, net, avg monthly, largest month, largest single purchase, monthly/yearly/by-asset.
- **Source:** `analytics.capitalDeployment` (`calcCapitalDeployment`).
- **Rendered:** Yes. **Verdict:** **Keep** — factual, snapshot-independent.

**3.2 DCA Insights**
- **Shows:** Per-symbol multi-buy stats (count, avg/low/high buy price, gain vs avg cost, history).
- **Source:** `analytics.dca` (`calcDCAInsights`).
- **Rendered:** Yes. **Verdict:** **Question** — overlaps Conviction & Capital Deployment.

**3.3 Conviction Analysis**
- **Shows:** Top conviction / most accumulated positions by purchase count + invested + unrealized.
- **Source:** `analytics.conviction` (`calcConvictionAnalysis`).
- **Rendered:** Yes. **Verdict:** **Waste-ish / Merge** — "conviction = purchase count" is a weak proxy; restates DCA + Best/Worst.

**3.4 Behavior Insights**
- **Shows:** Auto badges (streaks, "Steady Saver"), avg/median trade size, largest/smallest trade, consecutive months, trade-size distribution, preferred day-of-week.
- **Source:** `analytics.behavior` (`calcInvestorBehaviorInsights`).
- **Rendered:** Yes. **Verdict:** **Question / Waste** — gamified fun-facts; hardcoded `$` thresholds ignore reporting currency; high code, low utility.

**3.5 Holding Periods**
- **Shows:** Avg holding period, longest/shortest held, newest/oldest, age buckets.
- **Source:** `analytics.holdingPeriods` (`calcHoldingPeriodAnalytics`).
- **Rendered:** Yes. **Verdict:** **Keep** (now intraday-filtered) — informs holding discipline.

---

## 4. Dead / wasted code (computed but not rendered)

| Item | Status | Note |
|---|---|---|
| `calcInvestmentActivityCalendar` (`analytics.activity`) | **REMOVED from master aggregate** | Was computed every render, never rendered. Now dropped from `calcTransactionAnalytics`; the pure function is retained + unit-tested for future use. |
| `analytics.journey` (`calcInvestmentJourney`) | **Barely used** | Only `uniqueSymbolsOwned` read; other 8 fields discarded. |
| `app/(tabs)/transactionInsights.tsx` | **Hidden duplicate** | ~1,248-line older twin of `insights.tsx`, `href: null`. Candidate for deletion (needs manual `rm`; keep its `_layout` entry only if the file stays). |
| Standalone `xray`, `drift`, `timeline` | **Hidden** | Re-implemented inside Insights. Redundant maintenance. |

---

## 5. Cross-cutting issues

1. **Duplication** — Risk Snapshot ≈ X-ray, Drift ≈ Drift, Evolution ≈ Timeline, Country block ≈ Portfolio tab.
2. **Snapshot dependency** — Monthly Review, Drift, Evolution empty for new users; transaction-derived sections work immediately.
3. **Hardcoded assumptions** — `SYMBOL_SECTOR` (~15 symbols) + keyword `inferSector()`; `$` trade-size buckets ignore reporting currency.
4. **Trading-desk framing vs vision** — Win Rate / Profit Factor / preferred day conflict with "allocation tracker, not trading app" (AGENTS.md scope).
5. **Screen size** — single 1,927-line file, nested accordions, heavy `useMemo` recompute.

---

## 6. Suggested triage (challenge these)

**Keep:** Performance Breakdown · Best & Worst · Capital Deployment · Holding Periods · Country header.
**Question / simplify:** Win Rate (gate behind "active trader" toggle) · Risk Snapshot & Drift (link out, don't re-render) · Monthly Review + Yearly Evolution (merge; hide until snapshots exist) · DCA + Conviction (merge into "Accumulation").
**Cut:** `calcInvestmentActivityCalendar` (done) · Behavior fun-facts (day-of-week, distribution, badges) · `transactionInsights.tsx` · unused `calcInvestmentJourney` fields.

---

## 7. Prioritization questions

1. Primary Insights user — buy-and-hold allocator or active trader? (Fate of Win Rate / Behavior.)
2. Should Insights *own* risk/drift/evolution or *link* to dedicated screens?
3. Is snapshot-dependent storytelling (Monthly Review) worth its empty-state cost?
4. Currency-aware thresholds vs hardcoded `$` buckets — fix or drop distribution charts?
5. Delete `transactionInsights.tsx` and redundant hidden screens outright?

