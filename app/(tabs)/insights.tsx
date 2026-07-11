import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { Platform } from "react-native";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { CountryAllocationBlock } from "../../src/components/CountryAllocationBlock";
import { RiskSnapshotSection } from "../../src/components/RiskSnapshotSection";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors, radii, spacing, typography } from "../../src/theme";
import { calcSymbolAllocations, convert, holdingMarketValue } from "../../src/features/portfolio/calculations";
import { formatMoney } from "../../src/utils/format";
import type { AllocationSnapshot, Holding } from "../../src/types/portfolio";

type Trend = "UP" | "DOWN" | "FLAT";

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

const signedMoney = (value: number, rc: "INR" | "USD"): string => {
  return `${value >= 0 ? "+" : ""}${formatMoney(value, rc)}`;
};

const trendFromDelta = (delta: number): Trend => {
  if (Math.abs(delta) < 0.1) return "FLAT";
  return delta > 0 ? "UP" : "DOWN";
};

const trendColor = (trend: Trend): string => {
  if (trend === "UP") return colors.positive;
  if (trend === "DOWN") return colors.negative;
  return colors.muted;
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
  const holdings = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const fxRates = usePortfolioStore((s) => s.fxRates);
  const settings = usePortfolioStore((s) => s.settings);
  const snapshots = usePortfolioStore((s) => s.allocationSnapshots);

  const rc = settings.reportingCurrency;

  const [expandedSection, setExpandedSection] = useState<"risk" | "drift" | "review" | null>("risk");
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);
  const [reviewExportMsg, setReviewExportMsg] = useState("");
  const [reviewCardNode, setReviewCardNode] = useState<View | null>(null);

  // SHARED: Country Allocation — single data source for all sections
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

  // RISK SNAPSHOT DATA
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

    // Sector allocation
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

    return {
      allocations: sorted,
      top5Pct,
      top10Pct,
      largestPositionPct,
      sectorRows,
    };
  }, [holdings, cashHoldings, fxRates, rc, settings.allocationBasis, settings.allocationIncludeCash]);

  // DRIFT DATA — vs 1 month and vs 3 months only
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

  // MONTHLY REVIEW DATA
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
          `Net capital ${netCapitalAdded >= 0 ? "added" : "withdrawn"} was ${formatMoney(Math.abs(netCapitalAdded), rc)}, while performance generated ${signedMoney(gainLossGenerated, rc)}.`,
          best
            ? `The best performing position was ${best.symbol} (${best.gainLossPct >= 0 ? "+" : ""}${best.gainLossPct.toFixed(1)}%).`
            : "No position performance data is available for this month.",
        ];

        activeMonthlyReview = {
          month,
          start,
          end,
          best,
          worst,
          sentences,
        };
      }
    }

    return { monthlyOptions, activeMonthlyReview };
  }, [snapshots, activeMonthKey, rc]);

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
          <Text style={styles.title}>Insights</Text>
          <Text style={styles.subtitle}>Analyze risk, allocation drift, and performance trends.</Text>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No holdings to analyze yet</Text>
            <Text style={styles.emptyText}>
              Insights about risk, allocation drift, and monthly performance will appear here once you add holdings to your portfolio.
            </Text>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Insights</Text>
        <Text style={styles.subtitle}>Analyze risk, allocation drift, and performance trends.</Text>

        {/* SHARED COUNTRY ALLOCATION — rendered once, referenced by all sections */}
        <CountryAllocationBlock
          indiaValue={countryData.indiaValue}
          usValue={countryData.usValue}
          cashValue={countryData.cashValue}
          indiaPctEquity={countryData.indiaPctEquity}
          usPctEquity={countryData.usPctEquity}
          cashPctPortfolio={countryData.cashPctPortfolio}
          rc={rc}
        />

        {/* RISK SNAPSHOT SECTION */}
        <CollapsibleSectionHeader
          title="Risk Snapshot"
          isExpanded={expandedSection === "risk"}
          onPress={() => setExpandedSection(expandedSection === "risk" ? null : "risk")}
        />
        {expandedSection === "risk" && (
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
        )}

        {/* DRIFT OVER TIME SECTION */}
        <CollapsibleSectionHeader
          title="Drift Over Time"
          isExpanded={expandedSection === "drift"}
          onPress={() => setExpandedSection(expandedSection === "drift" ? null : "drift")}
        />
        {expandedSection === "drift" && (
          <View style={styles.sectionContent}>
            {!driftData.latest ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Nothing to compare yet</Text>
                <Text style={styles.emptyText}>
                  Drift shows how your portfolio allocation has shifted over time. Add a holding or update a price to record your first data point.
                </Text>
              </View>
            ) : (
              <>
                {driftData.periodComparisons.map((item) => (
                  <View key={item.months} style={styles.periodCard}>
                    <View style={styles.periodHeader}>
                      <Text style={styles.periodTitle}>vs {item.months} month{item.months > 1 ? "s" : ""} ago</Text>
                      <Text style={styles.periodDates}>{`${toShortDate(item.baseline.date)} → ${toShortDate(item.latest.date)}`}</Text>
                    </View>

                    <View style={styles.changeList}>
                      {item.allocationChanges.map((change) => {
                        const trend = trendFromDelta(change.delta);
                        return (
                          <View key={change.label} style={styles.changeRow}>
                            <View style={styles.changeTextWrap}>
                              <Text style={styles.changeText}>
                                {change.label} allocation {change.delta >= 0 ? "increased" : "decreased"} from {change.before.toFixed(1)}% to {change.current.toFixed(1)}% ({formatSignedPct(change.delta)})
                              </Text>
                            </View>
                            <View style={[styles.trendBadge, { borderColor: trendColor(trend) }]}>
                              <Text style={[styles.trendBadgeText, { color: trendColor(trend) }]}>
                                {trend === "UP" ? "↑" : trend === "DOWN" ? "↓" : "→"}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    <View style={styles.holdingSection}>
                      <Text style={styles.holdingTitle}>Top Holdings Drift</Text>
                      {item.holdingChanges.length === 0 ? (
                        <Text style={styles.holdingFallback}>No major top-holding changes for this period.</Text>
                      ) : (
                        item.holdingChanges.map((holding) => (
                          <View key={holding.symbol} style={styles.holdingRow}>
                            <Text style={styles.holdingText}>
                              {holding.symbol} {holding.delta >= 0 ? "grew" : "fell"} from {holding.before.toFixed(1)}% to {holding.current.toFixed(1)}% of portfolio
                            </Text>
                            <Text
                              style={[
                                styles.holdingDelta,
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

        {/* MONTHLY REVIEW SECTION */}
        <CollapsibleSectionHeader
          title="Monthly Review"
          isExpanded={expandedSection === "review"}
          onPress={() => setExpandedSection(expandedSection === "review" ? null : "review")}
        />
        {expandedSection === "review" && (
          <View style={styles.sectionContent}>
            {monthlyReviewData.monthlyOptions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No monthly review yet</Text>
                <Text style={styles.emptyText}>
                  Monthly reviews appear once you have activity that spans at least a full calendar month.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.monthRow}>
                  {monthlyReviewData.monthlyOptions.slice(0, 12).map((item) => {
                    const active = (activeMonthKey ?? monthlyReviewData.monthlyOptions[0]?.key) === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => setActiveMonthKey(item.key)}
                        style={[styles.monthPill, active && styles.monthPillActive]}
                      >
                        <Text style={[styles.monthText, active && styles.monthTextActive]}>{item.label.split(" ")[0]}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {monthlyReviewData.activeMonthlyReview ? (
                  <View ref={setReviewCardNode} collapsable={false} style={styles.reviewCard}>
                    <Text style={styles.reviewTitle}>{monthlyReviewData.activeMonthlyReview.month.label}</Text>

                    <View style={styles.reviewGrid}>
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

                    <View style={styles.summaryBlock}>
                      <Text style={styles.summaryLabel}>Narrative Summary</Text>
                      {monthlyReviewData.activeMonthlyReview.sentences.map((sentence, idx) => (
                        <View key={idx} style={styles.summaryRow}>
                          <View style={styles.summaryDot} />
                          <Text style={styles.summaryText}>{sentence}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.reviewActionRow}>
                  <Pressable onPress={exportReviewAsImage} style={styles.exportBtn} disabled={!monthlyReviewData.activeMonthlyReview}>
                    <Text style={styles.exportBtnText}>Export as Image</Text>
                  </Pressable>
                  {reviewExportMsg ? <Text style={styles.exportStatus}>{reviewExportMsg}</Text> : null}
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function CollapsibleSectionHeader({
  title,
  isExpanded,
  onPress,
}: {
  title: string;
  isExpanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.sectionHeaderContainer}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <Ionicons
        name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"}
        size={20}
        color={colors.accent}
      />
    </Pressable>
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
    <View style={styles.reviewMetric}>
      <Text style={styles.reviewMetricLabel}>{label}</Text>
      <Text style={[styles.reviewMetricValue, { color: positive ? colors.text : colors.negative }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
  },
  title: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    color: colors.muted,
    fontSize: typography.caption,
  },
  emptyCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  emptyText: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  sectionHeaderContainer: {
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHeader: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  sectionContent: {
    marginBottom: spacing.lg,
  },
  // Drift section styles
  periodCard: {
    marginBottom: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  periodHeader: {
    marginBottom: spacing.md,
  },
  periodTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  periodDates: {
    marginTop: 2,
    color: colors.muted,
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
    color: colors.text,
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
    color: colors.muted,
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: typography.weightMedium,
  },
  holdingFallback: {
    color: colors.muted,
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
    color: colors.text,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  holdingDelta: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  // Monthly review styles
  monthRow: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  monthPill: {
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  monthPillActive: {
    backgroundColor: colors.accent,
  },
  monthText: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  monthTextActive: {
    color: colors.bg,
  },
  reviewCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  reviewTitle: {
    color: colors.text,
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
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  reviewMetricLabel: {
    color: colors.muted,
    fontSize: typography.micro,
  },
  reviewMetricValue: {
    marginTop: 2,
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  summaryBlock: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopColor: "#1E2128",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryLabel: {
    color: colors.muted,
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
    backgroundColor: colors.accent,
  },
  summaryText: {
    flex: 1,
    color: colors.muted,
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
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  exportBtnText: {
    color: colors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  exportStatus: {
    color: colors.muted,
    fontSize: typography.caption,
  },
});

