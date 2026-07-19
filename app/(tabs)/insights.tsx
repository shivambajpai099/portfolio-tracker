import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
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
import { colors as defaultColors, radii, spacing, typography, useTheme } from "../../src/theme";
import { calcTransactionAnalytics } from "../../src/features/portfolio/transactionAnalytics";
import { getAllRealizations } from "../../src/features/portfolio/fifoCalculator";
import { excludeIntradayRoundTrips } from "../../src/features/portfolio/intraday";
import { calcSymbolAllocations, convert, holdingMarketValue } from "../../src/features/portfolio/calculations";
import { selectAllHoldings } from "../../src/features/portfolio/selectors";
import { formatMoney } from "../../src/utils/format";
import type { AllocationSnapshot, Currency, Holding } from "../../src/types/portfolio";

type TopLevelSection = "performance" | "evolution" | "behavior" | null;
type SubSection =
  | "performance_breakdown"
  | "winrate"
  | "bestworst"
  | "review"
  | "risk"
  | "drift"
  | "capital"
  | "dca"
  | "conviction"
  | "behavior_insights"
  | "holding"
  | null;

type Trend = "UP" | "DOWN" | "FLAT";

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

const monthKey = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
};

const monthLabel = (key: string): string => {
  const [year, month] = key.split("-").map((v) => Number(v));
  const date = new Date(year, (month || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

const toShortDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const monthsAgoDate = (months: number): Date => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
};

const getSnapshotForPeriod = (sortedSnapshots: AllocationSnapshot[], months: number): AllocationSnapshot | null => {
  if (sortedSnapshots.length === 0) return null;

  const target = monthsAgoDate(months).getTime();
  for (let i = sortedSnapshots.length - 1; i >= 0; i -= 1) {
    const snapTs = new Date(sortedSnapshots[i].date).getTime();
    if (Number.isFinite(snapTs) && snapTs <= target) {
      return sortedSnapshots[i];
    }
  }

  return sortedSnapshots[0];
};

const signedMoneyRc = (value: number, rc: "INR" | "USD"): string => {
  return `${value >= 0 ? "+" : ""}${formatMoney(value, rc)}`;
};

const trendFromDelta = (delta: number): Trend => {
  if (Math.abs(delta) < 0.1) return "FLAT";
  return delta > 0 ? "UP" : "DOWN";
};

const trendColor = (trend: Trend): string => {
  if (trend === "UP") return defaultColors.positive;
  if (trend === "DOWN") return defaultColors.negative;
  return defaultColors.muted;
};

const formatSignedPct = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

interface AllocationChange {
  label: "US" | "India" | "Cash";
  before: number;
  current: number;
  delta: number;
}

interface HoldingChange {
  symbol: string;
  before: number;
  current: number;
  delta: number;
}

const buildAllocationChanges = (latest: AllocationSnapshot, baseline: AllocationSnapshot): AllocationChange[] => [
  {
    label: "US",
    before: baseline.usAllocationPct,
    current: latest.usAllocationPct,
    delta: latest.usAllocationPct - baseline.usAllocationPct,
  },
  {
    label: "India",
    before: baseline.indiaAllocationPct,
    current: latest.indiaAllocationPct,
    delta: latest.indiaAllocationPct - baseline.indiaAllocationPct,
  },
  {
    label: "Cash",
    before: baseline.cashAllocationPct,
    current: latest.cashAllocationPct,
    delta: latest.cashAllocationPct - baseline.cashAllocationPct,
  },
];

const buildHoldingChanges = (latest: AllocationSnapshot, baseline: AllocationSnapshot): HoldingChange[] => {
  const baselineMap = new Map(baseline.topHoldings.map((item) => [item.symbol, item.allocationPct]));

  return latest.topHoldings
    .map((item) => {
      const before = baselineMap.get(item.symbol) ?? 0;
      return {
        symbol: item.symbol,
        before,
        current: item.allocationPct,
        delta: item.allocationPct - before,
      };
    })
    .filter((item) => Math.abs(item.delta) >= 0.1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
};

export default function PortfolioInsightsScreen() {
  const { colors } = useTheme();
  const transactions = usePortfolioStore((s) => s.transactions);
  const manualHoldings = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const accounts = usePortfolioStore((s) => s.accounts);
  const fxRates = usePortfolioStore((s) => s.fxRates);
  const settings = usePortfolioStore((s) => s.settings);
  const snapshots = usePortfolioStore((s) => s.allocationSnapshots);
  const marketPrices = usePortfolioStore((s) => s.marketPrices);
  const rc = settings.reportingCurrency;

  const priceMap = useMemo(() => new Map(Object.entries(marketPrices)), [marketPrices]);

  const holdings = useMemo(
    () => selectAllHoldings(manualHoldings, transactions, accounts, priceMap),
    [manualHoldings, transactions, accounts, priceMap]
  );

  const [expandedSection, setExpandedSection] = useState<TopLevelSection>(null);
  const [expandedSubSection, setExpandedSubSection] = useState<SubSection>(null);
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);
  const [reviewExportMsg, setReviewExportMsg] = useState("");
  const [reviewCardNode, setReviewCardNode] = useState<View | null>(null);

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

  const driftData = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const latest = sorted[sorted.length - 1] ?? null;

    if (!latest) return { latest: null, periodComparisons: [] };

    const periodComparisons = [1, 3]
      .map((months) => {
        const baseline = getSnapshotForPeriod(sorted, months);
        if (!baseline) return null;

        return {
          months,
          baseline,
          latest,
          allocationChanges: buildAllocationChanges(latest, baseline),
          holdingChanges: buildHoldingChanges(latest, baseline),
        };
      })
      .filter(Boolean) as Array<{
      months: number;
      baseline: AllocationSnapshot;
      latest: AllocationSnapshot;
      allocationChanges: AllocationChange[];
      holdingChanges: HoldingChange[];
    }>;

    return { latest, periodComparisons };
  }, [snapshots]);

  const monthlyReviewData = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const byMonth = new Map<string, AllocationSnapshot[]>();
    for (const snapshot of sorted) {
      const key = monthKey(snapshot.date);
      const list = byMonth.get(key) ?? [];
      list.push(snapshot);
      byMonth.set(key, list);
    }

    const monthlyOptions = [...byMonth.entries()]
      .map(([key, list]) => ({ key, label: monthLabel(key), start: list[0], end: list[list.length - 1] }))
      .sort((a, b) => b.key.localeCompare(a.key));

    const activeMonthKeyResolved = activeMonthKey ?? monthlyOptions[0]?.key ?? null;

    let activeMonthlyReview = null;
    if (activeMonthKeyResolved) {
      const month = monthlyOptions.find((item) => item.key === activeMonthKeyResolved);
      if (month) {
        const start = month.start;
        const end = month.end;
        const valueChange = end.totalPortfolioValue - start.totalPortfolioValue;
        const netCapitalAdded = end.investedValue - start.investedValue;
        const gainLossGenerated = valueChange - netCapitalAdded;

        const topByPerformance = [...end.topHoldings].sort((a, b) => b.gainLossPct - a.gainLossPct);
        const best = topByPerformance[0] ?? null;
        const worst = topByPerformance[topByPerformance.length - 1] ?? null;

        const sentences = [
          `Portfolio value ${valueChange >= 0 ? "increased" : "decreased"} by ${formatMoney(Math.abs(valueChange), rc)} during ${month.label}.`,
          `Net capital ${netCapitalAdded >= 0 ? "added" : "withdrawn"} was ${formatMoney(Math.abs(netCapitalAdded), rc)}, while performance generated ${signedMoneyRc(gainLossGenerated, rc)}.`,
          best
            ? `The best performing position was ${best.symbol} (${best.gainLossPct >= 0 ? "+" : ""}${best.gainLossPct.toFixed(1)}%).`
            : "No position performance data is available for this month.",
        ];

        activeMonthlyReview = { month, start, end, best, worst, sentences };
      }
    }

    return { monthlyOptions, activeMonthlyReview };
  }, [snapshots, activeMonthKey, rc]);

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
    return parts.length > 0 ? parts.join(" · ") : "Performance, win rate and monthly review";
  }, [analytics]);

  const evolutionPreview = useMemo(() => {
    const positions = `${analytics.journey.uniqueSymbolsOwned} positions`;
    const returnPct = analytics.performance.totalReturn !== 0
      ? `${analytics.performance.totalReturn >= 0 ? "+" : ""}${((analytics.performance.totalReturn / Math.max(analytics.capitalDeployment.totalInvested, 1)) * 100).toFixed(0)}% since inception`
      : null;
    const parts = [positions, returnPct].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Journey, allocation, risk and drift";
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

  const exportReviewAsImage = async () => {
    if (!reviewCardNode || !monthlyReviewData.activeMonthlyReview) return;

    try {
      const snapshotResult = await captureRef(reviewCardNode, {
        format: "png",
        quality: 1,
        result: Platform.OS === "web" ? "data-uri" : "tmpfile",
      });

      if (Platform.OS === "web") {
        const anchor = document.createElement("a");
        anchor.href = snapshotResult;
        anchor.download = `monthly-review-${monthlyReviewData.activeMonthlyReview.month.key}.png`;
        anchor.click();
        setReviewExportMsg("Monthly review image downloaded.");
        return;
      }

      const outputPath = `${FileSystem.cacheDirectory}monthly-review-${monthlyReviewData.activeMonthlyReview.month.key}.png`;
      await FileSystem.copyAsync({ from: snapshotResult, to: outputPath });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(outputPath, { mimeType: "image/png", dialogTitle: "Export Monthly Review" });
      }
      setReviewExportMsg("Monthly review image exported.");
    } catch {
      setReviewExportMsg("Unable to export image right now.");
    }

    setTimeout(() => setReviewExportMsg(""), 3000);
  };

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

        {/* 1. PERFORMANCE — Breakdown, Win Rate, Best & Worst, Monthly Review */}
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
                title="Performance Breakdown"
                isExpanded={expandedSubSection === "performance_breakdown"}
                onPress={() => toggleSubSection("performance_breakdown")}
              />
              {expandedSubSection === "performance_breakdown" && (
                <View style={styles.subSectionContent}>
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

              <SubSectionHeader
                title="Monthly Review"
                isExpanded={expandedSubSection === "review"}
                onPress={() => toggleSubSection("review")}
              />
              {expandedSubSection === "review" && (
                <View style={styles.subSectionContent}>
                  {monthlyReviewData.monthlyOptions.length === 0 ? (
                    <View style={ivStyles.emptyCard}>
                      <Text style={ivStyles.emptyTitle}>No monthly review yet</Text>
                      <Text style={ivStyles.emptyText}>
                        Monthly reviews appear once you have activity that spans at least a full calendar month.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={ivStyles.monthRow}>
                        {monthlyReviewData.monthlyOptions.slice(0, 12).map((item) => {
                          const active = (activeMonthKey ?? monthlyReviewData.monthlyOptions[0]?.key) === item.key;
                          return (
                            <Pressable
                              key={item.key}
                              onPress={() => setActiveMonthKey(item.key)}
                              style={[ivStyles.monthPill, active && ivStyles.monthPillActive]}
                            >
                              <Text style={[ivStyles.monthText, active && ivStyles.monthTextActive]}>{item.label.split(" ")[0]}</Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {monthlyReviewData.activeMonthlyReview ? (
                        <View ref={setReviewCardNode} collapsable={false} style={ivStyles.reviewCard}>
                          <Text style={ivStyles.reviewTitle}>{monthlyReviewData.activeMonthlyReview.month.label}</Text>

                          <View style={ivStyles.reviewGrid}>
                            <ReviewMetric
                              label="Best Position"
                              value={monthlyReviewData.activeMonthlyReview.best ? `${monthlyReviewData.activeMonthlyReview.best.symbol} ${monthlyReviewData.activeMonthlyReview.best.gainLossPct >= 0 ? "+" : ""}${monthlyReviewData.activeMonthlyReview.best.gainLossPct.toFixed(1)}%` : "-"}
                              positive
                            />
                            <ReviewMetric
                              label="Worst Position"
                              value={monthlyReviewData.activeMonthlyReview.worst ? `${monthlyReviewData.activeMonthlyReview.worst.symbol} ${monthlyReviewData.activeMonthlyReview.worst.gainLossPct >= 0 ? "+" : ""}${monthlyReviewData.activeMonthlyReview.worst.gainLossPct.toFixed(1)}%` : "-"}
                              positive={false}
                            />
                          </View>

                          <View style={ivStyles.summaryBlock}>
                            <Text style={ivStyles.summaryLabel}>Narrative Summary</Text>
                            {monthlyReviewData.activeMonthlyReview.sentences.map((sentence, idx) => (
                              <View key={idx} style={ivStyles.summaryRow}>
                                <View style={ivStyles.summaryDot} />
                                <Text style={ivStyles.summaryText}>{sentence}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null}

                      <View style={ivStyles.reviewActionRow}>
                        <Pressable onPress={exportReviewAsImage} style={ivStyles.exportBtn} disabled={!monthlyReviewData.activeMonthlyReview}>
                          <Text style={ivStyles.exportBtnText}>Export as Image</Text>
                        </Pressable>
                        {reviewExportMsg ? <Text style={ivStyles.exportStatus}>{reviewExportMsg}</Text> : null}
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        {/* 2. PORTFOLIO EVOLUTION — Journey, Allocation over time, Risk, Drift */}
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

              <SubSectionHeader
                title="Drift Over Time"
                isExpanded={expandedSubSection === "drift"}
                onPress={() => toggleSubSection("drift")}
              />
              {expandedSubSection === "drift" && (
                <View style={styles.subSectionContent}>
                  {!driftData.latest ? (
                    <View style={ivStyles.emptyCard}>
                      <Text style={ivStyles.emptyTitle}>Nothing to compare yet</Text>
                      <Text style={ivStyles.emptyText}>
                        Drift shows how your portfolio allocation has shifted over time. Add a holding or update a price to record your first data point.
                      </Text>
                    </View>
                  ) : (
                    <>
                      {driftData.periodComparisons.map((item) => (
                        <View key={item.months} style={ivStyles.periodCard}>
                          <View style={ivStyles.periodHeader}>
                            <Text style={ivStyles.periodTitle}>vs {item.months} month{item.months > 1 ? "s" : ""} ago</Text>
                            <Text style={ivStyles.periodDates}>{`${toShortDate(item.baseline.date)} → ${toShortDate(item.latest.date)}`}</Text>
                          </View>

                          <View style={ivStyles.changeList}>
                            {item.allocationChanges.map((change) => {
                              const trend = trendFromDelta(change.delta);
                              return (
                                <View key={change.label} style={ivStyles.changeRow}>
                                  <View style={ivStyles.changeTextWrap}>
                                    <Text style={ivStyles.changeText}>
                                      {change.label} allocation {change.delta >= 0 ? "increased" : "decreased"} from {change.before.toFixed(1)}% to {change.current.toFixed(1)}% ({formatSignedPct(change.delta)})
                                    </Text>
                                  </View>
                                  <View style={[ivStyles.trendBadge, { borderColor: trendColor(trend) }]}>
                                    <Text style={[ivStyles.trendBadgeText, { color: trendColor(trend) }]}>
                                      {trend === "UP" ? "↑" : trend === "DOWN" ? "↓" : "→"}
                                    </Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>

                          <View style={ivStyles.holdingSection}>
                            <Text style={ivStyles.holdingTitle}>Top Holdings Drift</Text>
                            {item.holdingChanges.length === 0 ? (
                              <Text style={ivStyles.holdingFallback}>No major top-holding changes for this period.</Text>
                            ) : (
                              item.holdingChanges.map((holding) => (
                                <View key={holding.symbol} style={ivStyles.holdingRow}>
                                  <Text style={ivStyles.holdingText}>
                                    {holding.symbol} {holding.delta >= 0 ? "grew" : "fell"} from {holding.before.toFixed(1)}% to {holding.current.toFixed(1)}% of portfolio
                                  </Text>
                                  <Text
                                    style={[
                                      ivStyles.holdingDelta,
                                      { color: holding.delta >= 0 ? colors.positive : colors.negative },
                                    ]}
                                  >
                                    {formatSignedPct(holding.delta)}
                                  </Text>
                                </View>
                              ))
                            )}
                          </View>
                        </View>
                      ))}
                    </>
                  )}
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

function ReviewMetric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <View style={ivStyles.reviewMetric}>
      <Text style={ivStyles.reviewMetricLabel}>{label}</Text>
      <Text style={[ivStyles.reviewMetricValue, { color: positive ? defaultColors.text : defaultColors.negative }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
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

