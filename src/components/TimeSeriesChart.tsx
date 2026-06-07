import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { colors, radii, spacing, typography } from "../theme";

export interface TimeSeriesPoint {
  label: string;
  value: number;
}

interface TimeSeriesChartProps {
  points: TimeSeriesPoint[];
  color: string;
  yLabel?: string;
  formatValue?: (value: number) => string;
}

const WIDTH = 320;
const HEIGHT = 180;
const PADDING_X = 14;
const PADDING_Y = 18;

const pathFromPoints = (points: Array<{ x: number; y: number }>): string => {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
};

export function TimeSeriesChart({
  points,
  color,
  yLabel,
  formatValue = (value) => String(value),
}: TimeSeriesChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(points.length - 1);

  const graph = useMemo(() => {
    if (points.length === 0) {
      return {
        projected: [] as Array<{ x: number; y: number }> ,
        linePath: "",
        areaPath: "",
        min: 0,
        max: 0,
      };
    }

    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const drawableWidth = WIDTH - PADDING_X * 2;
    const drawableHeight = HEIGHT - PADDING_Y * 2;

    const projected = points.map((point, index) => {
      const x = PADDING_X + (points.length === 1 ? drawableWidth / 2 : (index / (points.length - 1)) * drawableWidth);
      const normalized = (point.value - min) / range;
      const y = HEIGHT - PADDING_Y - normalized * drawableHeight;
      return { x, y };
    });

    const linePath = pathFromPoints(projected);
    const areaPath =
      projected.length > 0
        ? `${linePath} L ${projected[projected.length - 1].x} ${HEIGHT - PADDING_Y} L ${projected[0].x} ${HEIGHT - PADDING_Y} Z`
        : "";

    return { projected, linePath, areaPath, min, max };
  }, [points]);

  const boundedIndex = Math.max(0, Math.min(selectedIndex, points.length - 1));
  const selected = points[boundedIndex];

  return (
    <View style={styles.card}>
      {selected ? (
        <View style={styles.header}>
          <Text style={styles.headerValue}>{formatValue(selected.value)}</Text>
          <Text style={styles.headerLabel}>{selected.label}</Text>
        </View>
      ) : null}

      <View style={styles.chartWrap}>
        <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <Defs>
            <LinearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.35" />
              <Stop offset="1" stopColor={color} stopOpacity="0.04" />
            </LinearGradient>
          </Defs>

          <Line x1={PADDING_X} y1={HEIGHT - PADDING_Y} x2={WIDTH - PADDING_X} y2={HEIGHT - PADDING_Y} stroke="#1E2128" strokeWidth={1} />

          {graph.areaPath ? <Path d={graph.areaPath} fill="url(#chartFill)" /> : null}
          {graph.linePath ? <Path d={graph.linePath} fill="none" stroke={color} strokeWidth={2.5} /> : null}

          {graph.projected.map((dot, index) => (
            <Circle
              key={`${dot.x}-${dot.y}`}
              cx={dot.x}
              cy={dot.y}
              r={index === boundedIndex ? 4 : 2.5}
              fill={index === boundedIndex ? color : "#8B909A"}
            />
          ))}
        </Svg>

        <View style={styles.touchRow}>
          {graph.projected.map((_, index) => (
            <Pressable key={index} style={styles.touchSlot} onPress={() => setSelectedIndex(index)} />
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{points[0]?.label ?? ""}</Text>
        <Text style={styles.footerText}>{points[points.length - 1]?.label ?? ""}</Text>
      </View>

      {yLabel ? <Text style={styles.yLabel}>{yLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  header: {
    marginBottom: spacing.sm,
  },
  headerValue: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  headerLabel: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typography.micro,
  },
  chartWrap: {
    position: "relative",
  },
  touchRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  touchSlot: {
    flex: 1,
  },
  footer: {
    marginTop: spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    color: colors.muted,
    fontSize: typography.micro,
  },
  yLabel: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typography.micro,
  },
});


