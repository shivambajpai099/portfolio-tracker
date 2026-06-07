import { useMemo, useState } from "react";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Pressable, ScrollView, StyleSheet, Text, View, Platform } from "react-native";
import { captureRef } from "react-native-view-shot";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { TimeSeriesChart, type TimeSeriesPoint } from "../../src/components/TimeSeriesChart";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors, radii, spacing, typography } from "../../src/theme";
import type { AllocationSnapshot } from "../../src/types/portfolio";
import { formatMoney } from "../../src/utils/format";

type RangeFilter = "1M" | "3M" | "6M" | "1Y" | "ALL";

const RANGE_MONTHS: Record<Exclude<RangeFilter, "ALL">, number> = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
};

const rangeCutoff = (range: RangeFilter): number | null => {
  if (range === "ALL") return null;
  const months = RANGE_MONTHS[range];
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.getTime();
};

const compactDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

const signedMoney = (value: number, rc: "INR" | "USD"): string =>
  `${value >= 0 ? "+" : ""}${formatMoney(value, rc)}`;

const toSeries = (
  snapshots: AllocationSnapshot[],
  selector: (s: AllocationSnapshot) => number
): TimeSeriesPoint[] => snapshots.map((snapshot) => ({ label: compactDate(snapshot.date), value: selector(snapshot) }));

