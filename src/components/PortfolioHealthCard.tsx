import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ConcentrationRisk, GeographicSplit, SymbolAllocation } from "../features/portfolio/calculations";
import { colors, radii, spacing, typography } from "../theme";

// ─── Colour palette ──────────────────────────────────────────────────────────

type HealthLevel = "green" | "yellow" | "red";

const LEVEL_COLOR: Record<HealthLevel, string> = {
  green: colors.positive,        // #22C55E
  yellow: "#F59E0B",             // amber – already used in dashboard
  red: colors.negative,          // #EF4444
};

// ─── Insight builder ─────────────────────────────────────────────────────────

interface Insight {
  text: string;
  level: HealthLevel;
}

function buildInsights(
  concentration: ConcentrationRisk,
  topHolding: SymbolAllocation | null,
  cashAllocationPct: number,
  geoSplit: GeographicSplit,
  allocationIncludeCash: boolean,
): Insight[] {
  const insights: Insight[] = [];

  // 1 – Largest position
  if (topHolding && concentration.topHoldingPct > 0) {
    const pct = concentration.topHoldingPct;
    const level: HealthLevel = pct > 25 ? "red" : pct > 15 ? "yellow" : "green";
    insights.push({
      text: `Your largest position (${topHolding.symbol}) represents ${pct.toFixed(1)}% of your portfolio.`,
      level,
    });
  }

  // 2 – Top 5 concentration
  if (concentration.symbolCount >= 2) {
    const pct = concentration.top5Pct;
    const count = Math.min(5, concentration.symbolCount);
    const level: HealthLevel = pct > 55 ? "red" : pct > 35 ? "yellow" : "green";
    insights.push({
      text: `Top ${count} holdings account for ${pct.toFixed(0)}% of your portfolio.`,
      level,
    });
  }

  // 3 – Number of positions
  const count = concentration.symbolCount;
  if (count > 0) {
    const level: HealthLevel = count >= 10 ? "green" : count >= 5 ? "yellow" : "red";
    insights.push({
      text: `You hold ${count} position${count !== 1 ? "s" : ""}.`,
      level,
    });
  }

  // 4 – Cash allocation
  if (allocationIncludeCash && cashAllocationPct > 0) {
    const pct = cashAllocationPct;
    const level: HealthLevel = pct > 35 ? "red" : pct > 20 || pct < 5 ? "yellow" : "green";
    insights.push({
      text: `Cash represents ${pct.toFixed(0)}% of portfolio value.`,
      level,
    });
  }

  // 5 – India vs US split
  const { indiaValuePct, usValuePct } = geoSplit;
  const geoTotal = indiaValuePct + usValuePct;
  if (geoTotal > 0) {
    const dominantName = indiaValuePct >= usValuePct ? "India" : "US";
    const dominantPct = Math.max(indiaValuePct, usValuePct);
    const otherName = indiaValuePct >= usValuePct ? "US" : "India";
    const otherPct = Math.min(indiaValuePct, usValuePct);
    const level: HealthLevel = dominantPct > 90 ? "yellow" : "green";
    insights.push({
      text: `${dominantName} ${dominantPct.toFixed(0)}% · ${otherName} ${otherPct.toFixed(0)}% of equity holdings.`,
      level,
    });
  }

  return insights;
}

// ─── Overall level ────────────────────────────────────────────────────────────

function overallLevel(insights: Insight[]): HealthLevel {
  if (insights.some((i) => i.level === "red")) return "red";
  if (insights.some((i) => i.level === "yellow")) return "yellow";
  return "green";
}

const OVERALL_LABEL: Record<HealthLevel, string> = {
  green: "Healthy",
  yellow: "Moderate",
  red: "Needs attention",
};

// ─── Component ───────────────────────────────────────────────────────────────

export interface PortfolioHealthCardProps {
  concentration: ConcentrationRisk;
  /** Top holding by allocation — pass rankedAllocations[0] or null */
  topHolding: SymbolAllocation | null;
  /** Cash as % of total portfolio (0 when cash excluded) */
  cashAllocationPct: number;
  geoSplit: GeographicSplit;
  allocationIncludeCash: boolean;
}

export function PortfolioHealthCard({
  concentration,
  topHolding,
  cashAllocationPct,
  geoSplit,
  allocationIncludeCash,
}: PortfolioHealthCardProps) {
  if (concentration.symbolCount === 0) return null;

  const insights = buildInsights(
    concentration,
    topHolding,
    cashAllocationPct,
    geoSplit,
    allocationIncludeCash,
  );

  const level = overallLevel(insights);
  const levelColor = LEVEL_COLOR[level];

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.header}>
        <Text style={styles.title}>Portfolio Health</Text>
        <View style={[styles.badge, { backgroundColor: levelColor + "22" }]}>
          <View style={[styles.badgeDot, { backgroundColor: levelColor }]} />
          <Text style={[styles.badgeLabel, { color: levelColor }]}>{OVERALL_LABEL[level]}</Text>
        </View>
      </View>

      {/* Insight rows */}
      <View style={styles.insightList}>
        {insights.map((insight, i) => (
          <View key={i} style={styles.insightRow}>
            <View style={[styles.insightIndicator, { backgroundColor: LEVEL_COLOR[insight.level] }]} />
            <Text style={styles.insightText}>{insight.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xxxl,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeLabel: {
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  insightList: {
    gap: spacing.sm,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  insightIndicator: {
    marginTop: 4,
    width: 3,
    height: 3,
    borderRadius: 2,
    flexShrink: 0,
  },
  insightText: {
    flex: 1,
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
});

