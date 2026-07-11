import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DonutChart } from "../../src/components/DonutChart";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import {
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

export default function DashboardScreen() {
  const router = useRouter();
  const holdings = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const accounts = usePortfolioStore((s) => s.accounts);
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

  const allocationContextLabel = [
    settings.allocationBasis === "INVESTED_VALUE" ? "By invested value" : "By current value",
    settings.allocationIncludeCash ? "cash included" : "cash excluded",
  ].join(" · ");

  const cashAllocationPct = useMemo(() => {
    if (!settings.allocationIncludeCash || cashValueRC === 0) return 0;
    const symbolsTotal = rankedAllocations.reduce((sum, a) => sum + a.allocationPct, 0);
    return Math.max(0, 100 - symbolsTotal);
  }, [rankedAllocations, settings.allocationIncludeCash, cashValueRC]);

  const allocationDonutSlices = useMemo(() => {
    const slices = rankedAllocations.map((a, i) => ({
      value: a.allocationPct,
      color: DONUT_PALETTE[i % DONUT_PALETTE.length],
    }));
    if (cashAllocationPct > 0) {
      slices.push({ value: cashAllocationPct, color: CASH_COLOR });
    }
    return slices;
  }, [rankedAllocations, cashAllocationPct]);

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

        {accounts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No accounts yet</Text>
            <Text style={styles.emptyBody}>There is nothing to track because you have not added an account yet.</Text>
            <Text style={styles.emptyBody}>Create an account first, then add holdings to see your dashboard come alive.</Text>
            <Pressable style={styles.emptyPrimaryBtn} onPress={() => router.push("/(tabs)/accounts" as never)}>
              <Text style={styles.emptyPrimaryBtnText}>Add Account</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.heroSection}>
          <Text style={styles.heroLabel}>Total Portfolio Value</Text>
          <Text style={styles.heroValue}>{formatMoney(totals.currentValue, rc)}</Text>

          <View style={styles.heroStatsWrap}>
            <View style={styles.heroStatRow}>
              <Text style={styles.heroStatKey}>Invested</Text>
              <Text style={styles.heroStatValue}>{formatMoney(totals.investedValue, rc)}</Text>
            </View>

            <View style={styles.heroStatRow}>
              <Text style={styles.heroStatKey}>Gain/Loss</Text>
              <Text style={[
                styles.heroStatGain,
                totals.gainLoss >= 0 ? styles.positiveText : styles.negativeText,
              ]}>
                {totals.gainLoss >= 0 ? "+" : ""}
                {formatMoney(totals.gainLoss, rc)}
              </Text>
              <View style={[
                styles.gainBadge,
                totals.gainLoss >= 0 ? styles.gainBadgePositive : styles.gainBadgeNegative,
              ]}>
                <Text style={[
                  styles.gainBadgeText,
                  totals.gainLoss >= 0 ? styles.positiveText : styles.negativeText,
                ]}>
                  {totals.gainLossPct >= 0 ? "+" : ""}
                  {totals.gainLossPct.toFixed(2)}%
                </Text>
              </View>
            </View>
          </View>
        </View>

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

          <View style={styles.allocDonutWrap}>
            <DonutChart slices={allocationDonutSlices} size={160} strokeWidth={22} />
            <View style={styles.allocDonutCenter}>
              <Text style={styles.allocDonutCenterValue}>{rankedAllocations.length}</Text>
              <Text style={styles.allocDonutCenterLabel}>positions</Text>
            </View>
          </View>

          <View style={styles.allocList}>
            {rankedAllocations.map((item, i) => {
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
                    <Text style={styles.allocationRank}>{rankedAllocations.length + 1}</Text>
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
              </View>
            ) : null}

            {rankedAllocations.length === 0 && cashAllocationPct === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No holdings yet</Text>
                <Text style={styles.emptyBody}>Your allocation is empty because no investments have been added.</Text>
                <Text style={styles.emptyBody}>Add your first holding to see allocation breakdown and risk insights.</Text>
                <Pressable style={styles.emptyPrimaryBtn} onPress={() => router.push("/(tabs)/holdings" as never)}>
                  <Text style={styles.emptyPrimaryBtnText}>Add Holding</Text>
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
  heroSection: {
    marginBottom: spacing.xxxl,
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
    width: 76,
    color: colors.muted,
    fontSize: typography.caption,
  },
  heroStatValue: {
    color: colors.text,
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
  gainBadgePositive: {
    backgroundColor: `${colors.positive}22`,
  },
  gainBadgeNegative: {
    backgroundColor: `${colors.negative}22`,
  },
  gainBadgeText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
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
  emptyBody: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  emptyPrimaryBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyPrimaryBtnText: {
    color: colors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
});

