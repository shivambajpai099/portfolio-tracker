import { View, Text, StyleSheet } from "react-native";
import { colors as defaultColors, radii, spacing, typography } from "../theme";

interface MiniBarData {
  value: number;
  label?: string;
  color?: string;
}

interface MiniBarChartProps {
  data: MiniBarData[];
  height?: number;
  showLabels?: boolean;
  barWidth?: number;
  gap?: number;
}

export function MiniBarChart({
  data,
  height = 60,
  showLabels = false,
  barWidth = 16,
  gap = 4,
}: MiniBarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={styles.container}>
      <View style={[styles.chart, { height }]}>
        {data.map((item, index) => {
          const barHeight = maxValue > 0 ? (item.value / maxValue) * height : 0;
          const color = item.color ?? defaultColors.accent;

          return (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  width: barWidth,
                  height: Math.max(barHeight, 2),
                  backgroundColor: color,
                  marginHorizontal: gap / 2,
                },
              ]}
            />
          );
        })}
      </View>
      {showLabels && (
        <View style={[styles.labels, { gap }]}>
          {data.map((item, index) => (
            <Text
              key={index}
              style={[styles.label, { width: barWidth + gap }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

interface ProgressBarProps {
  value: number;
  maxValue: number;
  height?: number;
  color?: string;
  backgroundColor?: string;
  showLabel?: boolean;
  label?: string;
}

export function ProgressBar({
  value,
  maxValue,
  height = 8,
  color = defaultColors.accent,
  backgroundColor = defaultColors.bg,
  showLabel = false,
  label,
}: ProgressBarProps) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  return (
    <View style={styles.progressContainer}>
      {showLabel && label && <Text style={styles.progressLabel}>{label}</Text>}
      <View style={[styles.progressTrack, { height, backgroundColor }]}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      {showLabel && (
        <Text style={styles.progressValue}>{pct.toFixed(0)}%</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  bar: {
    borderRadius: radii.xs,
  },
  labels: {
    flexDirection: "row",
    marginTop: spacing.xs,
  },
  label: {
    color: defaultColors.muted,
    fontSize: 9,
    textAlign: "center",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  progressLabel: {
    color: defaultColors.muted,
    fontSize: typography.micro,
    minWidth: 50,
  },
  progressTrack: {
    flex: 1,
    borderRadius: radii.xs,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.xs,
  },
  progressValue: {
    color: defaultColors.text,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    minWidth: 32,
    textAlign: "right",
  },
});


