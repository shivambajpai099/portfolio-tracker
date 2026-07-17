import { View, Text, StyleSheet } from "react-native";
import { colors as defaultColors, radii, spacing, typography } from "../theme";

interface BarChartBar {
  label: string;
  value: number;
  color?: string;
}

interface HorizontalBarChartProps {
  bars: BarChartBar[];
  maxValue?: number;
  showValues?: boolean;
  valueFormatter?: (value: number) => string;
  height?: number;
}

export function HorizontalBarChart({
  bars,
  maxValue,
  showValues = true,
  valueFormatter = (v) => v.toFixed(0),
  height = 24,
}: HorizontalBarChartProps) {
  const max = maxValue ?? Math.max(...bars.map((b) => b.value), 1);

  return (
    <View style={styles.container}>
      {bars.map((bar, index) => {
        const widthPct = max > 0 ? (bar.value / max) * 100 : 0;
        const color = bar.color ?? defaultColors.accent;

        return (
          <View key={index} style={styles.barRow}>
            <Text style={styles.barLabel} numberOfLines={1}>{bar.label}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.min(widthPct, 100)}%`, height, backgroundColor: color },
                ]}
              />
            </View>
            {showValues && (
              <Text style={styles.barValue}>{valueFormatter(bar.value)}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  barLabel: {
    width: 60,
    color: defaultColors.muted,
    fontSize: typography.micro,
  },
  barTrack: {
    flex: 1,
    height: 24,
    backgroundColor: defaultColors.bg,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  barFill: {
    borderRadius: radii.sm,
  },
  barValue: {
    width: 50,
    textAlign: "right",
    color: defaultColors.text,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
});


