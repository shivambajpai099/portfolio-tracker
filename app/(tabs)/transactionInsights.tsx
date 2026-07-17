import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { DonutChart } from "../../src/components/DonutChart";
import { HorizontalBarChart } from "../../src/components/HorizontalBarChart";
import { MetricCard, MetricGrid } from "../../src/components/MetricCard";
import { Leaderboard } from "../../src/components/Leaderboard";
import { InsightList } from "../../src/components/InsightBadge";
import { ProgressBar } from "../../src/components/MiniBarChart";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors as defaultColors, radii, spacing, typography, useTheme } from "../../src/theme";
import { calcTransactionAnalytics } from "../../src/features/portfolio/transactionAnalytics";
import { getAllRealizations } from "../../src/features/portfolio/fifoCalculator";
import { formatMoney } from "../../src/utils/format";
import type { Currency } from "../../src/types/portfolio";

type TopLevelSection = "performance" | "evolution" | "behavior" | null;
type SubSection = 
  | "performance_breakdown" 
  | "winrate" 
  | "bestworst"
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

export default function TransactionInsightsScreen() {
  useTheme(); // Keep theme context active
  const transactions = usePortfolioStore((s) => s.transactions);
  const holdings = usePortfolioStore((s) => s.holdings);
  const fxRates = usePortfolioStore((s) => s.fxRates);
  const settings = usePortfolioStore((s) => s.settings);
  const rc = settings.reportingCurrency;

  const [expandedSection, setExpandedSection] = useState<TopLevelSection>(null);
  const [expandedSubSection, setExpandedSubSection] = useState<SubSection>(null);

  // Calculate all analytics using the transaction analytics engine
  const analytics = useMemo(() => {
    const realizations = getAllRealizations(transactions);
    return calcTransactionAnalytics(transactions, holdings, realizations, fxRates, rc);
  }, [transactions, holdings, fxRates, rc]);

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

  // Preview stats for collapsed sections
  const performancePreview = useMemo(() => {
    const winRate = analytics.winRate.totalClosedTrades > 0 
      ? `Win rate ${analytics.winRate.winRate.toFixed(0)}%` 
      : null;
    const best = analytics.bestWorst.bestInvestment
      ? `Best: ${analytics.bestWorst.bestInvestment.symbol} +${analytics.bestWorst.bestInvestment.totalReturnPct.toFixed(0)}%`
      : null;
    const parts = [winRate, best].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Analyze your trading performance";
  }, [analytics]);

  const evolutionPreview = useMemo(() => {
    const positions = `${analytics.journey.uniqueSymbolsOwned} positions`;
    const returnPct = analytics.performance.totalReturn !== 0
      ? `${analytics.performance.totalReturn >= 0 ? "+" : ""}${((analytics.performance.totalReturn / Math.max(analytics.capitalDeployment.totalInvested, 1)) * 100).toFixed(0)}% since inception`
      : null;
    const parts = [positions, returnPct].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Track your investment journey";
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

  // Empty state
  if (transactions.length === 0) {
    return (
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Transaction Insights</Text>
          <Text style={styles.subtitle}>Deep analytics derived from your transaction history</Text>
          <View style={styles.emptyCard}>
            <Ionicons name="analytics-outline" size={48} color={defaultColors.muted} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No transaction history yet</Text>
            <Text style={styles.emptyText}>
              Import your transaction history to unlock powerful insights about your investing behavior, capital deployment, conviction levels, and performance analytics.
            </Text>
            <Text style={styles.emptyHint}>
              Go to Holdings → Import → Import Transactions to get started.
            </Text>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Transaction Insights</Text>
        <Text style={styles.subtitle}>
          {analytics.journey.totalTransactionCount} transactions analyzed
        </Text>

        {/* ═══════════════════════════════════════════════════════════════════
            1. PERFORMANCE
            Sub-sections: Performance Breakdown, Win Rate Analysis, Best & Worst
        ═══════════════════════════════════════════════════════════════════ */}
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
              {/* Performance Breakdown */}
              <SubSectionHeader
                title="Performance Breakdown"
                isExpanded={expandedSubSection === "performance_breakdown"}
                onPress={() => toggleSubSection("performance_breakdown")}
              />
              {expandedSubSection === "performance_breakdown" && (
                <View style={styles.subSectionContent}>
                  {/* Donut Chart */}
                  <View style={styles.performanceChartWrap}>
                    <DonutChart
                      size={140}
                      strokeWidth={20}
                      slices={[
                        { value: Math.max(analytics.performance.realizedGains, 0), color: defaultColors.positive },
                        { value: Math.max(analytics.performance.unrealizedGains, 0), color: defaultColors.accent },
                        { value: analytics.performance.realizedLosses, color: defaultColors.negative },
                        { value: analytics.performance.unrealizedLosses, color: "#EF444480" },
                      ]}
                    />
                    <View style={styles.performanceLegend}>
                      <LegendItem label="Realized Gains" value={formatMoney(analytics.performance.realizedGains, rc)} color={defaultColors.positive} />
                      <LegendItem label="Unrealized Gains" value={formatMoney(analytics.performance.unrealizedGains, rc)} color={defaultColors.accent} />
                      <LegendItem label="Realized Losses" value={`-${formatMoney(analytics.performance.realizedLosses, rc)}`} color={defaultColors.negative} />
                      <LegendItem label="Unrealized Losses" value={`-${formatMoney(analytics.performance.unrealizedLosses, rc)}`} color="#EF444480" />
                    </View>
                  </View>

                  <View style={styles.performanceSummary}>
                    <View style={styles.performanceRow}>
                      <Text style={styles.performanceLabel}>Total Return</Text>
                      <Text
                        style={[
                          styles.performanceTotal,
                          { color: analytics.performance.totalReturn >= 0 ? defaultColors.positive : defaultColors.negative },
                        ]}
                      >
                        {signedMoney(analytics.performance.totalReturn, rc)}
                      </Text>
                    </View>
                  </View>

                  {analytics.performance.byAsset.length > 0 && (
                    <View style={styles.subsection}>
                      <Text style={styles.subsectionTitle}>Return by Asset</Text>
                      <Leaderboard
                        items={analytics.performance.byAsset.slice(0, 5).map((a, i) => ({
                          rank: i + 1,
                          label: a.symbol,
                          value: signedMoney(a.totalReturn, rc),
                          positive: a.totalReturn >= 0,
                        }))}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Win Rate Analysis */}
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
                      {/* Win Rate Donut */}
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

              {/* Best & Worst */}
              <SubSectionHeader
                title="Best & Worst"
                isExpanded={expandedSubSection === "bestworst"}
                onPress={() => toggleSubSection("bestworst")}
              />
              {expandedSubSection === "bestworst" && (
                <View style={styles.subSectionContent}>
                  {analytics.bestWorst.bestInvestment && (
                    <View style={styles.bestWorstCard}>
                      <View style={styles.bestWorstBadge}>
                        <Text style={styles.bestWorstBadgeText}>🏆 Best</Text>
                      </View>
                      <Text style={styles.bestWorstSymbol}>{analytics.bestWorst.bestInvestment.symbol}</Text>
                      <Text style={styles.bestWorstCompany}>{analytics.bestWorst.bestInvestment.companyName}</Text>
                      <View style={styles.bestWorstMetrics}>
                        <View style={styles.bestWorstMetric}>
                          <Text style={styles.bestWorstMetricLabel}>Invested</Text>
                          <Text style={styles.bestWorstMetricValue}>{formatMoney(analytics.bestWorst.bestInvestment.totalInvested, rc)}</Text>
                        </View>
                        <View style={styles.bestWorstMetric}>
                          <Text style={styles.bestWorstMetricLabel}>Return</Text>
                          <Text style={[styles.bestWorstMetricValue, { color: defaultColors.positive }]}>
                            {signedMoney(analytics.bestWorst.bestInvestment.totalReturn, rc)}
                          </Text>
                        </View>
                        <View style={styles.bestWorstMetric}>
                          <Text style={styles.bestWorstMetricLabel}>Return %</Text>
                          <Text style={[styles.bestWorstMetricValue, { color: defaultColors.positive }]}>
                            +{analytics.bestWorst.bestInvestment.totalReturnPct.toFixed(1)}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {analytics.bestWorst.worstInvestment && analytics.bestWorst.worstInvestment.totalReturn < 0 && (
                    <View style={[styles.bestWorstCard, styles.worstCard]}>
                      <View style={[styles.bestWorstBadge, styles.worstBadge]}>
                        <Text style={styles.bestWorstBadgeText}>📉 Worst</Text>
                      </View>
                      <Text style={styles.bestWorstSymbol}>{analytics.bestWorst.worstInvestment.symbol}</Text>
                      <Text style={styles.bestWorstCompany}>{analytics.bestWorst.worstInvestment.companyName}</Text>
                      <View style={styles.bestWorstMetrics}>
                        <View style={styles.bestWorstMetric}>
                          <Text style={styles.bestWorstMetricLabel}>Invested</Text>
                          <Text style={styles.bestWorstMetricValue}>{formatMoney(analytics.bestWorst.worstInvestment.totalInvested, rc)}</Text>
                        </View>
                        <View style={styles.bestWorstMetric}>
                          <Text style={styles.bestWorstMetricLabel}>Return</Text>
                          <Text style={[styles.bestWorstMetricValue, { color: defaultColors.negative }]}>
                            {formatMoney(analytics.bestWorst.worstInvestment.totalReturn, rc)}
                          </Text>
                        </View>
                        <View style={styles.bestWorstMetric}>
                          <Text style={styles.bestWorstMetricLabel}>Return %</Text>
                          <Text style={[styles.bestWorstMetricValue, { color: defaultColors.negative }]}>
                            {analytics.bestWorst.worstInvestment.totalReturnPct.toFixed(1)}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {analytics.bestWorst.topWinners.length > 0 && (
                    <View style={styles.subsection}>
                      <Text style={styles.subsectionTitle}>Top Winners</Text>
                      <Leaderboard
                        items={analytics.bestWorst.topWinners.map((w, i) => ({
                          rank: i + 1,
                          label: w.symbol,
                          value: signedMoney(w.totalReturn, rc),
                          secondaryValue: `+${w.totalReturnPct.toFixed(1)}%`,
                          positive: true,
                        }))}
                      />
                    </View>
                  )}

                  {analytics.bestWorst.topLosers.length > 0 && (
                    <View style={styles.subsection}>
                      <Text style={styles.subsectionTitle}>Top Losers</Text>
                      <Leaderboard
                        items={analytics.bestWorst.topLosers.map((l, i) => ({
                          rank: i + 1,
                          label: l.symbol,
                          value: formatMoney(l.totalReturn, rc),
                          secondaryValue: `${l.totalReturnPct.toFixed(1)}%`,
                          positive: false,
                        }))}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            2. PORTFOLIO EVOLUTION
            Merged: Investment Journey + Portfolio Evolution
        ═══════════════════════════════════════════════════════════════════ */}
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
              {/* Investment Journey - Timeline narrative */}
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

              {/* Portfolio Composition Over Time */}
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
            </View>
          )}
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            3. INVESTING BEHAVIOR
            Sub-sections: Capital Deployment, DCA Insights, Conviction Analysis,
                          Behavior Insights, Holding Periods
        ═══════════════════════════════════════════════════════════════════ */}
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
              {/* Capital Deployment */}
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

              {/* DCA Insights */}
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

              {/* Conviction Analysis */}
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

              {/* Behavior Insights */}
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

              {/* Holding Periods */}
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

// ═══════════════════════════════════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════════════════════════════════

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

function LegendItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View style={styles.legendText}>
        <Text style={styles.legendLabel}>{label}</Text>
        <Text style={styles.legendValue}>{value}</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
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

  // Empty state
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
  emptyHint: {
    color: defaultColors.accent,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },

  // Group Card (top-level sections)
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
    marginLeft: 30, // Align under title text (icon width + gap)
    color: defaultColors.muted,
    fontSize: typography.caption,
  },
  groupContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },

  // Sub-section headers (lighter treatment)
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

  // Journey section (no accordion, always visible within evolution)
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

  // Subsection
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

  // No data
  noDataText: {
    color: defaultColors.muted,
    fontSize: typography.caption,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: spacing.lg,
  },

  // DCA Card
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

  // Performance chart
  performanceChartWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  performanceLegend: {
    flex: 1,
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    flex: 1,
  },
  legendLabel: {
    color: defaultColors.muted,
    fontSize: typography.micro,
  },
  legendValue: {
    color: defaultColors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  performanceSummary: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: defaultColors.border,
    paddingTop: spacing.md,
  },
  performanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  performanceLabel: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
  performanceTotal: {
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },

  // Win Rate
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

  // Trade highlight
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

  // Holding highlight
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

  // Distribution grid
  distributionGrid: {
    gap: spacing.sm,
  },

  // Evolution
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

  // Best/Worst
  bestWorstCard: {
    backgroundColor: `${defaultColors.positive}15`,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  worstCard: {
    backgroundColor: `${defaultColors.negative}15`,
  },
  bestWorstBadge: {
    backgroundColor: `${defaultColors.positive}30`,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  worstBadge: {
    backgroundColor: `${defaultColors.negative}30`,
  },
  bestWorstBadgeText: {
    color: defaultColors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  bestWorstSymbol: {
    color: defaultColors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightBold,
  },
  bestWorstCompany: {
    color: defaultColors.muted,
    fontSize: typography.caption,
    marginBottom: spacing.md,
  },
  bestWorstMetrics: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  bestWorstMetric: {
    alignItems: "center",
  },
  bestWorstMetricLabel: {
    color: defaultColors.muted,
    fontSize: typography.micro,
  },
  bestWorstMetricValue: {
    color: defaultColors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    marginTop: 2,
  },
});


