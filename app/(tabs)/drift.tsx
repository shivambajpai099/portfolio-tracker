import { useMemo } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DonutChart } from "../../src/components/DonutChart";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors, radii, spacing, typography } from "../../src/theme";
import type { AllocationSnapshot } from "../../src/types/portfolio";
import { formatMoney } from "../../src/utils/format";

const INDIA_COLOR = "#F59E0B";
const US_COLOR = "#6366F1";
const CASH_COLOR = "#374151";

type Trend = "UP" | "DOWN" | "FLAT";

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

export default function PortfolioDriftScreen() {
  const router = useRouter();
  const snapshots = usePortfolioStore((s) => s.allocationSnapshots);
  const rc = usePortfolioStore((s) => s.settings.reportingCurrency);

  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [snapshots]
  );

  const latest = sortedSnapshots[sortedSnapshots.length - 1] ?? null;

  const periodComparisons = useMemo(() => {
    if (!latest) return [];

    return [1, 3, 6]
      .map((months) => {
        const baseline = getSnapshotForPeriod(sortedSnapshots, months);
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
  }, [latest, sortedSnapshots]);

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Portfolio Drift</Text>
        <Text style={styles.subtitle}>Track how allocation shifts over time and catch concentration drift early.</Text>

        {!latest ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing to compare yet</Text>
            <Text style={styles.emptyText}>
              Drift shows how your portfolio allocation has shifted over time — how much is in India equities vs US equities vs cash, and which individual positions have grown or shrunk.
            </Text>
            <Text style={styles.emptyText}>
              Add a holding or update a price to record your first data point. Every change you make automatically builds up your history.
            </Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push("/(tabs)/holdings" as never)}>
              <Text style={styles.emptyBtnText}>Go to Holdings</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.latestCard}>
              <View>
                <Text style={styles.sectionLabel}>Latest Snapshot</Text>
                <Text style={styles.latestDate}>{toShortDate(latest.date)}</Text>
                <Text style={styles.latestValue}>{formatMoney(latest.totalPortfolioValue, rc)}</Text>
              </View>
              <DonutChart
                size={108}
                strokeWidth={16}
                slices={[
                  { value: latest.indiaAllocationPct, color: INDIA_COLOR },
                  { value: latest.usAllocationPct, color: US_COLOR },
                  { value: latest.cashAllocationPct, color: CASH_COLOR },
                ]}
              />
            </View>

            {periodComparisons.map((item) => (
              <View key={item.months} style={styles.periodCard}>
                <View style={styles.periodHeader}>
                  <Text style={styles.periodTitle}>vs {item.months} month{item.months > 1 ? "s" : ""} ago</Text>
                  <Text style={styles.periodDates}>{`${toShortDate(item.baseline.date)} -> ${toShortDate(item.latest.date)}`}</Text>
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
      </ScrollView>
    </ScreenContainer>
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
    marginBottom: spacing.xxl,
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
  emptyBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyBtnText: {
    color: colors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  latestCard: {
    marginBottom: spacing.xxl,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: typography.weightMedium,
  },
  latestDate: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.caption,
  },
  latestValue: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  periodCard: {
    marginBottom: spacing.xxl,
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
});

