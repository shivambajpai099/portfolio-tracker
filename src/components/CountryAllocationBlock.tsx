import { StyleSheet, Text, View } from "react-native";
import { DonutChart } from "./DonutChart";
import { spacing, typography } from "../theme";
import { spec } from "../theme/specTokens";
import { formatMoney } from "../utils/format";

const INDIA_COLOR = "#f97316";
const US_COLOR = "#6366f1";
const CASH_COLOR = "#374151";

export function CountryAllocationBlock({
  indiaValue,
  usValue,
  cashValue,
  indiaPctEquity,
  usPctEquity,
  cashPctPortfolio,
  rc,
}: {
  indiaValue: number;
  usValue: number;
  cashValue: number;
  indiaPctEquity: number;
  usPctEquity: number;
  cashPctPortfolio: number;
  rc: "INR" | "USD";
}) {
  const countrySlices = [
    { value: indiaPctEquity, color: INDIA_COLOR },
    { value: usPctEquity, color: US_COLOR },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Country Allocation</Text>
      <View style={styles.chartRow}>
        <DonutChart slices={countrySlices} size={144} strokeWidth={20} />
        <View style={styles.chartLegend}>
          <LegendRow label="India" pct={indiaPctEquity} value={indiaValue} color={INDIA_COLOR} rc={rc} />
          <LegendRow label="US" pct={usPctEquity} value={usValue} color={US_COLOR} rc={rc} />
          <LegendRow label="Cash" pct={cashPctPortfolio} value={cashValue} color={CASH_COLOR} rc={rc} />
        </View>
      </View>
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
  container: {
    marginBottom: spacing.xxxl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: spec.MUTED,
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: typography.weightMedium,
  },
  chartRow: {
    borderRadius: 16,
    backgroundColor: spec.CARD,
    borderWidth: 1,
    borderColor: spec.BDR,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
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
    color: spec.SUB,
    fontSize: typography.caption,
  },
  legendRight: {
    alignItems: "flex-end",
  },
  legendPct: {
    color: "#F2F4F8",
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  legendValue: {
    color: spec.MUTED,
    fontSize: typography.micro,
    marginTop: 1,
  },
});

