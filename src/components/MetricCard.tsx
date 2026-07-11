import { View, Text, StyleSheet } from "react-native";
import { colors as defaultColors, radii, spacing, typography } from "../theme";

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  compact?: boolean;
}

export function MetricCard({ label, value, subtitle, trend, trendValue, compact = false }: MetricCardProps) {
  const trendColor = trend === "up" ? defaultColors.positive : trend === "down" ? defaultColors.negative : defaultColors.muted;

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, compact && styles.valueCompact]}>{value}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {trend && trendValue && (
        <View style={styles.trendRow}>
          <Text style={[styles.trendIcon, { color: trendColor }]}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          </Text>
          <Text style={[styles.trendValue, { color: trendColor }]}>{trendValue}</Text>
        </View>
      )}
    </View>
  );
}

interface MetricGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
}

export function MetricGrid({ children, columns = 2 }: MetricGridProps) {
  return (
    <View style={[styles.grid, { gap: spacing.sm }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: defaultColors.bg,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  cardCompact: {
    padding: spacing.sm,
  },
  label: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    marginBottom: spacing.xs,
  },
  value: {
    color: defaultColors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  valueCompact: {
    fontSize: typography.body,
  },
  subtitle: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    marginTop: 2,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
    gap: 4,
  },
  trendIcon: {
    fontSize: typography.caption,
    fontWeight: typography.weightBold,
  },
  trendValue: {
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});


