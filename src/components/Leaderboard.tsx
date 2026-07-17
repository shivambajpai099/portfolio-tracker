import { View, Text, StyleSheet } from "react-native";
import { colors as defaultColors, radii, spacing, typography } from "../theme";

interface LeaderboardItem {
  rank: number;
  label: string;
  subtitle?: string;
  value: string;
  secondaryValue?: string;
  positive?: boolean;
}

interface LeaderboardProps {
  title?: string;
  items: LeaderboardItem[];
  emptyMessage?: string;
}

export function Leaderboard({ title, items, emptyMessage = "No data available" }: LeaderboardProps) {
  if (items.length === 0) {
    return (
      <View style={styles.container}>
        {title && <Text style={styles.title}>{title}</Text>}
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      {items.map((item) => (
        <View key={`${item.rank}-${item.label}`} style={styles.row}>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{item.rank}</Text>
          </View>
          <View style={styles.labelWrap}>
            <Text style={styles.label}>{item.label}</Text>
            {item.subtitle && <Text style={styles.subtitle}>{item.subtitle}</Text>}
          </View>
          <View style={styles.valueWrap}>
            <Text style={styles.value}>{item.value}</Text>
            {item.secondaryValue && (
              <Text
                style={[
                  styles.secondaryValue,
                  { color: item.positive ? defaultColors.positive : defaultColors.negative },
                ]}
              >
                {item.secondaryValue}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  title: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: typography.weightMedium,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: defaultColors.bg,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: defaultColors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    color: defaultColors.accent,
    fontSize: typography.micro,
    fontWeight: typography.weightBold,
  },
  labelWrap: {
    flex: 1,
  },
  label: {
    color: defaultColors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  subtitle: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    marginTop: 1,
  },
  valueWrap: {
    alignItems: "flex-end",
  },
  value: {
    color: defaultColors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  secondaryValue: {
    fontSize: typography.micro,
    marginTop: 1,
  },
  emptyText: {
    color: defaultColors.muted,
    fontSize: typography.caption,
    fontStyle: "italic",
  },
});


