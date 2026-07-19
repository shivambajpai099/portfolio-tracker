import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { TourTarget } from "../../src/components/OnboardingTourProvider";
import { UserMenu } from "../../src/components/UserMenu";
import { CountryAllocationBlock } from "../../src/components/CountryAllocationBlock";
import { RiskSnapshotSection } from "../../src/components/RiskSnapshotSection";
import { DonutChart } from "../../src/components/DonutChart";
import { HorizontalBarChart } from "../../src/components/HorizontalBarChart";
import { MetricCard, MetricGrid } from "../../src/components/MetricCard";
import { Leaderboard } from "../../src/components/Leaderboard";
import { InsightList } from "../../src/components/InsightBadge";
import { ProgressBar } from "../../src/components/MiniBarChart";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { radii, spacing, typography, useTheme } from "../../src/theme";
import { spec } from "../../src/theme/specTokens";

// Spec-palette mapping applied across the Insights screen. Keys mirror the
// ThemeColors shape so existing style references remain unchanged while the
// visual presentation adopts the new UI/UX spec.
const defaultColors = {
  bg: spec.CARD2,
  surface: spec.CARD,
  text: "#F2F4F8",
  muted: spec.SUB,
  accent: spec.TEAL,
  positive: spec.GREEN,
  negative: spec.RED,
  warning: "#F59E0B",
  border: spec.BDR,
} as const;

import { calcTransactionAnalytics } from "../../src/features/portfolio/transactionAnalytics";
import { getAllRealizations } from "../../src/features/portfolio/fifoCalculator";
import { excludeIntradayRoundTrips } from "../../src/features/portfolio/intraday";
import { calcSymbolAllocations, convert, holdingMarketValue } from "../../src/features/portfolio/calculations";
import { selectAllHoldings } from "../../src/features/portfolio/selectors";
import { formatMoney, formatCompact } from "../../src/utils/format";
import type { AllocationSnapshot, Currency, Holding } from "../../src/types/portfolio";

type TopLevelSection = "performance" | "evolution" | "behavior" | null;
type SubSection =
  | "winrate"
  | "bestworst"
  | "risk"
  | "capital"
  | "dca"
  | "conviction"
  | "behavior_insights"
  | "holding"
  | null;

const formatDuration = (days: number): string => {
  if (days < 30) return `${days} days`;
  if (days < 365) return `${(days / 30).toFixed(1)} months`;
  return `${(days / 365).toFixed(1)} years`;
};

const formatDurationCompact = (days: number): string => {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
};

const formatDateShort = (iso: string | null): string => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short" });
};

const signedMoney = (value: number, rc: Currency): string => {
  return `${value >= 0 ? "+" : ""}${formatMoney(value, rc)}`;
};

// Compact, signed currency for the compact best/worst summary cards.
const signedCompact = (value: number, rc: Currency): string => {
  return `${value >= 0 ? "+" : ""}${formatCompact(value, rc)}`;
};

const SYMBOL_SECTOR: Record<string, string> = {
  AAPL: "Technology",
  MSFT: "Technology",
  NVDA: "Technology",
  GOOGL: "Technology",
  META: "Technology",
  AMZN: "Consumer Discretionary",
  TSLA: "Consumer Discretionary",
  RELIANCE: "Energy",
  TCS: "Technology",
  INFY: "Technology",
  HDFCBANK: "Financials",
  ICICIBANK: "Financials",
  SBIN: "Financials",
  ITC: "Consumer Staples",
  HINDUNILVR: "Consumer Staples",
};

const isIndiaHolding = (holding: Holding): boolean => {
  const symbol = holding.symbol.toUpperCase();
  return holding.currency === "INR" || symbol.endsWith(".NS") || symbol.endsWith(".BO");
};

const inferSector = (holding: Holding): string => {
  const symbol = holding.symbol.toUpperCase().replace(/\.NS$|\.BO$/, "");
  const bySymbol = SYMBOL_SECTOR[symbol];
  if (bySymbol) return bySymbol;

  const name = holding.companyName.toLowerCase();
  if (name.includes("bank") || name.includes("finance") || name.includes("capital")) return "Financials";
  if (name.includes("tech") || name.includes("software") || name.includes("semiconductor")) return "Technology";
  if (name.includes("pharma") || name.includes("health")) return "Healthcare";
  if (name.includes("oil") || name.includes("energy") || name.includes("gas")) return "Energy";
  if (name.includes("consumer") || name.includes("retail") || name.includes("auto")) return "Consumer";
  return "Other";
};

