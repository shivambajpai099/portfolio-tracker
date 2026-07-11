import { View, Text, StyleSheet } from "react-native";
import { colors as defaultColors, radii, spacing, typography } from "../theme";

interface InsightBadgeProps {
  type: "streak" | "pattern" | "preference" | "milestone" | "info";
  title: string;
  description: string;
  icon?: string;
}

const BADGE_COLORS: Record<InsightBadgeProps["type"], string> = {
  streak: defaultColors.positive,
  pattern: defaultColors.accent,
  preference: "#A78BFA", // Purple
  milestone: defaultColors.warning,
  info: defaultColors.muted,
};

const BADGE_ICONS: Record<InsightBadgeProps["type"], string> = {
  streak: "🔥",
  pattern: "📊",
  preference: "💡",
  milestone: "🏆",
  info: "ℹ️",
};

export function InsightBadge({ type, title, description, icon }: InsightBadgeProps) {
  const color = BADGE_COLORS[type];
  const defaultIcon = BADGE_ICONS[type];

  return (
    <View style={styles.badge}>
      <View style={[styles.iconWrap, { backgroundColor: `${color}20` }]}>
        <Text style={styles.icon}>{icon ?? defaultIcon}</Text>
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color }]}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
}

interface InsightListProps {
  insights: Array<{
    type: InsightBadgeProps["type"];
    title: string;
    description: string;
    icon?: string;
  }>;
  emptyMessage?: string;
}

export function InsightList({ insights, emptyMessage = "No insights available yet" }: InsightListProps) {
  if (insights.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {insights.map((insight, index) => (
        <InsightBadge key={`${insight.type}-${index}`} {...insight} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    backgroundColor: defaultColors.bg,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 18,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    marginBottom: 2,
  },
  description: {
    color: defaultColors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  list: {
    gap: spacing.sm,
  },
  emptyWrap: {
    padding: spacing.lg,
    alignItems: "center",
  },
  emptyText: {
    color: defaultColors.muted,
    fontSize: typography.caption,
    fontStyle: "italic",
  },
});


