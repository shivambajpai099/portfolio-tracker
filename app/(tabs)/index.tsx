import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PortfolioPerformanceChart, type PortfolioHistoryPoint, type TimeRangeView } from "../../src/components/PortfolioPerformanceChart";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { TickerImage } from "../../src/components/TickerImage";
import {
  calcPortfolioTotals,
  calcSymbolAllocations,
  convert,
} from "../../src/features/portfolio/calculations";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { radii, spacing, typography, useTheme } from "../../src/theme";
import type { Currency } from "../../src/types/portfolio";
import { formatMoney } from "../../src/utils/format";

type GeoFilter = "ALL" | "INDIA" | "US";

const TICKER_PALETTE = [
  "#67E8F9",
  "#6366F1",
  "#F59E0B",
  "#22C55E",
  "#EC4899",
  "#3B82F6",
  "#A78BFA",
  "#F97316",
  "#14B8A6",
  "#E879F9",
];

const CASH_COLOR = "#374151";
const OTHERS_COLOR = "#4B5563";

// Number of positions to show before "X more positions" row
const VISIBLE_POSITIONS = 5;
// Number of top positions to show individually in the allocation bar
const TOP_N_BAR_SEGMENTS = 5;

/**
 * Deterministic color assignment based on ticker symbol hash.
 * Ensures consistent colors across renders and reorderings.
 */
const getTickerColor = (symbol: string): string => {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % TICKER_PALETTE.length;
  return TICKER_PALETTE[index];
};

/**
 * Custom toggle switch component (no external dependency).
 */
