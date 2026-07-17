import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { colors as defaultColors } from "../theme";

export interface SparklineProps {
  /** Array of numeric values (e.g., closing prices for last 30 days) */
  data: number[];
  /** Width of the sparkline */
  width?: number;
  /** Height of the sparkline */
  height?: number;
  /** Line color - defaults to positive/negative based on trend */
  color?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Show end dot */
  showEndDot?: boolean;
}

/**
 * Minimal sparkline for displaying price trends.
 * Automatically colors green for uptrend, red for downtrend.
 */
export function Sparkline({
  data,
  width = 48,
  height = 20,
  color,
  strokeWidth = 1.5,
  showEndDot = true,
}: SparklineProps) {
  const { path, endPoint, trendColor } = useMemo(() => {
    if (data.length < 2) {
      return { path: "", endPoint: null, trendColor: defaultColors.muted };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const padding = 2;
    const drawableWidth = width - padding * 2;
    const drawableHeight = height - padding * 2;

    const points = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * drawableWidth;
      const y = padding + (1 - (value - min) / range) * drawableHeight;
      return { x, y };
    });

    const pathD = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");

    const lastPoint = points[points.length - 1];
    const firstValue = data[0];
    const lastValue = data[data.length - 1];
    const trend = lastValue >= firstValue ? defaultColors.positive : defaultColors.negative;

    return {
      path: pathD,
      endPoint: lastPoint,
      trendColor: trend,
    };
  }, [data, width, height]);

  const lineColor = color ?? trendColor;

  if (data.length < 2) {
    return <View style={[styles.container, { width, height }]} />;
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        <Path
          d={path}
          fill="none"
          stroke={lineColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showEndDot && endPoint && (
          <Circle
            cx={endPoint.x}
            cy={endPoint.y}
            r={2}
            fill={lineColor}
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
});