export default function PortfolioInsightsScreen() {
  const { colors } = useTheme();
  const transactions = usePortfolioStore((s) => s.transactions);
  const manualHoldings = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const accounts = usePortfolioStore((s) => s.accounts);
  const fxRates = usePortfolioStore((s) => s.fxRates);
  const settings = usePortfolioStore((s) => s.settings);
  const marketPrices = usePortfolioStore((s) => s.marketPrices);
  const rc = settings.reportingCurrency;

  const priceMap = useMemo(() => new Map(Object.entries(marketPrices)), [marketPrices]);

  const holdings = useMemo(
    () => selectAllHoldings(manualHoldings, transactions, accounts, priceMap),
    [manualHoldings, transactions, accounts, priceMap]
  );

  const [expandedSection, setExpandedSection] = useState<TopLevelSection>(null);
  const [expandedSubSection, setExpandedSubSection] = useState<SubSection>(null);

  const analytics = useMemo(() => {
    const source = settings.excludeIntradayFromInsights
      ? excludeIntradayRoundTrips(transactions)
      : transactions;
    const realizations = getAllRealizations(source);
    return calcTransactionAnalytics(source, holdings, realizations, fxRates, rc);
  }, [transactions, holdings, fxRates, rc, settings.excludeIntradayFromInsights]);

  const countryData = useMemo(() => {
    let indiaValue = 0;
    let usValue = 0;

    for (const holding of holdings) {
      const value = convert(holdingMarketValue(holding), holding.currency, rc, fxRates);
      if (isIndiaHolding(holding)) indiaValue += value;
      else usValue += value;
    }

    const cashValue = cashHoldings.reduce((sum, cash) => sum + convert(cash.balance, cash.currency, rc, fxRates), 0);
    const equitiesTotal = indiaValue + usValue;
    const portfolioTotal = equitiesTotal + cashValue;

    return {
      indiaValue,
      usValue,
      cashValue,
      equitiesTotal,
      portfolioTotal,
      indiaPctEquity: equitiesTotal > 0 ? (indiaValue / equitiesTotal) * 100 : 0,
      usPctEquity: equitiesTotal > 0 ? (usValue / equitiesTotal) * 100 : 0,
      indiaPctPortfolio: portfolioTotal > 0 ? (indiaValue / portfolioTotal) * 100 : 0,
      usPctPortfolio: portfolioTotal > 0 ? (usValue / portfolioTotal) * 100 : 0,
      cashPctPortfolio: portfolioTotal > 0 ? (cashValue / portfolioTotal) * 100 : 0,
    };
  }, [holdings, cashHoldings, rc, fxRates]);

  const riskData = useMemo(() => {
    const allocations = calcSymbolAllocations(
      holdings,
      cashHoldings,
      fxRates,
      rc,
      settings.allocationBasis,
      settings.allocationIncludeCash
    );
    const sorted = [...allocations].sort((a, b) => b.allocationPct - a.allocationPct);

    const top5Pct = sorted.slice(0, 5).reduce((sum, item) => sum + item.allocationPct, 0);
    const top10Pct = sorted.slice(0, 10).reduce((sum, item) => sum + item.allocationPct, 0);
    const largestPositionPct = sorted[0]?.allocationPct ?? 0;

    const sectorMap = new Map<string, number>();
    for (const holding of holdings) {
      const sector = inferSector(holding);
      const value = convert(holdingMarketValue(holding), holding.currency, rc, fxRates);
      sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + value);
    }

    const sectorTotal = [...sectorMap.values()].reduce((sum, v) => sum + v, 0);
    const sectorRows = [...sectorMap.entries()]
      .map(([sector, value]) => ({
        sector,
        value,
        pct: sectorTotal > 0 ? (value / sectorTotal) * 100 : 0,
      }))
      .sort((a, b) => b.pct - a.pct);

    return { allocations: sorted, top5Pct, top10Pct, largestPositionPct, sectorRows };
  }, [holdings, cashHoldings, fxRates, rc, settings.allocationBasis, settings.allocationIncludeCash]);

  const toggleSection = (section: TopLevelSection) => {
    if (expandedSection === section) {
      setExpandedSection(null);
      setExpandedSubSection(null);
    } else {
      setExpandedSection(section);
      setExpandedSubSection(null);
    }
  };

  const toggleSubSection = (sub: SubSection) => {
    setExpandedSubSection(expandedSubSection === sub ? null : sub);
  };

  const performancePreview = useMemo(() => {
    const winRate = analytics.winRate.totalClosedTrades > 0
      ? `Win rate ${analytics.winRate.winRate.toFixed(0)}%`
      : null;
    const best = analytics.bestWorst.bestInvestment
      ? `Best: ${analytics.bestWorst.bestInvestment.symbol} +${analytics.bestWorst.bestInvestment.totalReturnPct.toFixed(0)}%`
      : null;
    const parts = [winRate, best].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Performance, win rate and best & worst";
  }, [analytics]);

  const evolutionPreview = useMemo(() => {
    const positions = `${analytics.journey.uniqueSymbolsOwned} positions`;
    const returnPct = analytics.performance.totalReturn !== 0
      ? `${analytics.performance.totalReturn >= 0 ? "+" : ""}${((analytics.performance.totalReturn / Math.max(analytics.capitalDeployment.totalInvested, 1)) * 100).toFixed(0)}% since inception`
      : null;
    const parts = [positions, returnPct].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Journey, allocation and risk";
  }, [analytics]);

  const behaviorPreview = useMemo(() => {
    const avgHolding = analytics.holdingPeriods.averageHoldingPeriodDays > 0
      ? `Avg. holding ${formatDurationCompact(analytics.holdingPeriods.averageHoldingPeriodDays)}`
      : null;
    const avgMonthly = analytics.capitalDeployment.averageMonthlyInvestment > 0
      ? `${formatMoney(analytics.capitalDeployment.averageMonthlyInvestment, rc)}/mo`
      : null;
    const parts = [avgHolding, avgMonthly].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Understand your investing patterns";
  }, [analytics, rc]);

  if (holdings.length === 0) {
    return (
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <TourTarget tourKey="insights">
            <View style={styles.headerRow}>
              <Text style={styles.title}>Insights</Text>
              <UserMenu />
            </View>
          </TourTarget>
          <Text style={styles.subtitle}>Risk, allocation, performance and behavior analytics.</Text>
          <View style={styles.emptyCard}>
            <Ionicons name="analytics-outline" size={48} color={defaultColors.muted} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No holdings to analyze yet</Text>
            <Text style={styles.emptyText}>
              Risk, allocation drift, performance and behavior insights will appear here once you add holdings and import transactions.
            </Text>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <TourTarget tourKey="insights">
          <View style={styles.headerRow}>
            <Text style={styles.title}>Insights</Text>
            <UserMenu />
          </View>
        </TourTarget>
        <Text style={styles.subtitle}>Risk, allocation, performance and behavior analytics.</Text>

        <CountryAllocationBlock
          indiaValue={countryData.indiaValue}
          usValue={countryData.usValue}
          cashValue={countryData.cashValue}
          indiaPctEquity={countryData.indiaPctEquity}
          usPctEquity={countryData.usPctEquity}
          cashPctPortfolio={countryData.cashPctPortfolio}
          rc={rc}
        />

        {/* 1. PERFORMANCE — Best & Worst, Win Rate */}
        <View style={styles.groupCard}>
          <Pressable onPress={() => toggleSection("performance")} style={styles.groupHeader}>
            <View style={styles.groupHeaderContent}>
              <View style={styles.groupHeaderLeft}>
                <Ionicons name="bar-chart-outline" size={22} color={defaultColors.accent} />
                <Text style={styles.groupTitle}>Performance</Text>
              </View>
              <Ionicons
                name={expandedSection === "performance" ? "chevron-up-outline" : "chevron-down-outline"}
                size={20}
                color={defaultColors.accent}
              />
            </View>
            <Text style={styles.groupPreview}>{performancePreview}</Text>
          </Pressable>

          {expandedSection === "performance" && (
            <View style={styles.groupContent}>
              <SubSectionHeader
                title="Best & Worst"
                isExpanded={expandedSubSection === "bestworst"}
                onPress={() => toggleSubSection("bestworst")}
              />
              {expandedSubSection === "bestworst" && (
                <View style={styles.subSectionContent}>
                  {/* Compact best/worst summary cards */}
                  <View style={styles.bwGrid}>
                    {analytics.bestWorst.bestInvestment && (
                      <View style={[styles.bwCard, styles.bwCardBest]}>
                        <Text style={[styles.bwLabel, { color: defaultColors.positive }]}>Best performer</Text>
                        <Text style={styles.bwTicker}>{analytics.bestWorst.bestInvestment.symbol}</Text>
                        <View style={styles.bwSubRow}>
                          <View>
                            <Text style={styles.bwSubLabel}>Return</Text>
                            <Text style={[styles.bwSubValue, { color: defaultColors.positive }]}>
                              {signedCompact(analytics.bestWorst.bestInvestment.totalReturn, rc)}
                            </Text>
                          </View>
                          <View style={styles.bwSubColRight}>
                            <Text style={styles.bwSubLabel}>Return %</Text>
                            <Text style={[styles.bwSubValue, { color: defaultColors.positive }]}>
                              +{analytics.bestWorst.bestInvestment.totalReturnPct.toFixed(1)}%
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {analytics.bestWorst.worstInvestment && (
                      <View style={[styles.bwCard, styles.bwCardWorst]}>
                        <Text style={[styles.bwLabel, { color: defaultColors.negative }]}>Worst performer</Text>
                        <Text style={styles.bwTicker}>{analytics.bestWorst.worstInvestment.symbol}</Text>
                        <View style={styles.bwSubRow}>
                          <View>
                            <Text style={styles.bwSubLabel}>Return</Text>
                            <Text style={[styles.bwSubValue, { color: defaultColors.negative }]}>
                              {signedCompact(analytics.bestWorst.worstInvestment.totalReturn, rc)}
                            </Text>
                          </View>
                          <View style={styles.bwSubColRight}>
                            <Text style={styles.bwSubLabel}>Return %</Text>
                            <Text style={[styles.bwSubValue, { color: defaultColors.negative }]}>
                              {analytics.bestWorst.worstInvestment.totalReturnPct.toFixed(1)}%
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>

                  {analytics.bestWorst.topWinners.length > 0 && (
                    <View style={styles.rankList}>
                      <Text style={styles.rankListLabel}>Top Winners</Text>
                      {analytics.bestWorst.topWinners.map((w, i, arr) => (
                        <View
                          key={w.symbol}
                          style={[styles.rankRow, i === arr.length - 1 && styles.rankRowLast]}
                        >
                          <View style={styles.rankLeft}>
                            <View style={[styles.rankBadge, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                              <Text style={[styles.rankBadgeText, { color: defaultColors.positive }]}>{i + 1}</Text>
                            </View>
                            <Text style={styles.rankTicker}>{w.symbol}</Text>
                          </View>
                          <View style={styles.rankRight}>
                            <Text style={[styles.rankValue, { color: defaultColors.positive }]}>
                              {signedMoney(w.totalReturn, rc)}
                            </Text>
                            <Text style={[styles.rankPct, { color: defaultColors.positive }]}>
                              +{w.totalReturnPct.toFixed(1)}%
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {analytics.bestWorst.topLosers.length > 0 && (
                    <View style={styles.rankList}>
                      <Text style={styles.rankListLabel}>Top Losers</Text>
                      {analytics.bestWorst.topLosers.map((l, i, arr) => (
                        <View
                          key={l.symbol}
                          style={[styles.rankRow, i === arr.length - 1 && styles.rankRowLast]}
                        >
                          <View style={styles.rankLeft}>
                            <View style={[styles.rankBadge, { backgroundColor: "rgba(248,113,113,0.15)" }]}>
                              <Text style={[styles.rankBadgeText, { color: defaultColors.negative }]}>{i + 1}</Text>
                            </View>
                            <Text style={styles.rankTicker}>{l.symbol}</Text>
                          </View>
                          <View style={styles.rankRight}>
                            <Text style={[styles.rankValue, { color: defaultColors.negative }]}>
                              {formatMoney(l.totalReturn, rc)}
                            </Text>
                            <Text style={[styles.rankPct, { color: defaultColors.negative }]}>
                              {l.totalReturnPct.toFixed(1)}%
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <SubSectionHeader
                title="Win Rate Analysis"
                isExpanded={expandedSubSection === "winrate"}
                onPress={() => toggleSubSection("winrate")}
              />
              {expandedSubSection === "winrate" && (
                <View style={styles.subSectionContent}>
                  {analytics.winRate.totalClosedTrades === 0 ? (
                    <Text style={styles.noDataText}>No closed trades yet. Win rate is calculated from completed (sold) positions.</Text>
                  ) : (
                    <>
                      <View style={styles.winRateChartWrap}>
                        <DonutChart
                          size={120}
                          strokeWidth={18}
                          slices={[
                            { value: analytics.winRate.winningTrades, color: defaultColors.positive },
                            { value: analytics.winRate.losingTrades, color: defaultColors.negative },
                          ]}
                        />
                        <View style={styles.winRateCenter}>
                          <Text style={styles.winRatePct}>{analytics.winRate.winRate.toFixed(0)}%</Text>
                          <Text style={styles.winRateLabel}>Win Rate</Text>
                        </View>
                      </View>

                      <MetricGrid>
                        <MetricCard label="Closed Trades" value={String(analytics.winRate.totalClosedTrades)} compact />
                        <MetricCard label="Winning / Losing" value={`${analytics.winRate.winningTrades} / ${analytics.winRate.losingTrades}`} compact />
                        <MetricCard label="Avg Win" value={formatMoney(analytics.winRate.averageWin, rc)} compact />
                        <MetricCard label="Avg Loss" value={formatMoney(analytics.winRate.averageLoss, rc)} compact />
                        <MetricCard
                          label="Profit Factor"
                          value={analytics.winRate.profitFactor === Infinity ? "∞" : analytics.winRate.profitFactor.toFixed(2)}
                          subtitle="Total profit / Total loss"
                          compact
                        />
                      </MetricGrid>

                      {analytics.winRate.largestWin && (
                        <View style={styles.subsection}>
                          <Text style={styles.subsectionTitle}>Largest Win</Text>
                          <View style={styles.tradeHighlight}>
                            <Text style={styles.tradeSymbol}>{analytics.winRate.largestWin.symbol}</Text>
                            <Text style={[styles.tradeGain, { color: defaultColors.positive }]}>
                              +{formatMoney(analytics.winRate.largestWin.gainLoss, rc)}
                            </Text>
                            <Text style={styles.tradeMeta}>Held for {analytics.winRate.largestWin.holdingPeriodDays} days</Text>
                          </View>
                        </View>
                      )}

                      {analytics.winRate.largestLoss && (
                        <View style={styles.subsection}>
                          <Text style={styles.subsectionTitle}>Largest Loss</Text>
                          <View style={styles.tradeHighlight}>
                            <Text style={styles.tradeSymbol}>{analytics.winRate.largestLoss.symbol}</Text>
                            <Text style={[styles.tradeGain, { color: defaultColors.negative }]}>
                              {formatMoney(analytics.winRate.largestLoss.gainLoss, rc)}
                            </Text>
                            <Text style={styles.tradeMeta}>Held for {analytics.winRate.largestLoss.holdingPeriodDays} days</Text>
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

            </View>
          )}
        </View>

        {/* 2. PORTFOLIO EVOLUTION — Journey, Allocation over time, Risk */}
        <View style={styles.groupCard}>
          <Pressable onPress={() => toggleSection("evolution")} style={styles.groupHeader}>
            <View style={styles.groupHeaderContent}>
              <View style={styles.groupHeaderLeft}>
                <Ionicons name="git-branch-outline" size={22} color={defaultColors.accent} />
                <Text style={styles.groupTitle}>Portfolio Evolution</Text>
              </View>
              <Ionicons
                name={expandedSection === "evolution" ? "chevron-up-outline" : "chevron-down-outline"}
                size={20}
                color={defaultColors.accent}
              />
            </View>
            <Text style={styles.groupPreview}>{evolutionPreview}</Text>
          </Pressable>

          {expandedSection === "evolution" && (
            <View style={styles.groupContent}>
              <View style={styles.journeySection}>
                <Text style={styles.journeySectionTitle}>Investment Journey</Text>
                <MetricGrid>
                  <MetricCard label="First Investment" value={formatDateShort(analytics.journey.firstInvestmentDate)} compact />
                  <MetricCard label="Active For" value={formatDuration(analytics.journey.activeDurationDays)} compact />
                  <MetricCard
                    label="Total Transactions"
                    value={String(analytics.journey.totalTransactionCount)}
                    subtitle={`${analytics.journey.buyTransactionCount} buys, ${analytics.journey.sellTransactionCount} sells`}
                    compact
                  />
                  <MetricCard
                    label="Unique Stocks"
                    value={String(analytics.journey.uniqueSymbolsOwned)}
                    subtitle={`${analytics.journey.uniqueSymbolsCurrentlyHeld} currently held`}
                    compact
                  />
                </MetricGrid>
              </View>

              <View style={styles.evolutionSection}>
                <Text style={styles.journeySectionTitle}>Allocation Over Time</Text>
                {analytics.evolution.yearlyAllocations.length === 0 ? (
                  <Text style={styles.noDataText}>Portfolio evolution data requires transactions spanning multiple years.</Text>
                ) : (
                  <>
                    {analytics.evolution.yearlyAllocations.map((year) => (
                      <View key={year.year} style={styles.evolutionYear}>
                        <Text style={styles.evolutionYearLabel}>{year.year}</Text>
                        <View style={styles.evolutionHoldings}>
                          {year.topHoldings.map((h) => (
                            <View key={h.symbol} style={styles.evolutionHolding}>
                              <Text style={styles.evolutionSymbol}>{h.symbol}</Text>
                              <Text style={styles.evolutionPct}>{h.allocationPct.toFixed(0)}%</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </View>

              <SubSectionHeader
                title="Risk Snapshot"
                isExpanded={expandedSubSection === "risk"}
                onPress={() => toggleSubSection("risk")}
              />
              {expandedSubSection === "risk" && (
                <View style={styles.subSectionContent}>
                  <RiskSnapshotSection
                    holdings={holdings}
                    allocations={riskData.allocations}
                    top5Pct={riskData.top5Pct}
                    top10Pct={riskData.top10Pct}
                    largestPositionPct={riskData.largestPositionPct}
                    cashPctPortfolio={countryData.cashPctPortfolio}
                    sectorRows={riskData.sectorRows}
                    rc={rc}
                  />
                </View>
              )}
            </View>
          )}
        </View>

        {/* 3. INVESTING BEHAVIOR — Capital, DCA, Conviction, Behavior, Holding Periods */}
        <View style={styles.groupCard}>
          <Pressable onPress={() => toggleSection("behavior")} style={styles.groupHeader}>
            <View style={styles.groupHeaderContent}>
              <View style={styles.groupHeaderLeft}>
                <Ionicons name="bulb-outline" size={22} color={defaultColors.accent} />
                <Text style={styles.groupTitle}>Investing Behavior</Text>
              </View>
              <Ionicons
                name={expandedSection === "behavior" ? "chevron-up-outline" : "chevron-down-outline"}
                size={20}
                color={defaultColors.accent}
              />
            </View>
            <Text style={styles.groupPreview}>{behaviorPreview}</Text>
          </Pressable>

          {expandedSection === "behavior" && (
            <View style={styles.groupContent}>
              <SubSectionHeader
                title="Capital Deployment"
                isExpanded={expandedSubSection === "capital"}
                onPress={() => toggleSubSection("capital")}
              />
              {expandedSubSection === "capital" && (
                <View style={styles.subSectionContent}>
                  <MetricGrid>
                    <MetricCard label="Total Invested" value={formatMoney(analytics.capitalDeployment.totalInvested, rc)} compact />
                    <MetricCard label="Net Invested" value={formatMoney(analytics.capitalDeployment.netInvested, rc)} compact />
                    <MetricCard label="Avg Monthly" value={formatMoney(analytics.capitalDeployment.averageMonthlyInvestment, rc)} compact />
                    <MetricCard
                      label="Largest Purchase"
                      value={analytics.capitalDeployment.largestSinglePurchase?.symbol ?? "-"}
                      subtitle={analytics.capitalDeployment.largestSinglePurchase
                        ? formatMoney(analytics.capitalDeployment.largestSinglePurchase.amount, rc)
                        : undefined}
                      compact
                    />
                  </MetricGrid>

                  {analytics.capitalDeployment.yearlyData.length > 0 && (
                    <View style={styles.subsection}>
                      <Text style={styles.subsectionTitle}>Capital by Year</Text>
                      <HorizontalBarChart
                        bars={analytics.capitalDeployment.yearlyData.map((y) => ({
                          label: y.year,
                          value: y.invested,
                          color: defaultColors.accent,
                        }))}
                        valueFormatter={(v) => formatMoney(v, rc)}
                      />
                    </View>
                  )}

                  {analytics.capitalDeployment.byAsset.length > 0 && (
                    <View style={styles.subsection}>
                      <Text style={styles.subsectionTitle}>Top Positions by Capital Deployed</Text>
                      <Leaderboard
                        items={analytics.capitalDeployment.byAsset.slice(0, 5).map((a, i) => ({
                          rank: i + 1,
                          label: a.symbol,
                          subtitle: a.companyName,
                          value: formatMoney(a.totalInvested, rc),
                        }))}
                      />
                    </View>
                  )}
                </View>
              )}

              <SubSectionHeader
                title="DCA Insights"
                isExpanded={expandedSubSection === "dca"}
                onPress={() => toggleSubSection("dca")}
              />
              {expandedSubSection === "dca" && (
                <View style={styles.subSectionContent}>
                  <MetricGrid>
                    <MetricCard
                      label="Positions with DCA"
                      value={String(analytics.dca.totalPositionsWithMultipleBuys)}
                      subtitle="Multiple purchases"
                      compact
                    />
                    <MetricCard label="Avg Buys/Position" value={analytics.dca.averageBuysPerPosition.toFixed(1)} compact />
                  </MetricGrid>

                  {analytics.dca.positions.slice(0, 5).map((pos) => (
                    <View key={pos.symbol} style={styles.dcaCard}>
                      <View style={styles.dcaHeader}>
                        <Text style={styles.dcaSymbol}>{pos.symbol}</Text>
                        <Text style={styles.dcaCompany}>{pos.companyName}</Text>
                      </View>
                      <View style={styles.dcaMetrics}>
                        <View style={styles.dcaMetric}>
                          <Text style={styles.dcaMetricLabel}>Purchases</Text>
                          <Text style={styles.dcaMetricValue}>{pos.purchaseCount}</Text>
                        </View>
                        <View style={styles.dcaMetric}>
                          <Text style={styles.dcaMetricLabel}>Avg Buy</Text>
                          <Text style={styles.dcaMetricValue}>{formatMoney(pos.averageBuyPrice, pos.currency)}</Text>
                        </View>
                        <View style={styles.dcaMetric}>
                          <Text style={styles.dcaMetricLabel}>Best Buy</Text>
                          <Text style={[styles.dcaMetricValue, { color: defaultColors.positive }]}>
                            {formatMoney(pos.lowestBuyPrice, pos.currency)}
                          </Text>
                        </View>
                        <View style={styles.dcaMetric}>
                          <Text style={styles.dcaMetricLabel}>Worst Buy</Text>
                          <Text style={[styles.dcaMetricValue, { color: defaultColors.negative }]}>
                            {formatMoney(pos.highestBuyPrice, pos.currency)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.dcaCurrentRow}>
                        <Text style={styles.dcaCurrentLabel}>Current: {formatMoney(pos.currentMarketPrice, pos.currency)}</Text>
                        <Text
                          style={[
                            styles.dcaCurrentGain,
                            { color: pos.gainLossVsAvgCostPct >= 0 ? defaultColors.positive : defaultColors.negative },
                          ]}
                        >
                          {pos.gainLossVsAvgCostPct >= 0 ? "+" : ""}{pos.gainLossVsAvgCostPct.toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <SubSectionHeader
                title="Conviction Analysis"
                isExpanded={expandedSubSection === "conviction"}
                onPress={() => toggleSubSection("conviction")}
              />
              {expandedSubSection === "conviction" && (
                <View style={styles.subSectionContent}>
                  <MetricGrid>
                    <MetricCard label="Avg Purchases/Position" value={analytics.conviction.averagePurchasesPerPosition.toFixed(1)} compact />
                    <MetricCard label="Positions Owned" value={String(analytics.conviction.totalPositionsEverOwned)} compact />
                  </MetricGrid>

                  <View style={styles.subsection}>
                    <Text style={styles.subsectionTitle}>Top Conviction Holdings</Text>
                    <Text style={styles.subsectionHint}>Ranked by number of purchases</Text>
                    <Leaderboard
                      items={analytics.conviction.topConvictionHoldings.slice(0, 5).map((h, i) => ({
                        rank: i + 1,
                        label: h.symbol,
                        subtitle: `${h.purchaseCount} purchases`,
                        value: formatMoney(h.totalInvested, rc),
                        secondaryValue: h.isCurrentlyHeld ? "Active" : "Closed",
                        positive: h.isCurrentlyHeld,
                      }))}
                      emptyMessage="No conviction data available"
                    />
                  </View>

                  <View style={styles.subsection}>
                    <Text style={styles.subsectionTitle}>Most Accumulated Positions</Text>
                    <Text style={styles.subsectionHint}>Ranked by total capital invested</Text>
                    <Leaderboard
                      items={analytics.conviction.mostAccumulatedPositions.slice(0, 5).map((h, i) => ({
                        rank: i + 1,
                        label: h.symbol,
                        subtitle: `${h.purchaseCount} purchases`,
                        value: formatMoney(h.totalInvested, rc),
                      }))}
                      emptyMessage="No accumulation data available"
                    />
                  </View>
                </View>
              )}

              <SubSectionHeader
                title="Behavior Insights"
                isExpanded={expandedSubSection === "behavior_insights"}
                onPress={() => toggleSubSection("behavior_insights")}
              />
              {expandedSubSection === "behavior_insights" && (
                <View style={styles.subSectionContent}>
                  <InsightList
                    insights={analytics.behavior.insights.map((i) => ({
                      type: i.type as "streak" | "pattern" | "preference" | "milestone",
                      title: i.title,
                      description: i.description,
                    }))}
                    emptyMessage="Keep investing to unlock behavior insights"
                  />

                  <View style={styles.subsection}>
                    <Text style={styles.subsectionTitle}>Trading Stats</Text>
                    <MetricGrid>
                      <MetricCard label="Avg Trade Size" value={formatMoney(analytics.behavior.averageTradeSize, rc)} compact />
                      <MetricCard label="Median Trade" value={formatMoney(analytics.behavior.medianTradeSize, rc)} compact />
                      <MetricCard label="Investing Streak" value={`${analytics.behavior.consecutiveInvestingMonths} months`} compact />
                      <MetricCard
                        label="Most Purchased"
                        value={analytics.behavior.mostFrequentlyPurchasedStock?.symbol ?? "-"}
                        subtitle={analytics.behavior.mostFrequentlyPurchasedStock
                          ? `${analytics.behavior.mostFrequentlyPurchasedStock.count} times`
                          : undefined}
                        compact
                      />
                    </MetricGrid>
                  </View>

                  <View style={styles.subsection}>
                    <Text style={styles.subsectionTitle}>Trade Size Distribution</Text>
                    <HorizontalBarChart
                      bars={[
                        { label: "< $100", value: analytics.behavior.tradeSizeDistribution.under100 },
                        { label: "$100-500", value: analytics.behavior.tradeSizeDistribution.from100to500 },
                        { label: "$500-1K", value: analytics.behavior.tradeSizeDistribution.from500to1000 },
                        { label: "$1K-5K", value: analytics.behavior.tradeSizeDistribution.from1000to5000 },
                        { label: "> $5K", value: analytics.behavior.tradeSizeDistribution.over5000 },
                      ]}
                      valueFormatter={(v) => String(v)}
                    />
                  </View>
                </View>
              )}

              <SubSectionHeader
                title="Holding Periods"
                isExpanded={expandedSubSection === "holding"}
                onPress={() => toggleSubSection("holding")}
              />
              {expandedSubSection === "holding" && (
                <View style={styles.subSectionContent}>
                  <MetricGrid>
                    <MetricCard label="Avg Holding Period" value={formatDuration(analytics.holdingPeriods.averageHoldingPeriodDays)} compact />
                    <MetricCard
                      label="Portfolio Age"
                      value={formatDuration(analytics.holdingPeriods.averageAgeOfCurrentPortfolioDays)}
                      subtitle="Current holdings"
                      compact
                    />
                  </MetricGrid>

                  {analytics.holdingPeriods.longestHeldPosition && (
                    <View style={styles.subsection}>
                      <Text style={styles.subsectionTitle}>Longest Held</Text>
                      <View style={styles.holdingHighlight}>
                        <Text style={styles.holdingSymbol}>{analytics.holdingPeriods.longestHeldPosition.symbol}</Text>
                        <Text style={styles.holdingDuration}>
                          {formatDuration(analytics.holdingPeriods.longestHeldPosition.holdingDays)}
                        </Text>
                        <Text style={styles.holdingDate}>
                          Since {formatDateShort(analytics.holdingPeriods.longestHeldPosition.firstPurchaseDate)}
                        </Text>
                      </View>
                    </View>
                  )}

                  {analytics.holdingPeriods.newestPosition && (
                    <View style={styles.subsection}>
                      <Text style={styles.subsectionTitle}>Newest Position</Text>
                      <View style={styles.holdingHighlight}>
                        <Text style={styles.holdingSymbol}>{analytics.holdingPeriods.newestPosition.symbol}</Text>
                        <Text style={styles.holdingDuration}>
                          {formatDuration(analytics.holdingPeriods.newestPosition.holdingDays)}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.subsection}>
                    <Text style={styles.subsectionTitle}>Duration Distribution</Text>
                    <View style={styles.distributionGrid}>
                      {(() => {
                        const dist = analytics.holdingPeriods.holdingDurationDistribution;
                        const maxVal = Math.max(
                          dist.lessThan30Days,
                          dist.days30to90,
                          dist.days90to180,
                          dist.days180to365,
                          dist.moreThan365,
                          1
                        );
                        return (
                          <>
                            <ProgressBar label="< 30 days" value={dist.lessThan30Days} maxValue={maxVal} showLabel color={defaultColors.negative} />
                            <ProgressBar label="30-90 days" value={dist.days30to90} maxValue={maxVal} showLabel color={defaultColors.warning} />
                            <ProgressBar label="90-180 days" value={dist.days90to180} maxValue={maxVal} showLabel color={defaultColors.accent} />
                            <ProgressBar label="180-365 days" value={dist.days180to365} maxValue={maxVal} showLabel color={defaultColors.positive} />
                            <ProgressBar label="> 1 year" value={dist.moreThan365} maxValue={maxVal} showLabel color={defaultColors.positive} />
                          </>
                        );
                      })()}
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function SubSectionHeader({
  title,
  isExpanded,
  onPress,
}: {
  title: string;
  isExpanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.subSectionHeader}>
      <Text style={styles.subSectionTitle}>{title}</Text>
      <Ionicons
        name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"}
        size={16}
        color={defaultColors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 112,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: defaultColors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    color: defaultColors.muted,
    fontSize: typography.caption,
  },
  emptyCard: {
    borderRadius: radii.xl,
    backgroundColor: defaultColors.surface,
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyIcon: {
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: defaultColors.muted,
    fontSize: typography.caption,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  groupCard: {
    marginTop: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: defaultColors.surface,
    borderWidth: 1,
    borderColor: defaultColors.border,
    overflow: "hidden",
  },
  groupHeader: {
    padding: spacing.lg,
  },
  groupHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  groupTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  groupPreview: {
    marginTop: spacing.xs,
    marginLeft: 30,
    color: defaultColors.muted,
    fontSize: typography.caption,
  },
  groupContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  subSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: defaultColors.border,
  },
  subSectionTitle: {
    color: defaultColors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  subSectionContent: {
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  journeySection: {
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: defaultColors.border,
  },
  journeySectionTitle: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: typography.weightMedium,
    marginBottom: spacing.md,
  },
  evolutionSection: {
    paddingTop: spacing.lg,
  },
  subsection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  subsectionTitle: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: typography.weightMedium,
  },
  subsectionHint: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    marginTop: -spacing.xs,
  },
  noDataText: {
    color: defaultColors.muted,
    fontSize: typography.caption,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  dcaCard: {
    backgroundColor: defaultColors.bg,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  dcaHeader: {
    marginBottom: spacing.sm,
  },
  dcaSymbol: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  dcaCompany: {
    color: defaultColors.muted,
    fontSize: typography.micro,
  },
  dcaMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  dcaMetric: {
    minWidth: "22%",
  },
  dcaMetricLabel: {
    color: defaultColors.muted,
    fontSize: typography.micro,
  },
  dcaMetricValue: {
    color: defaultColors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  dcaCurrentRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: defaultColors.border,
  },
  dcaCurrentLabel: {
    color: defaultColors.text,
    fontSize: typography.caption,
  },
  dcaCurrentGain: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  winRateChartWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  winRateCenter: {
    position: "absolute",
    alignItems: "center",
  },
  winRatePct: {
    color: defaultColors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightBold,
  },
  winRateLabel: {
    color: defaultColors.muted,
    fontSize: typography.micro,
  },
  tradeHighlight: {
    backgroundColor: defaultColors.bg,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  tradeSymbol: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  tradeGain: {
    fontSize: typography.subheading,
    fontWeight: typography.weightBold,
    marginVertical: spacing.xs,
  },
  tradeMeta: {
    color: defaultColors.muted,
    fontSize: typography.micro,
  },
  holdingHighlight: {
    backgroundColor: defaultColors.bg,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  holdingSymbol: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  holdingDuration: {
    color: defaultColors.accent,
    fontSize: typography.subheading,
    fontWeight: typography.weightBold,
    marginTop: spacing.xs,
  },
  holdingDate: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    marginTop: spacing.xs,
  },
  distributionGrid: {
    gap: spacing.sm,
  },
  evolutionYear: {
    marginBottom: spacing.md,
  },
  evolutionYearLabel: {
    color: defaultColors.accent,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.xs,
  },
  evolutionHoldings: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  evolutionHolding: {
    backgroundColor: defaultColors.bg,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  evolutionSymbol: {
    color: defaultColors.text,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  evolutionPct: {
    color: defaultColors.muted,
    fontSize: typography.micro,
  },
  // Best & Worst — compact summary cards
  bwGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  bwCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bwCardBest: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderColor: "rgba(34,197,94,0.2)",
  },
  bwCardWorst: {
    backgroundColor: "rgba(248,113,113,0.08)",
    borderColor: "rgba(248,113,113,0.2)",
  },
  bwLabel: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  bwTicker: {
    fontSize: 18,
    fontWeight: "500",
    color: "#F2F4F8",
    marginTop: 4,
    marginBottom: 8,
  },
  bwSubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bwSubColRight: {
    alignItems: "flex-end",
  },
  bwSubLabel: {
    fontSize: 11,
    color: defaultColors.muted,
  },
  bwSubValue: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  // Best & Worst — ranked lists
  rankList: {
    marginBottom: 20,
  },
  rankListLabel: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: spec.MUTED,
    marginBottom: 8,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: defaultColors.border,
  },
  rankRowLast: {
    borderBottomWidth: 0,
  },
  rankLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  rankTicker: {
    fontSize: 13,
    fontWeight: "500",
    color: "#F2F4F8",
  },
  rankRight: {
    alignItems: "flex-end",
  },
  rankValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  rankPct: {
    fontSize: 11,
    marginTop: 1,
  },
});

const ivStyles = StyleSheet.create({
  emptyCard: {
    borderRadius: radii.lg,
    backgroundColor: defaultColors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  emptyTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  emptyText: {
    marginTop: spacing.xs,
    color: defaultColors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  periodCard: {
    marginBottom: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: defaultColors.bg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  periodHeader: {
    marginBottom: spacing.md,
  },
  periodTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  periodDates: {
    marginTop: 2,
    color: defaultColors.muted,
    fontSize: typography.micro,
  },
  changeList: {
    gap: spacing.sm,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  changeTextWrap: {
    flex: 1,
  },
  changeText: {
    color: defaultColors.text,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  trendBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  trendBadgeText: {
    fontSize: typography.caption,
    fontWeight: typography.weightBold,
  },
  holdingSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1E2128",
    gap: spacing.sm,
  },
  holdingTitle: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: typography.weightMedium,
  },
  holdingFallback: {
    color: defaultColors.muted,
    fontSize: typography.caption,
  },
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  holdingText: {
    flex: 1,
    color: defaultColors.text,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  holdingDelta: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  monthRow: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  monthPill: {
    borderRadius: radii.pill,
    backgroundColor: defaultColors.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  monthPillActive: {
    backgroundColor: defaultColors.accent,
  },
  monthText: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  monthTextActive: {
    color: defaultColors.bg,
  },
  reviewCard: {
    borderRadius: radii.lg,
    backgroundColor: defaultColors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  reviewTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  reviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  reviewMetric: {
    width: "48%",
    borderRadius: radii.md,
    backgroundColor: defaultColors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  reviewMetricLabel: {
    color: defaultColors.muted,
    fontSize: typography.micro,
  },
  reviewMetricValue: {
    marginTop: 2,
    color: defaultColors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  summaryBlock: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopColor: defaultColors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryLabel: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: typography.weightMedium,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  summaryDot: {
    marginTop: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: defaultColors.accent,
  },
  summaryText: {
    flex: 1,
    color: defaultColors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  reviewActionRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  exportBtn: {
    borderRadius: radii.pill,
    backgroundColor: defaultColors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  exportBtnText: {
    color: defaultColors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  exportStatus: {
    color: defaultColors.muted,
    fontSize: typography.caption,
  },
});

