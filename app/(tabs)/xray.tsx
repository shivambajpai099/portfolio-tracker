import { useMemo } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DonutChart } from "../../src/components/DonutChart";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { calcSymbolAllocations, convert, holdingMarketValue } from "../../src/features/portfolio/calculations";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors, radii, spacing, typography } from "../../src/theme";
import type { Holding } from "../../src/types/portfolio";
import { formatMoney } from "../../src/utils/format";

const INDIA_COLOR = "#F59E0B";
const US_COLOR = "#6366F1";
const CASH_COLOR = "#374151";
const SECTOR_COLORS = ["#67E8F9", "#22C55E", "#A78BFA", "#F97316", "#EC4899", "#3B82F6", "#F59E0B"];

type RiskLevel = "LOW" | "MODERATE" | "HIGH";

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

const riskFromPct = (value: number, high: number, moderate: number): RiskLevel => {
  if (value >= high) return "HIGH";
  if (value >= moderate) return "MODERATE";
  return "LOW";
};

const riskColor = (level: RiskLevel): string => {
  if (level === "HIGH") return colors.negative;
  if (level === "MODERATE") return "#F59E0B";
  return colors.positive;
};

export default function PortfolioXRayScreen() {
  const router = useRouter();
  const holdings = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const fxRates = usePortfolioStore((s) => s.fxRates);
  const settings = usePortfolioStore((s) => s.settings);

  const rc = settings.reportingCurrency;

  const allocations = useMemo(() => {
    const items = calcSymbolAllocations(
      holdings,
      cashHoldings,
      fxRates,
      rc,
      settings.allocationBasis,
      settings.allocationIncludeCash
    );
    return [...items].sort((a, b) => b.allocationPct - a.allocationPct);
  }, [holdings, cashHoldings, fxRates, rc, settings.allocationBasis, settings.allocationIncludeCash]);

  const cashValue = useMemo(
    () => cashHoldings.reduce((sum, cash) => sum + convert(cash.balance, cash.currency, rc, fxRates), 0),
    [cashHoldings, rc, fxRates]
  );

  const country = useMemo(() => {
    let indiaValue = 0;
    let usValue = 0;

    for (const holding of holdings) {
      const value = convert(holdingMarketValue(holding), holding.currency, rc, fxRates);
      if (isIndiaHolding(holding)) indiaValue += value;
      else usValue += value;
    }

    const equitiesTotal = indiaValue + usValue;
    const portfolioTotal = equitiesTotal + cashValue;

    return {
      indiaValue,
      usValue,
      equitiesTotal,
      portfolioTotal,
      indiaPctEquity: equitiesTotal > 0 ? (indiaValue / equitiesTotal) * 100 : 0,
      usPctEquity: equitiesTotal > 0 ? (usValue / equitiesTotal) * 100 : 0,
      indiaPctPortfolio: portfolioTotal > 0 ? (indiaValue / portfolioTotal) * 100 : 0,
      usPctPortfolio: portfolioTotal > 0 ? (usValue / portfolioTotal) * 100 : 0,
      cashPctPortfolio: portfolioTotal > 0 ? (cashValue / portfolioTotal) * 100 : 0,
    };
  }, [holdings, rc, fxRates, cashValue]);

  const sectorRows = useMemo(() => {
    const map = new Map<string, number>();

    for (const holding of holdings) {
      const sector = inferSector(holding);
      const value = convert(holdingMarketValue(holding), holding.currency, rc, fxRates);
      map.set(sector, (map.get(sector) ?? 0) + value);
    }

    const total = [...map.values()].reduce((sum, v) => sum + v, 0);

    return [...map.entries()]
      .map(([sector, value]) => ({
        sector,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [holdings, rc, fxRates]);

  const top5Pct = useMemo(
    () => allocations.slice(0, 5).reduce((sum, item) => sum + item.allocationPct, 0),
    [allocations]
  );
  const top10Pct = useMemo(
    () => allocations.slice(0, 10).reduce((sum, item) => sum + item.allocationPct, 0),
    [allocations]
  );
  const largestPositionPct = allocations[0]?.allocationPct ?? 0;

  const technologyPct = useMemo(
    () => sectorRows.find((row) => row.sector === "Technology")?.pct ?? 0,
    [sectorRows]
  );

  const usTargetDiff = useMemo(() => {
    const target = settings.targetAllocation?.usPct;
    if (typeof target !== "number") return null;
    return country.usPctPortfolio - target;
  }, [settings.targetAllocation?.usPct, country.usPctPortfolio]);

  const top5Risk = riskFromPct(top5Pct, 55, 35);
  const top10Risk = riskFromPct(top10Pct, 75, 55);
  const largestRisk = riskFromPct(largestPositionPct, 20, 12);

  const topRisk: RiskLevel =
    [top5Risk, top10Risk, largestRisk].includes("HIGH")
      ? "HIGH"
      : [top5Risk, top10Risk, largestRisk].includes("MODERATE")
      ? "MODERATE"
      : "LOW";

  const countrySlices = [
    { value: country.indiaPctEquity, color: INDIA_COLOR },
    { value: country.usPctEquity, color: US_COLOR },
  ];
  const sectorSlices = sectorRows.slice(0, 6).map((row, i) => ({ value: row.pct, color: SECTOR_COLORS[i % SECTOR_COLORS.length] }));

  const insights = [
    `Top 5 holdings represent ${top5Pct.toFixed(1)}% of portfolio.`,
    `Top 10 holdings represent ${top10Pct.toFixed(1)}% of portfolio.`,
    `Largest position is ${largestPositionPct.toFixed(1)}% of portfolio.`,
    `Technology exposure is ${technologyPct.toFixed(1)}%.`,
    usTargetDiff === null
      ? "Set target allocation to compare US exposure against your target."
      : usTargetDiff > 1
      ? `US exposure exceeds target by ${usTargetDiff.toFixed(1)}%.`
      : usTargetDiff < -1
      ? `US exposure is ${(Math.abs(usTargetDiff)).toFixed(1)}% below target.`
      : "US exposure is near target.",
  ];

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Portfolio X-Ray</Text>
        <Text style={styles.subtitle}>Risk snapshot across concentration, geography, sector mix, and cash.</Text>

        {holdings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No holdings to analyze yet</Text>
            <Text style={styles.emptyText}>X-Ray insights are missing because there are no holdings in your portfolio.</Text>
            <Text style={styles.emptyText}>Add your first holding to see concentration, geography, and sector analysis.</Text>
            <Pressable style={styles.emptyPrimaryBtn} onPress={() => router.push("/(tabs)/holdings" as never)}>
              <Text style={styles.emptyPrimaryBtnText}>Add Holding</Text>
            </Pressable>
          </View>
        ) : null}

        {holdings.length === 0 ? null : (
          <>

        <View style={styles.riskBanner}>
          <View style={[styles.riskDot, { backgroundColor: riskColor(topRisk) }]} />
          <View>
            <Text style={styles.riskTitle}>Concentration Risk: <Text style={{ color: riskColor(topRisk) }}>{topRisk}</Text></Text>
            <Text style={styles.riskText}>Top-heavy portfolios are more volatile during market drawdowns.</Text>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <MetricCard label="Top 5" value={`${top5Pct.toFixed(1)}%`} tone={top5Risk} />
          <MetricCard label="Top 10" value={`${top10Pct.toFixed(1)}%`} tone={top10Risk} />
          <MetricCard label="Largest" value={`${largestPositionPct.toFixed(1)}%`} tone={largestRisk} />
          <MetricCard label="Cash" value={`${country.cashPctPortfolio.toFixed(1)}%`} tone={riskFromPct(country.cashPctPortfolio, 35, 20)} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Country Allocation</Text>
          <View style={styles.chartRow}>
            <DonutChart slices={countrySlices} size={144} strokeWidth={20} />
            <View style={styles.chartLegend}>
              <LegendRow label="India" pct={country.indiaPctEquity} value={country.indiaValue} color={INDIA_COLOR} rc={rc} />
              <LegendRow label="US" pct={country.usPctEquity} value={country.usValue} color={US_COLOR} rc={rc} />
              <LegendRow label="Cash" pct={country.cashPctPortfolio} value={cashValue} color={CASH_COLOR} rc={rc} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sector Allocation</Text>
          <View style={styles.chartRow}>
            <DonutChart slices={sectorSlices} size={144} strokeWidth={20} />
            <View style={styles.chartLegend}>
              {sectorRows.slice(0, 6).map((row, i) => (
                <LegendRow
                  key={row.sector}
                  label={row.sector}
                  pct={row.pct}
                  value={row.value}
                  color={SECTOR_COLORS[i % SECTOR_COLORS.length]}
                  rc={rc}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Insights</Text>
          <View style={styles.insightCard}>
            {insights.map((insight) => (
              <View key={insight} style={styles.insightRow}>
                <View style={styles.insightDot} />
                <Text style={styles.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: RiskLevel }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={[styles.metricTone, { color: riskColor(tone) }]}>{tone}</Text>
    </View>
  );
}

function LegendRow({
  label,
  pct,
  value,
  color,
  rc,
}: {
  label: string;
  pct: number;
  value: number;
  color: string;
  rc: "INR" | "USD";
}) {
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendLeft}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text style={styles.legendLabel}>{label}</Text>
      </View>
      <View style={styles.legendRight}>
        <Text style={styles.legendPct}>{pct.toFixed(1)}%</Text>
        <Text style={styles.legendValue}>{formatMoney(value, rc)}</Text>
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
    marginBottom: spacing.xxl,
    color: colors.muted,
    fontSize: typography.caption,
  },
  emptyCard: {
    marginBottom: spacing.xxxl,
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
  riskBanner: {
    marginBottom: spacing.xxl,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  riskDot: {
    marginTop: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  riskTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  riskText: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typography.caption,
  },
  metricGrid: {
    marginBottom: spacing.xxxl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metricCard: {
    width: "48%",
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  metricTone: {
    marginTop: spacing.xs,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  section: {
    marginBottom: spacing.xxxl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: colors.muted,
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: typography.weightMedium,
  },
  chartRow: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  chartLegend: {
    flex: 1,
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  legendLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: colors.text,
    fontSize: typography.caption,
  },
  legendRight: {
    alignItems: "flex-end",
  },
  legendPct: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  legendValue: {
    color: colors.muted,
    fontSize: typography.micro,
    marginTop: 1,
  },
  insightCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  insightDot: {
    marginTop: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  insightText: {
    flex: 1,
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
});

