import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../theme";

interface StatCardProps {
  label: string;
  value: string;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  label: {
    color: colors.muted,
    fontSize: typography.body,
  },
  value: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.title,
    fontWeight: typography.weightSemibold,
  },
});
