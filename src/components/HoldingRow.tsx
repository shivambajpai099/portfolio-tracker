import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../theme";

interface HoldingRowProps {
  symbol: string;
  subtitle: string;
  value: string;
}

export function HoldingRow({ symbol, subtitle, value }: HoldingRowProps) {
  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.symbol}>{symbol}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  symbol: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  subtitle: {
    color: colors.muted,
    fontSize: typography.body,
  },
  value: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
});
