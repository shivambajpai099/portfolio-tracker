import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DonutChart } from "../../src/components/DonutChart";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import {
  calcConcentrationRisk,
  calcGeographicSplit,
  calcPortfolioTotals,
  calcSymbolAllocations,
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

const GEO_INDIA_COLOR = "#F59E0B";
const GEO_US_COLOR = "#6366F1";

export default function DashboardScreen() {
  const holdings = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const fxRates = usePortfolioStore((s) => s.fxRates);
  const settings = usePortfolioStore((s) => s.settings);

  const [geoFilter, setGeoFilter] = useState<GeoFilter>("ALL");

  const rc: Currency = settings.reportingCurrency;

  const filteredHoldings = useMemo(() => {
    if (geoFilter === "ALL") return holdings;
    return holdings.filter((h) => {
      const isIndia = h.currency === "INR" || h.symbol.endsWith(".NS") || h.symbol.endsWith(".BO");
      return geoFilter === "INDIA" ? isIndia : !isIndia;
    });
  }, [holdings, geoFilter]);

  const totals = useMemo(
    () => calcPortfolioTotals(filteredHoldings, cashHoldings, fxRates, rc),
    [filteredHoldings, cashHoldings, fxRates, rc]
  );
  const allocations = useMemo(
    () => calcSymbolAllocations(filteredHoldings, fxRates, rc),
    [filteredHoldings, fxRates, rc]
  );
  const geoSplit = useMemo(() => calcGeographicSplit(holdings, fxRates, rc), [holdings, fxRates, rc]);
  const concentration = useMemo(() => calcConcentrationRisk(allocations), [allocations]);

  const donutSlices = useMemo(
    () => allocations.map((a, i) => ({ value: a.allocationPct, color: DONUT_PALETTE[i % DONUT_PALETTE.length] })),
    [allocations]
  );

  const gainPositive = totals.gainLoss >= 0;

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
              <View style={styles.heroStatRow}>
                <Text style={styles.heroStatKey}>Gain/Loss</Text>
                <Text style={[styles.heroStatGain, gainPositive ? styles.positiveText : styles.negativeText]}>
                  {gainPositive ? "+" : ""}
                  {formatMoney(totals.gainLoss, rc)}
                  <Text style={styles.heroGainPercent}> {gainPositive ? "+" : ""}{totals.gainLossPct.toFixed(2)}%</Text>
                </Text>
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

        <Text style={styles.sectionLabel}>Allocations</Text>
        <View>
          {allocations.map((item, i) => {
            const barColor = DONUT_PALETTE[i % DONUT_PALETTE.length];
            const pctGain = item.gainLossPct;
            return (
              <View key={item.symbol} style={styles.allocationItem}>
                <View style={styles.allocationHeader}>
                  <View style={styles.allocationTitleWrap}>
                    <Text style={styles.allocationSymbol}>{item.symbol}</Text>
                    <Text style={styles.allocationName}>{item.companyName}</Text>
                  </View>
                  <Text style={styles.allocationPct}>{item.allocationPct.toFixed(1)}%</Text>
                </View>

                <View style={styles.allocationTrack}>
                  <View style={[styles.allocationFill, { width: `${item.allocationPct}%`, backgroundColor: barColor }]} />
                </View>

                <View style={styles.allocationFooter}>
                  <Text style={styles.allocationValue}>{formatMoney(item.currentValue, rc)}</Text>
                  <Text style={[styles.allocationGain, pctGain >= 0 ? styles.positiveText : styles.negativeText]}>
                    {pctGain >= 0 ? "+" : ""}
                    {pctGain.toFixed(2)}%
                  </Text>
                </View>
              </View>
            );
          })}

          {allocations.length === 0 ? <Text style={styles.emptyText}>Add holdings to see your allocation.</Text> : null}
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
    marginBottom: spacing.lg,
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    letterSpacing: 1,
    textTransform: "uppercase",
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
    marginBottom: spacing.xxl,
  },
  allocationHeader: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  allocationTitleWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  allocationSymbol: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  allocationName: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  allocationPct: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  allocationTrack: {
    marginBottom: spacing.sm,
    height: 6,
    width: "100%",
    overflow: "hidden",
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  allocationFill: {
    height: "100%",
  },
  allocationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  allocationValue: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  allocationGain: {
    fontSize: typography.caption,
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