function ToggleSwitch({
  value,
  onValueChange,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      style={[
        styles.toggleTrack,
        { backgroundColor: value ? colors.accent : colors.surface },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View
        style={[
          styles.toggleKnob,
          {
            backgroundColor: value ? colors.bg : colors.muted,
            transform: [{ translateX: value ? 14 : 2 }],
          },
        ]}
      />
    </Pressable>
  );
}

export default function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const holdings = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const accounts = usePortfolioStore((s) => s.accounts);
  const fxRates = usePortfolioStore((s) => s.fxRates);
  const settings = usePortfolioStore((s) => s.settings);
  const updateSettings = usePortfolioStore((s) => s.updateSettings);
  const allocationSnapshots = usePortfolioStore((s) => s.allocationSnapshots);

  const [geoFilter, setGeoFilter] = useState<GeoFilter>("ALL");
  const [expanded, setExpanded] = useState(false);
  const [performanceView, setPerformanceView] = useState<TimeRangeView>("monthly");

  const rc: Currency = settings.reportingCurrency;

  const filteredHoldings = useMemo(() => {
    if (geoFilter === "ALL") return holdings;
    return holdings.filter((h) => {
      const isIndia = h.currency === "INR" || h.symbol.endsWith(".NS") || h.symbol.endsWith(".BO");
      return geoFilter === "INDIA" ? isIndia : !isIndia;
    });
  }, [holdings, geoFilter]);

  const filteredCashHoldings = useMemo(() => {
    if (geoFilter === "ALL") return cashHoldings;
    return cashHoldings.filter((cash) => (geoFilter === "INDIA" ? cash.currency === "INR" : cash.currency === "USD"));
  }, [cashHoldings, geoFilter]);

  const totalsCashHoldings = useMemo(
    () => (settings.allocationIncludeCash ? filteredCashHoldings : []),
    [settings.allocationIncludeCash, filteredCashHoldings]
  );

  const totals = useMemo(
    () => calcPortfolioTotals(filteredHoldings, totalsCashHoldings, fxRates, rc),
    [filteredHoldings, totalsCashHoldings, fxRates, rc]
  );
  const allocations = useMemo(
    () => calcSymbolAllocations(filteredHoldings, filteredCashHoldings, fxRates, rc, settings.allocationBasis, settings.allocationIncludeCash),
    [filteredHoldings, filteredCashHoldings, fxRates, rc, settings.allocationBasis, settings.allocationIncludeCash]
  );
  const rankedAllocations = useMemo(() => {
    return [...allocations].sort((a, b) => {
      if (b.allocationPct !== a.allocationPct) {
        return b.allocationPct - a.allocationPct;
      }

      const aBasisValue = settings.allocationBasis === "INVESTED_VALUE" ? a.investedValue : a.currentValue;
      const bBasisValue = settings.allocationBasis === "INVESTED_VALUE" ? b.investedValue : b.currentValue;
      if (bBasisValue !== aBasisValue) {
        return bBasisValue - aBasisValue;
      }

      return a.symbol.localeCompare(b.symbol);
    });
  }, [allocations, settings.allocationBasis]);

  const cashValueRC = useMemo(
    () => filteredCashHoldings.reduce((sum, c) => sum + convert(c.balance, c.currency, rc, fxRates), 0),
    [filteredCashHoldings, rc, fxRates]
  );

  const cashAllocationPct = useMemo(() => {
    if (!settings.allocationIncludeCash || cashValueRC === 0) return 0;
    const symbolsTotal = rankedAllocations.reduce((sum, a) => sum + a.allocationPct, 0);
    return Math.max(0, 100 - symbolsTotal);
  }, [rankedAllocations, settings.allocationIncludeCash, cashValueRC]);

  // Build allocation bar segments: top N + others + cash
  const allocationBarSegments = useMemo(() => {
    const topN = rankedAllocations.slice(0, TOP_N_BAR_SEGMENTS);
    const othersAllocations = rankedAllocations.slice(TOP_N_BAR_SEGMENTS);
    const othersPct = othersAllocations.reduce((sum, a) => sum + a.allocationPct, 0);

    const segments: Array<{ symbol: string; pct: number; color: string; tooltip: string }> = [];

    for (const item of topN) {
      segments.push({
        symbol: item.symbol,
        pct: item.allocationPct,
        color: getTickerColor(item.symbol),
        tooltip: `${item.symbol}: ${item.allocationPct.toFixed(1)}%`,
      });
    }

    if (othersPct > 0) {
      segments.push({
        symbol: "OTHERS",
        pct: othersPct,
        color: OTHERS_COLOR,
        tooltip: `${othersAllocations.length} others: ${othersPct.toFixed(1)}%`,
      });
    }

    if (cashAllocationPct > 0) {
      segments.push({
        symbol: "CASH",
        pct: cashAllocationPct,
        color: CASH_COLOR,
        tooltip: `Cash: ${cashAllocationPct.toFixed(1)}%`,
      });
    }

    return segments;
  }, [rankedAllocations, cashAllocationPct]);

  // Determine which holdings to display based on expanded state
  const visibleAllocations = useMemo(() => {
    if (expanded) return rankedAllocations;
    return rankedAllocations.slice(0, VISIBLE_POSITIONS);
  }, [rankedAllocations, expanded]);

  const hiddenCount = rankedAllocations.length - VISIBLE_POSITIONS;
  const showMoreRow = !expanded && hiddenCount > 0;

  // Transform allocation snapshots to performance chart data
  const performanceData = useMemo((): PortfolioHistoryPoint[] => {
    if (allocationSnapshots.length === 0) return [];

    // Sort snapshots by date
    const sorted = [...allocationSnapshots].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Group by view type
    if (performanceView === "daily") {
      // Return all points for daily view
      return sorted.map((s) => ({
        date: s.date,
        investedAmount: s.investedValue,
        currentValue: s.totalPortfolioValue,
      }));
    }

    if (performanceView === "monthly") {
      // Group by month, take last snapshot of each month
      const byMonth = new Map<string, typeof sorted[0]>();
      for (const s of sorted) {
        const d = new Date(s.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(key, s); // Last one wins
      }
      return [...byMonth.values()].map((s) => ({
        date: s.date,
        investedAmount: s.investedValue,
        currentValue: s.totalPortfolioValue,
      }));
    }

    // Yearly view - group by year, take last snapshot of each year
    const byYear = new Map<string, typeof sorted[0]>();
    for (const s of sorted) {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}`;
      byYear.set(key, s);
    }
    return [...byYear.values()].map((s) => ({
      date: s.date,
      investedAmount: s.investedValue,
      currentValue: s.totalPortfolioValue,
    }));
  }, [allocationSnapshots, performanceView]);

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Portfolio</Text>
          <View style={styles.filterRow}>
            {(["ALL", "INDIA", "US"] as GeoFilter[]).map((f) => {
              const active = geoFilter === f;
              return (
                <Pressable key={f} onPress={() => setGeoFilter(f)} style={[styles.filterPill, { backgroundColor: active ? colors.accent : colors.surface }]}>
                  <Text style={[styles.filterText, { color: active ? colors.bg : colors.muted }]}>{f}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {accounts.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No accounts yet</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>There is nothing to track because you have not added an account yet.</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>Create an account first, then add holdings to see your dashboard come alive.</Text>
            <Pressable style={[styles.emptyPrimaryBtn, { backgroundColor: colors.accent }]} onPress={() => router.push("/(tabs)/accounts" as never)}>
              <Text style={[styles.emptyPrimaryBtnText, { color: colors.bg }]}>Add Account</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.heroSection}>
          <Text style={[styles.heroLabel, { color: colors.muted }]}>Total Portfolio Value</Text>
          <Text style={[styles.heroValue, { color: colors.text }]}>{formatMoney(totals.currentValue, rc)}</Text>

          <View style={styles.heroStatsWrap}>
            <View style={styles.heroStatRow}>
              <Text style={[styles.heroStatKey, { color: colors.muted }]}>Invested</Text>
              <Text style={[styles.heroStatValue, { color: colors.text }]}>{formatMoney(totals.investedValue, rc)}</Text>
            </View>

            <View style={styles.heroStatRow}>
              <Text style={[styles.heroStatKey, { color: colors.muted }]}>Gain/Loss</Text>
              <Text style={[
                styles.heroStatGain,
                { color: totals.gainLoss >= 0 ? colors.positive : colors.negative },
              ]}>
                {totals.gainLoss >= 0 ? "+" : ""}
                {formatMoney(totals.gainLoss, rc)}
              </Text>
              <View style={[
                styles.gainBadge,
                { backgroundColor: totals.gainLoss >= 0 ? `${colors.positive}22` : `${colors.negative}22` },
              ]}>
                <Text style={[
                  styles.gainBadgeText,
                  { color: totals.gainLoss >= 0 ? colors.positive : colors.negative },
                ]}>
                  {totals.gainLossPct >= 0 ? "+" : ""}
                  {totals.gainLossPct.toFixed(2)}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Portfolio Performance Chart */}
        {accounts.length > 0 && (
          <View style={styles.chartSection}>
            <PortfolioPerformanceChart
              data={performanceData}
              currency={rc}
              view={performanceView}
              onViewChange={setPerformanceView}
            />
          </View>
        )}

        <View style={styles.sectionGap}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>Allocations</Text>

          {/* Compact allocation filter controls */}
          <View style={styles.allocationControls}>
            {/* Basis segmented control */}
            <View style={[styles.segmentedControl, { backgroundColor: colors.surface }]}>
              {([
                ["CURRENT_VALUE", "Current"],
                ["INVESTED_VALUE", "Invested"],
              ] as const).map(([basis, label]) => {
                const active = settings.allocationBasis === basis;
                return (
                  <Pressable
                    key={basis}
                    onPress={() => updateSettings({ allocationBasis: basis })}
                    style={[
                      styles.segmentedOption,
                      active && { backgroundColor: colors.accent },
                    ]}
                  >
                    <Text style={[
                      styles.segmentedText,
                      { color: active ? colors.bg : colors.muted },
                    ]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Include cash toggle */}
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: colors.muted }]}>Include cash</Text>
              <ToggleSwitch
                value={settings.allocationIncludeCash}
                onValueChange={(val) => updateSettings({ allocationIncludeCash: val })}
              />
            </View>
          </View>

          {/* Horizontal stacked allocation bar */}
          {allocationBarSegments.length > 0 && (
            <View style={styles.allocationBar}>
              {allocationBarSegments.map((segment) => (
                <View
                  key={segment.symbol}
                  style={[
                    styles.allocationBarSegment,
                    {
                      width: `${segment.pct}%`,
                      backgroundColor: segment.color,
                    },
                  ]}
                  accessibilityLabel={segment.tooltip}
                />
              ))}
            </View>
          )}

          {/* Holdings list */}
          <View style={styles.allocList}>
            {visibleAllocations.map((item) => {
              const tickerColor = getTickerColor(item.symbol);
              const gainPositive = item.gainLossPct >= 0;
              const displayValue = settings.allocationBasis === "INVESTED_VALUE" ? item.investedValue : item.currentValue;
              return (
                <View key={item.symbol} style={[styles.holdingRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.holdingLeft}>
                    <TickerImage symbol={item.symbol} size={28} fallbackColor={tickerColor} />
                    <View style={styles.holdingInfo}>
                      <View style={styles.holdingTickerRow}>
                        <Text style={[styles.holdingTicker, { color: colors.text }]}>{item.symbol}</Text>
                        <Text style={[styles.holdingAllocation, { color: colors.muted }]}>{item.allocationPct.toFixed(1)}%</Text>
                      </View>
                      <Text style={[styles.holdingName, { color: colors.muted }]} numberOfLines={1} ellipsizeMode="tail">
                        {item.companyName}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.holdingRight}>
                    <Text style={[styles.holdingValue, { color: colors.text }]}>
                      {formatMoney(displayValue, rc)}
                    </Text>
                    <Text style={[styles.holdingGain, { color: gainPositive ? colors.positive : colors.negative }]}>
                      {gainPositive ? "+" : ""}{item.gainLossPct.toFixed(2)}% · {gainPositive ? "+" : ""}{formatMoney(item.gainLoss, rc)}
                    </Text>
                  </View>
                </View>
              );
            })}

            {/* Cash row — shown when cash is included */}
            {cashAllocationPct > 0 && (expanded || rankedAllocations.length <= VISIBLE_POSITIONS) ? (
              <View style={[styles.holdingRow, { borderBottomColor: colors.border }]}>
                <View style={styles.holdingLeft}>
                  <View style={styles.cashDotContainer}>
                    <View style={[styles.holdingDot, { backgroundColor: CASH_COLOR }]} />
                  </View>
                  <View style={styles.holdingInfo}>
                    <View style={styles.holdingTickerRow}>
                      <Text style={[styles.holdingTicker, { color: colors.text }]}>CASH</Text>
                      <Text style={[styles.holdingAllocation, { color: colors.muted }]}>{cashAllocationPct.toFixed(1)}%</Text>
                    </View>
                    <Text style={[styles.holdingName, { color: colors.muted }]} numberOfLines={1}>
                      Cash &amp; Equivalents
                    </Text>
                  </View>
                </View>
                <View style={styles.holdingRight}>
                  <Text style={[styles.holdingValue, { color: colors.text }]}>
                    {formatMoney(cashValueRC, rc)}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Show more row */}
            {showMoreRow ? (
              <Pressable onPress={() => setExpanded(true)} style={styles.showMoreRow}>
                <Text style={[styles.showMoreText, { color: colors.muted }]}>
                  {hiddenCount} more position{hiddenCount > 1 ? "s" : ""}
                </Text>
              </Pressable>
            ) : null}

            {/* Collapse row when expanded */}
            {expanded && rankedAllocations.length > VISIBLE_POSITIONS ? (
              <Pressable onPress={() => setExpanded(false)} style={styles.showMoreRow}>
                <Text style={[styles.showMoreText, { color: colors.muted }]}>
                  Show less
                </Text>
              </Pressable>
            ) : null}

            {rankedAllocations.length === 0 && cashAllocationPct === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No holdings yet</Text>
                <Text style={[styles.emptyBody, { color: colors.muted }]}>Your allocation is empty because no investments have been added.</Text>
                <Text style={[styles.emptyBody, { color: colors.muted }]}>Add your first holding to see allocation breakdown and risk insights.</Text>
                <Pressable style={[styles.emptyPrimaryBtn, { backgroundColor: colors.accent }]} onPress={() => router.push("/(tabs)/holdings" as never)}>
                  <Text style={[styles.emptyPrimaryBtnText, { color: colors.bg }]}>Add Holding</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
  },
  headerRow: {
    marginBottom: spacing.xxxl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  filterRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  filterPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  filterText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  heroSection: {
    marginBottom: spacing.xxxl,
  },
  heroLabel: {
    fontSize: typography.caption,
  },
  heroValue: {
    marginTop: spacing.xs,
    fontSize: 32,
    fontWeight: typography.weightSemibold,
    lineHeight: 36,
  },
  heroStatsWrap: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  heroStatRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.md,
  },
  heroStatKey: {
    width: 76,
    fontSize: typography.caption,
  },
  heroStatValue: {
    fontSize: typography.body,
  },
  heroStatGain: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  gainBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    marginLeft: spacing.xs,
  },
  gainBadgeText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  chartSection: {
    marginBottom: spacing.xxxl,
  },
  sectionGap: {
    marginBottom: spacing.xxxl,
  },
  sectionLabel: {
    marginBottom: spacing.md,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  // Compact allocation controls
  allocationControls: {
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: radii.md,
    padding: 2,
  },
  segmentedOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 1,
    borderRadius: radii.sm,
  },
  segmentedText: {
    fontSize: 11,
    fontWeight: typography.weightMedium,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  toggleLabel: {
    fontSize: 11,
  },
  toggleTrack: {
    width: 32,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  // Horizontal allocation bar
  allocationBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    flexDirection: "row",
    marginBottom: spacing.xl,
  },
  allocationBarSegment: {
    height: 6,
  },
  // Holdings list
  allocList: {
    gap: 0,
  },
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  holdingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  holdingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cashDotContainer: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  holdingInfo: {
    flex: 1,
  },
  holdingTickerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  holdingTicker: {
    fontSize: typography.body,
    fontWeight: typography.weightBold,
  },
  holdingAllocation: {
    fontSize: typography.micro,
  },
  holdingName: {
    fontSize: typography.micro,
    marginTop: 1,
  },
  holdingRight: {
    alignItems: "flex-end",
  },
  holdingValue: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    fontVariant: ["tabular-nums"],
  },
  holdingGain: {
    fontSize: typography.micro,
    marginTop: 1,
  },
  showMoreRow: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  showMoreText: {
    fontSize: typography.caption,
  },
  emptyCard: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  emptyBody: {
    marginTop: spacing.xs,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  emptyPrimaryBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyPrimaryBtnText: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
});

