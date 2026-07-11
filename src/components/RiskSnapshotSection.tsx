import { StyleSheet, Text, View } from "react-native";
import { DonutChart } from "./DonutChart";
import { colors, radii, spacing, typography } from "../theme";
import { formatMoney } from "../utils/format";
import type { Holding } from "../types/portfolio";

interface SectorRow {
  sector: string;
  value: number;
  pct: number;
}

interface SymbolAllocation {
  symbol: string;
  allocationPct: number;
}

type RiskLevel = "LOW" | "MODERATE" | "HIGH";

const SECTOR_COLORS = ["#67E8F9", "#22C55E", "#A78BFA", "#F97316", "#EC4899", "#3B82F6", "#F59E0B"];

const riskColor = (level: RiskLevel): string => {
  if (level === "HIGH") return colors.negative;
  if (level === "MODERATE") return "#F59E0B";
  return colors.positive;
};

const riskFromPct = (value: number, high: number, moderate: number): RiskLevel => {
  if (value >= high) return "HIGH";
  if (value >= moderate) return "MODERATE";
  return "LOW";
};

export function RiskSnapshotSection({
  holdings,
  allocations,
  top5Pct,
  top10Pct,
  largestPositionPct,
  cashPctPortfolio,
  sectorRows,
  rc,
}: {
  holdings: Holding[];
  allocations: SymbolAllocation[];
  top5Pct: number;
  top10Pct: number;
  largestPositionPct: number;
  cashPctPortfolio: number;
  sectorRows: SectorRow[];
  rc: "INR" | "USD";
}) {
  const top5Risk = riskFromPct(top5Pct, 55, 35);
  const top10Risk = riskFromPct(top10Pct, 75, 55);
  const largestRisk = riskFromPct(largestPositionPct, 20, 12);
  const cashRisk = riskFromPct(cashPctPortfolio, 35, 20);

  const topRisk: RiskLevel =
    [top5Risk, top10Risk, largestRisk].includes("HIGH")
      ? "HIGH"
      : [top5Risk, top10Risk, largestRisk].includes("MODERATE")
      ? "MODERATE"
      : "LOW";

  const sectorSlices = sectorRows.slice(0, 6).map((row, i) => ({ value: row.pct, color: SECTOR_COLORS[i % SECTOR_COLORS.length] }));

  return (
    <View style={styles.container}>
      <View style={styles.riskBanner}>
        <View style={[styles.riskDot, { backgroundColor: riskColor(topRisk) }]} />
        <View>
          <Text style={styles.riskTitle}>
            Concentration Risk: <Text style={{ color: riskColor(topRisk) }}>{topRisk}</Text>
          </Text>
          <Text style={styles.riskText}>Top-heavy portfolios are more volatile during market drawdowns.</Text>
        </View>
      </View>

      <View style={styles.metricGrid}>
        <MetricCard label="Top 5" value={`${top5Pct.toFixed(1)}%`} tone={top5Risk} />
        <MetricCard label="Top 10" value={`${top10Pct.toFixed(1)}%`} tone={top10Risk} />
        <MetricCard label="Largest" value={`${largestPositionPct.toFixed(1)}%`} tone={largestRisk} />
        <MetricCard label="Cash" value={`${cashPctPortfolio.toFixed(1)}%`} tone={cashRisk} />
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
    </View>
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
  container: {
    marginBottom: spacing.xxxl,
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
});