export default function PortfolioTimelineScreen() {
  const snapshots = usePortfolioStore((s) => s.allocationSnapshots);
  const rc = usePortfolioStore((s) => s.settings.reportingCurrency);
  const [range, setRange] = useState<RangeFilter>("6M");
  const [reviewExportMsg, setReviewExportMsg] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [reviewCardNode, setReviewCardNode] = useState<View | null>(null);

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [snapshots]
  );

  const filtered = useMemo(() => {
    const cutoff = rangeCutoff(range);
    if (cutoff === null) return sorted;

    const scoped = sorted.filter((snapshot) => {
      const ts = new Date(snapshot.date).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });

    if (scoped.length > 0) return scoped;
    return sorted.slice(-1);
  }, [sorted, range]);

  const latest = filtered[filtered.length - 1] ?? null;
  const earliest = filtered[0] ?? null;

  const totalSeries = useMemo(() => toSeries(filtered, (s) => s.totalPortfolioValue), [filtered]);
  const investedSeries = useMemo(() => toSeries(filtered, (s) => s.investedValue), [filtered]);
  const gainSeries = useMemo(() => toSeries(filtered, (s) => s.gainLoss), [filtered]);

  const change = useMemo(() => {
    if (!latest || !earliest) return null;
    return {
      total: latest.totalPortfolioValue - earliest.totalPortfolioValue,
      invested: latest.investedValue - earliest.investedValue,
      gain: latest.gainLoss - earliest.gainLoss,
    };
  }, [latest, earliest]);

  const monthlyOptions = useMemo(() => {
    const byMonth = new Map<string, AllocationSnapshot[]>();
    for (const snapshot of sorted) {
      const key = monthKey(snapshot.date);
      const list = byMonth.get(key) ?? [];
      list.push(snapshot);
      byMonth.set(key, list);
    }

    return [...byMonth.entries()]
      .map(([key, list]) => ({ key, label: monthLabel(key), start: list[0], end: list[list.length - 1] }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [sorted]);

  const activeMonthKey = selectedMonthKey ?? monthlyOptions[0]?.key ?? null;

  const activeMonthlyReview = useMemo(() => {
    if (!activeMonthKey) return null;
    const month = monthlyOptions.find((item) => item.key === activeMonthKey);
    if (!month) return null;

    const start = month.start;
    const end = month.end;
    const valueChange = end.totalPortfolioValue - start.totalPortfolioValue;
    const netCapitalAdded = end.investedValue - start.investedValue;
    const gainLossGenerated = valueChange - netCapitalAdded;

    const topByPerformance = [...end.topHoldings].sort((a, b) => b.gainLossPct - a.gainLossPct);
    const best = topByPerformance[0] ?? null;
    const worst = topByPerformance[topByPerformance.length - 1] ?? null;
    const largest = [...end.topHoldings].sort((a, b) => b.allocationPct - a.allocationPct)[0] ?? null;

    const sentences = [
      `Portfolio value ${valueChange >= 0 ? "increased" : "decreased"} by ${formatMoney(Math.abs(valueChange), rc)} during ${month.label}.`,
      `Net capital ${netCapitalAdded >= 0 ? "added" : "withdrawn"} was ${formatMoney(Math.abs(netCapitalAdded), rc)}, while performance generated ${signedMoney(gainLossGenerated, rc)}.`,
      best
        ? `The best performing position was ${best.symbol} (${best.gainLossPct >= 0 ? "+" : ""}${best.gainLossPct.toFixed(1)}%).`
        : "No position performance data is available for this month.",
      `Cash allocation remains at ${end.cashAllocationPct.toFixed(1)}%.`,
      `US allocation moved from ${start.usAllocationPct.toFixed(1)}% to ${end.usAllocationPct.toFixed(1)}%.`,
    ];

    return {
      month,
      start,
      end,
      valueChange,
      netCapitalAdded,
      gainLossGenerated,
      best,
      worst,
      largest,
      sentences,
    };
  }, [activeMonthKey, monthlyOptions, rc]);

  const exportReviewAsImage = async () => {
    if (!reviewCardNode || !activeMonthlyReview) return;

    try {
      const snapshotResult = await captureRef(reviewCardNode, {
        format: "png",
        quality: 1,
        result: Platform.OS === "web" ? "data-uri" : "tmpfile",
      });

      if (Platform.OS === "web") {
        const anchor = document.createElement("a");
        anchor.href = snapshotResult;
        anchor.download = `monthly-review-${activeMonthlyReview.month.key}.png`;
        anchor.click();
        setReviewExportMsg("Monthly review image downloaded.");
        return;
      }

      const outputPath = `${FileSystem.cacheDirectory}monthly-review-${activeMonthlyReview.month.key}.png`;
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

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Portfolio Timeline</Text>
        <Text style={styles.subtitle}>Historical performance across value, invested capital, and gain/loss.</Text>

        <View style={styles.filterRow}>
          {(["1M", "3M", "6M", "1Y", "ALL"] as RangeFilter[]).map((item) => {
            const active = range === item;
            return (
              <Pressable
                key={item}
                onPress={() => setRange(item)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.chartSection}>
          <Text style={styles.sectionLabel}>Monthly Portfolio Review</Text>

          <View style={styles.monthRow}>
            {monthlyOptions.slice(0, 12).map((item) => {
              const active = activeMonthKey === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setSelectedMonthKey(item.key)}
                  style={[styles.monthPill, active && styles.monthPillActive]}
                >
                  <Text style={[styles.monthText, active && styles.monthTextActive]}>{item.label.split(" ")[0]}</Text>
                </Pressable>
              );
            })}
          </View>

          {activeMonthlyReview ? (
            <View ref={setReviewCardNode} collapsable={false} style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>{activeMonthlyReview.month.label}</Text>

              <View style={styles.reviewGrid}>
                <ReviewMetric label="Value Change" value={signedMoney(activeMonthlyReview.valueChange, rc)} positive={activeMonthlyReview.valueChange >= 0} />
                <ReviewMetric label="Net Capital" value={signedMoney(activeMonthlyReview.netCapitalAdded, rc)} positive={activeMonthlyReview.netCapitalAdded >= 0} />
                <ReviewMetric label="Generated P/L" value={signedMoney(activeMonthlyReview.gainLossGenerated, rc)} positive={activeMonthlyReview.gainLossGenerated >= 0} />
                <ReviewMetric label="Largest Holding" value={activeMonthlyReview.largest ? `${activeMonthlyReview.largest.symbol} ${activeMonthlyReview.largest.allocationPct.toFixed(1)}%` : "-"} positive />
                <ReviewMetric label="Cash Allocation" value={`${activeMonthlyReview.end.cashAllocationPct.toFixed(1)}%`} positive />
                <ReviewMetric label="India / US" value={`${activeMonthlyReview.end.indiaAllocationPct.toFixed(1)}% / ${activeMonthlyReview.end.usAllocationPct.toFixed(1)}%`} positive />
                <ReviewMetric label="Best Position" value={activeMonthlyReview.best ? `${activeMonthlyReview.best.symbol} ${activeMonthlyReview.best.gainLossPct >= 0 ? "+" : ""}${activeMonthlyReview.best.gainLossPct.toFixed(1)}%` : "-"} positive />
                <ReviewMetric label="Worst Position" value={activeMonthlyReview.worst ? `${activeMonthlyReview.worst.symbol} ${activeMonthlyReview.worst.gainLossPct >= 0 ? "+" : ""}${activeMonthlyReview.worst.gainLossPct.toFixed(1)}%` : "-"} positive={false} />
              </View>

              <View style={styles.summaryBlock}>
                <Text style={styles.summaryLabel}>Narrative Summary</Text>
                {activeMonthlyReview.sentences.map((sentence) => (
                  <View key={sentence} style={styles.summaryRow}>
                    <View style={styles.summaryDot} />
                    <Text style={styles.summaryText}>{sentence}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No monthly data yet</Text>
              <Text style={styles.emptyText}>Once snapshots exist across a month, your monthly review appears here.</Text>
            </View>
          )}

          <View style={styles.reviewActionRow}>
            <Pressable onPress={exportReviewAsImage} style={styles.exportBtn} disabled={!activeMonthlyReview}>
              <Text style={styles.exportBtnText}>Export as Image</Text>
            </Pressable>
            {reviewExportMsg ? <Text style={styles.exportStatus}>{reviewExportMsg}</Text> : null}
          </View>
        </View>

        {!latest ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No timeline data yet</Text>
            <Text style={styles.emptyText}>Add or update holdings to start building your portfolio history.</Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <MetricRow label="Total Value" value={formatMoney(latest.totalPortfolioValue, rc)} delta={change?.total} rc={rc} />
              <MetricRow label="Invested Value" value={formatMoney(latest.investedValue, rc)} delta={change?.invested} rc={rc} />
              <MetricRow label="Total Gain/Loss" value={formatMoney(latest.gainLoss, rc)} delta={change?.gain} rc={rc} />
            </View>

            <View style={styles.chartSection}>
              <Text style={styles.sectionLabel}>Portfolio Value</Text>
              <TimeSeriesChart
                points={totalSeries}
                color="#67E8F9"
                yLabel={`Range: ${range}`}
                formatValue={(v) => formatMoney(v, rc)}
              />
            </View>

            <View style={styles.chartSection}>
              <Text style={styles.sectionLabel}>Invested Value</Text>
              <TimeSeriesChart
                points={investedSeries}
                color="#6366F1"
                yLabel={`Range: ${range}`}
                formatValue={(v) => formatMoney(v, rc)}
              />
            </View>

            <View style={styles.chartSection}>
              <Text style={styles.sectionLabel}>Gain / Loss</Text>
              <TimeSeriesChart
                points={gainSeries}
                color={latest.gainLoss >= 0 ? colors.positive : colors.negative}
                yLabel={`Range: ${range}`}
                formatValue={(v) => formatMoney(v, rc)}
              />
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function MetricRow({
  label,
  value,
  delta,
  rc,
}: {
  label: string;
  value: string;
  delta: number | undefined;
  rc: "INR" | "USD";
}) {
  const hasDelta = delta != null;
  const isPositive = (delta ?? 0) >= 0;
  const deltaText = hasDelta ? `${isPositive ? "+" : ""}${formatMoney(delta, rc)}` : "-";

  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricRight}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={[styles.metricDelta, { color: hasDelta ? (isPositive ? colors.positive : colors.negative) : colors.muted }]}>
          {deltaText}
        </Text>
      </View>
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
  filterRow: {
    marginBottom: spacing.xl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  filterPill: {
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  filterPillActive: {
    backgroundColor: colors.accent,
  },
  filterText: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  filterTextActive: {
    color: colors.bg,
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
  },
  summaryCard: {
    marginBottom: spacing.xxl,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricLabel: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  metricRight: {
    alignItems: "flex-end",
  },
  metricValue: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  metricDelta: {
    marginTop: 2,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  chartSection: {
    marginBottom: spacing.xxl,
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
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


