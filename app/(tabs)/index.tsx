import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DonutChart } from "../../src/components/DonutChart";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import {
  calcConcentrationRisk,
  calcGeographicSplit,
  calcPortfolioTotals,
  calcSymbolAllocations,
  convert,
} from "../../src/features/portfolio/calculations";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors, radii, spacing, typography } from "../../src/theme";
import type { Currency } from "../../src/types/portfolio";
import { formatMoney } from "../../src/utils/format";

type GeoFilter = "ALL" | "INDIA" | "US";

const DONUT_PALETTE = [
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
const GEO_INDIA_COLOR = "#F59E0B";
const GEO_US_COLOR = "#6366F1";

export default function DashboardScreen() {
  const holdings = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const fxRates = usePortfolioStore((s) => s.fxRates);
  const settings = usePortfolioStore((s) => s.settings);
  const updateSettings = usePortfolioStore((s) => s.updateSettings);

  const [geoFilter, setGeoFilter] = useState<GeoFilter>("ALL");

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
  const geoSplit = useMemo(() => calcGeographicSplit(holdings, fxRates, rc), [holdings, fxRates, rc]);
  const concentration = useMemo(() => calcConcentrationRisk(allocations), [allocations]);

  const cashValueRC = useMemo(
    () => filteredCashHoldings.reduce((sum, c) => sum + convert(c.balance, c.currency, rc, fxRates), 0),
    [filteredCashHoldings, rc, fxRates]
  );

  // The sum of symbol allocationPcts may be < 100 when cash is included in the denominator.
  // The remainder is the cash slice.
  const cashAllocationPct = useMemo(() => {
    if (!settings.allocationIncludeCash || cashValueRC === 0) return 0;
    const symbolsTotal = allocations.reduce((sum, a) => sum + a.allocationPct, 0);
    return Math.max(0, 100 - symbolsTotal);
  }, [allocations, settings.allocationIncludeCash, cashValueRC]);

  const allocationDonutSlices = useMemo(() => {
    const slices = allocations.map((a, i) => ({
      value: a.allocationPct,
      color: DONUT_PALETTE[i % DONUT_PALETTE.length],
    }));
    if (cashAllocationPct > 0) {
      slices.push({ value: cashAllocationPct, color: CASH_COLOR });
    }
    return slices;
  }, [allocations, cashAllocationPct]);

  // Hero donut — same slices (no cash, just position overview)
  const donutSlices = useMemo(
    () => allocations.map((a, i) => ({ value: a.allocationPct, color: DONUT_PALETTE[i % DONUT_PALETTE.length] })),
    [allocations]
  );

  const allocationContextLabel = [
    settings.allocationBasis === "INVESTED_VALUE" ? "By invested value" : "By current value",
    settings.allocationIncludeCash ? "cash included" : "cash excluded",
  ].join(" · ");

  const concentrationColor =
    concentration.level === "HIGH"
      ? colors.negative
      : concentration.level === "MODERATE"
      ? GEO_INDIA_COLOR
      : colors.positive;

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Portfolio</Text>
          <View style={styles.filterRow}>
            {(["ALL", "INDIA", "US"] as GeoFilter[]).map((f) => {
              const active = geoFilter === f;
              return (
                <Pressable key={f} onPress={() => setGeoFilter(f)} style={[styles.filterPill, active && styles.filterPillActive]}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{f}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.heroRow}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroLabel}>Total value</Text>
            <Text style={styles.heroValue}>{formatMoney(totals.currentValue, rc)}</Text>
            <View style={styles.heroStatsWrap}>
              <View style={styles.heroStatRow}>
                <Text style={styles.heroStatKey}>Invested</Text>
                <Text style={styles.heroStatValue}>{formatMoney(totals.investedValue, rc)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.donutWrap}>
            <DonutChart slices={donutSlices} size={108} strokeWidth={14} />
            <View style={styles.donutCenter}>
              <Text style={styles.donutCenterLabel}>pos</Text>
              <Text style={styles.donutCenterValue}>{concentration.symbolCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionGap}>
          <Text style={styles.sectionLabel}>Geographic Split</Text>
          <View style={styles.geoRow}>
            <View style={styles.geoLeft}>
              <View style={[styles.dot, { backgroundColor: GEO_INDIA_COLOR }]} />
              <Text style={styles.geoName}>India</Text>
            </View>
            <View style={styles.geoRight}>
              <Text style={styles.geoPct}>{geoSplit.indiaValuePct.toFixed(1)}%</Text>
              <Text style={styles.geoValue}>{formatMoney(geoSplit.indiaCurrentValue, rc)}</Text>
            </View>
          </View>
          <View style={styles.geoRowBottom}>
            <View style={styles.geoLeft}>
              <View style={[styles.dot, { backgroundColor: GEO_US_COLOR }]} />
              <Text style={styles.geoName}>United States</Text>
            </View>
            <View style={styles.geoRight}>
              <Text style={styles.geoPct}>{geoSplit.usValuePct.toFixed(1)}%</Text>
              <Text style={styles.geoValue}>{formatMoney(geoSplit.usCurrentValue, rc)}</Text>
            </View>
          </View>
          <View style={styles.geoBarTrack}>
            <View style={[styles.geoBarFill, { width: `${geoSplit.indiaValuePct}%`, backgroundColor: GEO_INDIA_COLOR }]} />
          </View>
        </View>

        {concentration.level !== "LOW" ? (
          <View style={styles.warningRow}>
            <View style={[styles.warningIndicator, { backgroundColor: concentrationColor }]} />
            <View style={styles.warningContent}>
              <Text style={[styles.warningTitle, { color: concentrationColor }]}>
                {concentration.level === "HIGH" ? "High" : "Moderate"} concentration
              </Text>
              <Text style={styles.warningText}>
                Largest position {concentration.topHoldingPct.toFixed(1)}% · Top 5 positions {concentration.top5Pct.toFixed(1)}%
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionGap}>
          <Text style={styles.sectionLabel}>Allocations</Text>
          <Text style={styles.allocationContext}>{allocationContextLabel}</Text>

          <View style={styles.filterRowWrap}>
            {([
              ["CURRENT_VALUE", "Current %"],
              ["INVESTED_VALUE", "Invested %"],
            ] as const).map(([basis, label]) => {
              const active = settings.allocationBasis === basis;
              return (
                <Pressable
                  key={basis}
                  onPress={() => updateSettings({ allocationBasis: basis })}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
            {([
              [true, "Include Cash"],
              [false, "Exclude Cash"],
            ] as const).map(([include, label]) => {
              const active = settings.allocationIncludeCash === include;
              return (
                <Pressable
                  key={label}
                  onPress={() => updateSettings({ allocationIncludeCash: include })}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Allocation donut */}
          <View style={styles.allocDonutWrap}>
            <DonutChart slices={allocationDonutSlices} size={160} strokeWidth={22} />
            <View style={styles.allocDonutCenter}>
              <Text style={styles.allocDonutCenterValue}>{allocations.length}</Text>
              <Text style={styles.allocDonutCenterLabel}>positions</Text>
            </View>
          </View>

          {/* Ranked list */}
          <View style={styles.allocList}>
            {allocations.map((item, i) => {
              const barColor = DONUT_PALETTE[i % DONUT_PALETTE.length];
              const displayValue = settings.allocationBasis === "INVESTED_VALUE" ? item.investedValue : item.currentValue;
              const secondaryLabel = settings.allocationBasis === "INVESTED_VALUE" ? "Current" : "Invested";
              const secondaryValue = settings.allocationBasis === "INVESTED_VALUE" ? item.currentValue : item.investedValue;
              return (
                <View key={item.symbol} style={styles.allocationItem}>
                  <View style={styles.allocationHeader}>
                    <View style={styles.allocationTitleWrap}>
                      <Text style={styles.allocationRank}>{i + 1}</Text>
                      <View style={[styles.allocationDot, { backgroundColor: barColor }]} />
                      <View>
                        <Text style={styles.allocationSymbol}>{item.symbol}</Text>
                        <Text style={styles.allocationName}>{item.companyName}</Text>
                      </View>
                    </View>
                    <View style={styles.allocationRight}>
                      <Text style={styles.allocationPct}>{item.allocationPct.toFixed(1)}%</Text>
                      <Text style={styles.allocationValue}>{formatMoney(displayValue, rc)}</Text>
                    </View>
                  </View>

                  <View style={styles.allocationTrack}>
                    <View style={[styles.allocationFill, { width: `${Math.min(item.allocationPct, 100)}%`, backgroundColor: barColor }]} />
                  </View>

                  <View style={styles.allocationFooter}>
                    <Text style={styles.allocationGainLabel}>{secondaryLabel} {formatMoney(secondaryValue, rc)}</Text>
                    <Text style={styles.allocationGainLabel}>Gain / Loss {formatMoney(item.gainLoss, rc)}</Text>
                  </View>
                  <View style={styles.allocationFooter}>
                    <Text style={styles.allocationGainLabel}>Gain / Loss %</Text>
                    <Text style={[styles.allocationGain, item.gainLossPct >= 0 ? styles.positiveText : styles.negativeText]}>
                      {item.gainLossPct >= 0 ? "+" : ""}{item.gainLossPct.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              );
            })}

            {/* Cash row — shown when cash is included */}
            {cashAllocationPct > 0 ? (
              <View style={styles.allocationItem}>
                <View style={styles.allocationHeader}>
                  <View style={styles.allocationTitleWrap}>
                    <Text style={styles.allocationRank}>{allocations.length + 1}</Text>
                    <View style={[styles.allocationDot, { backgroundColor: CASH_COLOR }]} />
                    <View>
                      <Text style={styles.allocationSymbol}>CASH</Text>
                      <Text style={styles.allocationName}>Cash &amp; Equivalents</Text>
                    </View>
                  </View>
                  <View style={styles.allocationRight}>
                    <Text style={styles.allocationPct}>{cashAllocationPct.toFixed(1)}%</Text>
                    <Text style={styles.allocationValue}>{formatMoney(cashValueRC, rc)}</Text>
                  </View>
                </View>
                <View style={styles.allocationTrack}>
                  <View style={[styles.allocationFill, { width: `${Math.min(cashAllocationPct, 100)}%`, backgroundColor: CASH_COLOR }]} />
                </View>
              </View>
            ) : null}

            {allocations.length === 0 && cashAllocationPct === 0 ? (
              <Text style={styles.emptyText}>Add holdings to see your allocation.</Text>
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
    color: colors.text,
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
    backgroundColor: colors.surface,
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
  heroRow: {
    marginBottom: spacing.xxxl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroLeft: {
    flex: 1,
    paddingRight: spacing.xxxl,
  },
  heroLabel: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  heroValue: {
    marginTop: spacing.xs,
    color: colors.text,
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
    width: 64,
    color: colors.muted,
    fontSize: typography.caption,
  },
  heroStatValue: {
    color: colors.text,
    fontSize: typography.body,
  },
  heroStatGain: {
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
  heroGainPercent: {
    fontWeight: typography.weightRegular,
    opacity: 0.7,
    color: colors.text,
  },
  donutWrap: {
    position: "relative",
  },
  donutCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenterLabel: {
    color: colors.muted,
    fontSize: typography.micro,
  },
  donutCenterValue: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  sectionGap: {
    marginBottom: spacing.xxxl,
  },
  sectionLabel: {
    marginBottom: spacing.xs,
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  allocationContext: {
    marginBottom: spacing.md,
    color: colors.muted,
    fontSize: typography.caption,
  },
  filterRowWrap: {
    marginBottom: spacing.xl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  allocDonutWrap: {
    alignSelf: "center",
    marginBottom: spacing.xxxl,
    position: "relative",
  },
  allocDonutCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  allocDonutCenterValue: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  allocDonutCenterLabel: {
    color: colors.muted,
    fontSize: typography.micro,
  },
  allocList: {
    gap: 0,
  },
  geoRow: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  geoRowBottom: {
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  geoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
  geoName: {
    color: colors.text,
    fontSize: typography.body,
  },
  geoRight: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  geoPct: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
  geoValue: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  geoBarTrack: {
    height: 4,
    width: "100%",
    overflow: "hidden",
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  geoBarFill: {
    height: "100%",
  },
  warningRow: {
    marginBottom: spacing.xxxl,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  warningIndicator: {
    marginTop: 2,
    width: 2,
    alignSelf: "stretch",
    borderRadius: radii.sm,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
  warningText: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typography.caption,
  },
  allocationItem: {
    marginBottom: spacing.xl,
  },
  allocationHeader: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  allocationTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    paddingRight: spacing.lg,
  },
  allocationRank: {
    width: 18,
    color: colors.muted,
    fontSize: typography.micro,
    textAlign: "right",
  },
  allocationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  allocationSymbol: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  allocationName: {
    color: colors.muted,
    fontSize: typography.micro,
    marginTop: 1,
  },
  allocationRight: {
    alignItems: "flex-end",
  },
  allocationPct: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  allocationValue: {
    color: colors.muted,
    fontSize: typography.micro,
    marginTop: 1,
  },
  allocationTrack: {
    marginBottom: spacing.xs,
    height: 4,
    width: "100%",
    overflow: "hidden",
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  allocationFill: {
    height: "100%",
    borderRadius: radii.pill,
  },
  allocationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  allocationGainLabel: {
    color: colors.muted,
    fontSize: typography.micro,
  },
  allocationGain: {
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  positiveText: {
    color: colors.positive,
  },
  negativeText: {
    color: colors.negative,
  },
  emptyText: {
    color: colors.muted,
    fontSize: typography.body,
  },
});

