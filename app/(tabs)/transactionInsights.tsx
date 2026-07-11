import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { DonutChart } from "../../src/components/DonutChart";
import { HorizontalBarChart } from "../../src/components/HorizontalBarChart";
import { MetricCard, MetricGrid } from "../../src/components/MetricCard";
import { Leaderboard } from "../../src/components/Leaderboard";
import { InsightList } from "../../src/components/InsightBadge";
import { MiniBarChart, ProgressBar } from "../../src/components/MiniBarChart";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors as defaultColors, radii, spacing, typography, useTheme } from "../../src/theme";
import { calcTransactionAnalytics } from "../../src/features/portfolio/transactionAnalytics";
import { getAllRealizations } from "../../src/features/portfolio/fifoCalculator";
import { formatMoney } from "../../src/utils/format";
import type { Currency } from "../../src/types/portfolio";

type InsightSection =
  | "journey"
  | "capital"
  | "conviction"
  | "dca"
  | "performance"
  | "winrate"
  | "holding"
  | "evolution"
  | "behavior"
  | "bestworst"
  | "activity"
  | null;

const formatDuration = (days: number): string => {
  if (days < 30) return `${days} days`;
  if (days < 365) return `${(days / 30).toFixed(1)} months`;
  return `${(days / 365).toFixed(1)} years`;
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

  const [expandedSection, setExpandedSection] = useState<InsightSection>("journey");

  // Calculate all analytics using the transaction analytics engine
  const analytics = useMemo(() => {
    const realizations = getAllRealizations(transactions);
    return calcTransactionAnalytics(transactions, holdings, realizations, fxRates, rc);
  }, [transactions, holdings, fxRates, rc]);

  const toggleSection = (section: InsightSection) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

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

        {/* 1. Investment Journey */}
        <SectionHeader
          title="Investment Journey"
          icon="rocket-outline"
          isExpanded={expandedSection === "journey"}
          onPress={() => toggleSection("journey")}
        />
        {expandedSection === "journey" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
              <MetricGrid>
                <MetricCard
                  label="First Investment"
                  value={formatDateShort(analytics.journey.firstInvestmentDate)}
                  compact
                />
                <MetricCard
                  label="Active For"
                  value={formatDuration(analytics.journey.activeDurationDays)}
                  compact
                />
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
          </View>
        )}

        {/* 2. Capital Deployment */}
        <SectionHeader
          title="Capital Deployment"
          icon="wallet-outline"
          isExpanded={expandedSection === "capital"}
          onPress={() => toggleSection("capital")}
        />
        {expandedSection === "capital" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
              <MetricGrid>
                <MetricCard
                  label="Total Invested"
                  value={formatMoney(analytics.capitalDeployment.totalInvested, rc)}
                  compact
                />
                <MetricCard
                  label="Net Invested"
                  value={formatMoney(analytics.capitalDeployment.netInvested, rc)}
                  compact
                />
                <MetricCard
                  label="Avg Monthly"
                  value={formatMoney(analytics.capitalDeployment.averageMonthlyInvestment, rc)}
                  compact
                />
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
          </View>
        )}

        {/* 3. Conviction Analysis */}
        <SectionHeader
          title="Conviction Analysis"
          icon="flame-outline"
          isExpanded={expandedSection === "conviction"}
          onPress={() => toggleSection("conviction")}
        />
        {expandedSection === "conviction" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
              <MetricGrid>
                <MetricCard
                  label="Avg Purchases/Position"
                  value={analytics.conviction.averagePurchasesPerPosition.toFixed(1)}
                  compact
                />
                <MetricCard
                  label="Positions Owned"
                  value={String(analytics.conviction.totalPositionsEverOwned)}
                  compact
                />
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
          </View>
        )}

        {/* 4. DCA Insights */}
        <SectionHeader
          title="DCA Insights"
          icon="trending-up-outline"
          isExpanded={expandedSection === "dca"}
          onPress={() => toggleSection("dca")}
        />
        {expandedSection === "dca" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
              <MetricGrid>
                <MetricCard
                  label="Positions with DCA"
                  value={String(analytics.dca.totalPositionsWithMultipleBuys)}
                  subtitle="Multiple purchases"
                  compact
                />
                <MetricCard
                  label="Avg Buys/Position"
                  value={analytics.dca.averageBuysPerPosition.toFixed(1)}
                  compact
                />
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
          </View>
        )}

        {/* 5. Realized vs Unrealized Performance */}
        <SectionHeader
          title="Performance Breakdown"
          icon="bar-chart-outline"
          isExpanded={expandedSection === "performance"}
          onPress={() => toggleSection("performance")}
        />
        {expandedSection === "performance" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
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
          </View>
        )}

        {/* 6. Win Rate Analysis */}
        <SectionHeader
          title="Win Rate Analysis"
          icon="trophy-outline"
          isExpanded={expandedSection === "winrate"}
          onPress={() => toggleSection("winrate")}
        />
        {expandedSection === "winrate" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
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
                    <MetricCard
                      label="Closed Trades"
                      value={String(analytics.winRate.totalClosedTrades)}
                      compact
                    />
                    <MetricCard
                      label="Winning / Losing"
                      value={`${analytics.winRate.winningTrades} / ${analytics.winRate.losingTrades}`}
                      compact
                    />
                    <MetricCard
                      label="Avg Win"
                      value={formatMoney(analytics.winRate.averageWin, rc)}
                      compact
                    />
                    <MetricCard
                      label="Avg Loss"
                      value={formatMoney(analytics.winRate.averageLoss, rc)}
                      compact
                    />
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
                        <Text style={styles.tradeMeta}>
                          Held for {analytics.winRate.largestWin.holdingPeriodDays} days
                        </Text>
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
                        <Text style={styles.tradeMeta}>
                          Held for {analytics.winRate.largestLoss.holdingPeriodDays} days
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* 7. Holding Period Analytics */}
        <SectionHeader
          title="Holding Periods"
          icon="time-outline"
          isExpanded={expandedSection === "holding"}
          onPress={() => toggleSection("holding")}
        />
        {expandedSection === "holding" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
              <MetricGrid>
                <MetricCard
                  label="Avg Holding Period"
                  value={formatDuration(analytics.holdingPeriods.averageHoldingPeriodDays)}
                  compact
                />
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
                  <ProgressBar
                    label="< 30 days"
                    value={analytics.holdingPeriods.holdingDurationDistribution.lessThan30Days}
                    maxValue={Math.max(
                      analytics.holdingPeriods.holdingDurationDistribution.lessThan30Days,
                      analytics.holdingPeriods.holdingDurationDistribution.days30to90,
                      analytics.holdingPeriods.holdingDurationDistribution.days90to180,
                      analytics.holdingPeriods.holdingDurationDistribution.days180to365,
                      analytics.holdingPeriods.holdingDurationDistribution.moreThan365,
                      1
                    )}
                    showLabel
                    color={defaultColors.negative}
                  />
                  <ProgressBar
                    label="30-90 days"
                    value={analytics.holdingPeriods.holdingDurationDistribution.days30to90}
                    maxValue={Math.max(
                      analytics.holdingPeriods.holdingDurationDistribution.lessThan30Days,
                      analytics.holdingPeriods.holdingDurationDistribution.days30to90,
                      analytics.holdingPeriods.holdingDurationDistribution.days90to180,
                      analytics.holdingPeriods.holdingDurationDistribution.days180to365,
                      analytics.holdingPeriods.holdingDurationDistribution.moreThan365,
                      1
                    )}
                    showLabel
                    color={defaultColors.warning}
                  />
                  <ProgressBar
                    label="90-180 days"
                    value={analytics.holdingPeriods.holdingDurationDistribution.days90to180}
                    maxValue={Math.max(
                      analytics.holdingPeriods.holdingDurationDistribution.lessThan30Days,
                      analytics.holdingPeriods.holdingDurationDistribution.days30to90,
                      analytics.holdingPeriods.holdingDurationDistribution.days90to180,
                      analytics.holdingPeriods.holdingDurationDistribution.days180to365,
                      analytics.holdingPeriods.holdingDurationDistribution.moreThan365,
                      1
                    )}
                    showLabel
                    color={defaultColors.accent}
                  />
                  <ProgressBar
                    label="180-365 days"
                    value={analytics.holdingPeriods.holdingDurationDistribution.days180to365}
                    maxValue={Math.max(
                      analytics.holdingPeriods.holdingDurationDistribution.lessThan30Days,
                      analytics.holdingPeriods.holdingDurationDistribution.days30to90,
                      analytics.holdingPeriods.holdingDurationDistribution.days90to180,
                      analytics.holdingPeriods.holdingDurationDistribution.days180to365,
                      analytics.holdingPeriods.holdingDurationDistribution.moreThan365,
                      1
                    )}
                    showLabel
                    color={defaultColors.positive}
                  />
                  <ProgressBar
                    label="> 1 year"
                    value={analytics.holdingPeriods.holdingDurationDistribution.moreThan365}
                    maxValue={Math.max(
                      analytics.holdingPeriods.holdingDurationDistribution.lessThan30Days,
                      analytics.holdingPeriods.holdingDurationDistribution.days30to90,
                      analytics.holdingPeriods.holdingDurationDistribution.days90to180,
                      analytics.holdingPeriods.holdingDurationDistribution.days180to365,
                      analytics.holdingPeriods.holdingDurationDistribution.moreThan365,
                      1
                    )}
                    showLabel
                    color={defaultColors.positive}
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 8. Portfolio Evolution */}
        <SectionHeader
          title="Portfolio Evolution"
          icon="git-branch-outline"
          isExpanded={expandedSection === "evolution"}
          onPress={() => toggleSection("evolution")}
        />
        {expandedSection === "evolution" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
              {analytics.evolution.yearlyAllocations.length === 0 ? (
                <Text style={styles.noDataText}>Portfolio evolution data requires transactions spanning multiple years.</Text>
              ) : (
                <>
                  <Text style={styles.evolutionTitle}>Allocation Evolution</Text>
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

        {/* 9. Investor Behavior Insights */}
        <SectionHeader
          title="Behavior Insights"
          icon="bulb-outline"
          isExpanded={expandedSection === "behavior"}
          onPress={() => toggleSection("behavior")}
        />
        {expandedSection === "behavior" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
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
                  <MetricCard
                    label="Avg Trade Size"
                    value={formatMoney(analytics.behavior.averageTradeSize, rc)}
                    compact
                  />
                  <MetricCard
                    label="Median Trade"
                    value={formatMoney(analytics.behavior.medianTradeSize, rc)}
                    compact
                  />
                  <MetricCard
                    label="Investing Streak"
                    value={`${analytics.behavior.consecutiveInvestingMonths} months`}
                    compact
                  />
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
          </View>
        )}

        {/* 10. Best and Worst Investments */}
        <SectionHeader
          title="Best & Worst"
          icon="podium-outline"
          isExpanded={expandedSection === "bestworst"}
          onPress={() => toggleSection("bestworst")}
        />
        {expandedSection === "bestworst" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
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
                      <Text style={styles.bestWorstMetricValue}>
                        {formatMoney(analytics.bestWorst.bestInvestment.totalInvested, rc)}
                      </Text>
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
                      <Text style={styles.bestWorstMetricValue}>
                        {formatMoney(analytics.bestWorst.worstInvestment.totalInvested, rc)}
                      </Text>
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
          </View>
        )}

        {/* 11. Activity Calendar */}
        <SectionHeader
          title="Activity Calendar"
          icon="calendar-outline"
          isExpanded={expandedSection === "activity"}
          onPress={() => toggleSection("activity")}
        />
        {expandedSection === "activity" && (
          <View style={styles.sectionContent}>
            <View style={styles.card}>
              <MetricGrid>
                <MetricCard
                  label="Trading Days"
                  value={String(analytics.activity.totalTradingDays)}
                  compact
                />
                <MetricCard
                  label="Avg/Month"
                  value={analytics.activity.averageTransactionsPerMonth.toFixed(1)}
                  subtitle="transactions"
                  compact
                />
                <MetricCard
                  label="Most Active Month"
                  value={analytics.activity.mostActiveMonth?.monthLabel ?? "-"}
                  subtitle={analytics.activity.mostActiveMonth
                    ? `${analytics.activity.mostActiveMonth.transactionCount} transactions`
                    : undefined}
                  compact
                />
                <MetricCard
                  label="Most Active Year"
                  value={analytics.activity.mostActiveYear?.year ?? "-"}
                  subtitle={analytics.activity.mostActiveYear
                    ? `${analytics.activity.mostActiveYear.transactionCount} transactions`
                    : undefined}
                  compact
                />
              </MetricGrid>

              {analytics.activity.activityByYear.length > 0 && (
                <View style={styles.subsection}>
                  <Text style={styles.subsectionTitle}>Activity by Year</Text>
                  <HorizontalBarChart
                    bars={analytics.activity.activityByYear.map((y) => ({
                      label: y.year,
                      value: y.transactionCount,
                      color: defaultColors.accent,
                    }))}
                    valueFormatter={(v) => `${v} txns`}
                  />
                </View>
              )}

              {analytics.activity.monthlyActivity.length > 0 && (
                <View style={styles.subsection}>
                  <Text style={styles.subsectionTitle}>Recent Monthly Activity</Text>
                  <MiniBarChart
                    data={analytics.activity.monthlyActivity.slice(-12).map((m) => ({
                      value: m.transactionCount,
                      label: m.monthKey.split("-")[1],
                    }))}
                    height={50}
                    showLabels
                  />
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

// Helper Components

function SectionHeader({
  title,
  icon,
  isExpanded,
  onPress,
}: {
  title: string;
  icon: string;
  isExpanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <Ionicons name={icon as any} size={20} color={defaultColors.accent} />
        <Text style={styles.sectionHeaderTitle}>{title}</Text>
      </View>
      <Ionicons
        name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"}
        size={20}
        color={defaultColors.accent}
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

  // Section
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionHeaderTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  sectionContent: {
    marginBottom: spacing.md,
  },

  // Card
  card: {
    borderRadius: radii.xl,
    backgroundColor: defaultColors.surface,
    padding: spacing.lg,
    gap: spacing.lg,
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
  evolutionTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
    marginBottom: spacing.sm,
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

  // Best/Worst
  bestWorstCard: {
    backgroundColor: `${defaultColors.positive}15`,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: "center",
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



