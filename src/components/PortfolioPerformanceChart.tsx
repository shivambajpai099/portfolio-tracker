import { useMemo, useState, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, G } from "react-native-svg";
import { colors, radii, spacing, typography, useTheme } from "../theme";
import type { Currency } from "../types/portfolio";
import { formatMoney } from "../utils/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioHistoryPoint {
  date: string;
  investedAmount: number;
  currentValue: number;
}

export type TimeRangeView = "daily" | "monthly" | "yearly";

interface PortfolioPerformanceChartProps {
  /** Historical portfolio data points */
  data: PortfolioHistoryPoint[];
  /** Currency for formatting values */
  currency: Currency;
  /** Current time range view */
  view?: TimeRangeView;
  /** Callback when view changes */
  onViewChange?: (view: TimeRangeView) => void;
  /** Show loading state */
  isLoading?: boolean;
  /** Error message to display */
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIDTH = 320;
const HEIGHT = 200;
const PADDING_X = 14;
const PADDING_Y = 24;
const LEGEND_HEIGHT = 32;

const INVESTED_COLOR = "#6366F1"; // Indigo
const CURRENT_VALUE_COLOR = "#22C55E"; // Green

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a date string based on the time range view.
 */
export const formatDateLabel = (dateStr: string, view: TimeRangeView): string => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  switch (view) {
    case "daily":
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    case "monthly":
      return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    case "yearly":
      return date.getFullYear().toString();
    default:
      return dateStr;
  }
};

/**
 * Calculates gain/loss from a data point.
 */
export const calcGainLoss = (point: PortfolioHistoryPoint): { absolute: number; percentage: number } => {
  const absolute = point.currentValue - point.investedAmount;
  const percentage = point.investedAmount > 0 ? (absolute / point.investedAmount) * 100 : 0;
  return { absolute, percentage };
};

/**
 * Transforms data points into projected coordinates for SVG rendering.
 */
export const projectDataToCoords = (
  data: PortfolioHistoryPoint[],
  width: number,
  height: number,
  paddingX: number,
  paddingY: number
): {
  investedCoords: Array<{ x: number; y: number }>;
  currentValueCoords: Array<{ x: number; y: number }>;
  minValue: number;
  maxValue: number;
} => {
  if (data.length === 0) {
    return { investedCoords: [], currentValueCoords: [], minValue: 0, maxValue: 0 };
  }

  // Find min/max across both series
  const allValues = data.flatMap((p) => [p.investedAmount, p.currentValue]);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = maxValue - minValue || 1;

  const drawableWidth = width - paddingX * 2;
  const drawableHeight = height - paddingY * 2 - LEGEND_HEIGHT;

  const projectValue = (value: number, index: number) => {
    const x = paddingX + (data.length === 1 ? drawableWidth / 2 : (index / (data.length - 1)) * drawableWidth);
    const normalized = (value - minValue) / range;
    const y = height - paddingY - LEGEND_HEIGHT - normalized * drawableHeight;
    return { x, y };
  };

  const investedCoords = data.map((point, index) => projectValue(point.investedAmount, index));
  const currentValueCoords = data.map((point, index) => projectValue(point.currentValue, index));

  return { investedCoords, currentValueCoords, minValue, maxValue };
};

/**
 * Creates an SVG path string from coordinates.
 */
const pathFromCoords = (coords: Array<{ x: number; y: number }>): string => {
  if (coords.length === 0) return "";
  return coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
};

/**
 * Creates an area path (for gradient fill) from coordinates.
 */
const areaPathFromCoords = (coords: Array<{ x: number; y: number }>, baseY: number): string => {
  if (coords.length === 0) return "";
  const linePath = pathFromCoords(coords);
  return `${linePath} L ${coords[coords.length - 1].x} ${baseY} L ${coords[0].x} ${baseY} Z`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PortfolioPerformanceChart({
  data,
  currency,
  view = "monthly",
  onViewChange,
  isLoading = false,
  error = null,
}: PortfolioPerformanceChartProps) {
  const { colors: themeColors } = useTheme();
  
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showInvested, setShowInvested] = useState(true);
  const [showCurrentValue, setShowCurrentValue] = useState(true);

  // Project data to coordinates
  const graph = useMemo(() => {
    return projectDataToCoords(data, WIDTH, HEIGHT, PADDING_X, PADDING_Y);
  }, [data]);

  // Path strings for SVG
  const paths = useMemo(() => {
    const baseY = HEIGHT - PADDING_Y - LEGEND_HEIGHT;
    return {
      investedLine: pathFromCoords(graph.investedCoords),
      investedArea: areaPathFromCoords(graph.investedCoords, baseY),
      currentValueLine: pathFromCoords(graph.currentValueCoords),
      currentValueArea: areaPathFromCoords(graph.currentValueCoords, baseY),
    };
  }, [graph]);

  // Selected point data
  const selectedPoint = useMemo(() => {
    if (selectedIndex === null || selectedIndex >= data.length) {
      return data[data.length - 1] ?? null;
    }
    return data[selectedIndex];
  }, [data, selectedIndex]);

  const gainLoss = useMemo(() => {
    if (!selectedPoint) return null;
    return calcGainLoss(selectedPoint);
  }, [selectedPoint]);

  const handlePointSelect = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: themeColors.muted }]}>Loading chart data...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: themeColors.negative }]}>{error}</Text>
        </View>
      </View>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
        <Text style={[styles.cardTitle, { color: themeColors.text }]}>Portfolio Performance</Text>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Historical Data</Text>
          <Text style={[styles.emptyText, { color: themeColors.muted }]}>
            Portfolio performance data will appear here once you have historical snapshots.
          </Text>
          <Text style={[styles.emptyText, { color: themeColors.muted }]}>
            Keep tracking your portfolio to see how it grows over time.
          </Text>
        </View>
      </View>
    );
  }

  const baseY = HEIGHT - PADDING_Y - LEGEND_HEIGHT;

  return (
    <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
      {/* Header with title and view selector */}
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: themeColors.text }]}>Portfolio Performance</Text>
        {onViewChange && (
          <View style={styles.viewSelector}>
            {(["daily", "monthly", "yearly"] as TimeRangeView[]).map((v) => {
              const active = view === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => onViewChange(v)}
                  style={[
                    styles.viewOption,
                    active && { backgroundColor: themeColors.accent },
                  ]}
                >
                  <Text style={[styles.viewOptionText, { color: active ? themeColors.bg : themeColors.muted }]}>
                    {v.charAt(0).toUpperCase() + v.slice(1, 3)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Tooltip showing selected point data */}
      {selectedPoint && (
        <View style={styles.tooltip}>
          <Text style={[styles.tooltipDate, { color: themeColors.muted }]}>
            {formatDateLabel(selectedPoint.date, view)}
          </Text>
          <View style={styles.tooltipRow}>
            <View style={[styles.tooltipDot, { backgroundColor: INVESTED_COLOR }]} />
            <Text style={[styles.tooltipLabel, { color: themeColors.muted }]}>Invested:</Text>
            <Text style={[styles.tooltipValue, { color: themeColors.text }]}>
              {formatMoney(selectedPoint.investedAmount, currency)}
            </Text>
          </View>
          <View style={styles.tooltipRow}>
            <View style={[styles.tooltipDot, { backgroundColor: CURRENT_VALUE_COLOR }]} />
            <Text style={[styles.tooltipLabel, { color: themeColors.muted }]}>Current:</Text>
            <Text style={[styles.tooltipValue, { color: themeColors.text }]}>
              {formatMoney(selectedPoint.currentValue, currency)}
            </Text>
          </View>
          {gainLoss && (
            <View style={styles.tooltipRow}>
              <Text style={[styles.tooltipLabel, { color: themeColors.muted }]}>Gain/Loss:</Text>
              <Text
                style={[
                  styles.tooltipValue,
                  { color: gainLoss.absolute >= 0 ? themeColors.positive : themeColors.negative },
                ]}
              >
                {gainLoss.absolute >= 0 ? "+" : ""}
                {formatMoney(gainLoss.absolute, currency)} ({gainLoss.percentage >= 0 ? "+" : ""}
                {gainLoss.percentage.toFixed(2)}%)
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Chart */}
      <View style={styles.chartWrap}>
        <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <Defs>
            <LinearGradient id="investedFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={INVESTED_COLOR} stopOpacity="0.25" />
              <Stop offset="1" stopColor={INVESTED_COLOR} stopOpacity="0.02" />
            </LinearGradient>
            <LinearGradient id="currentValueFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={CURRENT_VALUE_COLOR} stopOpacity="0.25" />
              <Stop offset="1" stopColor={CURRENT_VALUE_COLOR} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>

          {/* X-axis baseline */}
          <Line
            x1={PADDING_X}
            y1={baseY}
            x2={WIDTH - PADDING_X}
            y2={baseY}
            stroke={themeColors.border}
            strokeWidth={1}
          />

          {/* Invested series */}
          {showInvested && paths.investedArea && (
            <G>
              <Path d={paths.investedArea} fill="url(#investedFill)" />
              <Path d={paths.investedLine} fill="none" stroke={INVESTED_COLOR} strokeWidth={2} />
              {graph.investedCoords.map((coord, index) => (
                <Circle
                  key={`invested-${index}`}
                  cx={coord.x}
                  cy={coord.y}
                  r={selectedIndex === index ? 4 : 2}
                  fill={INVESTED_COLOR}
                />
              ))}
            </G>
          )}

          {/* Current value series */}
          {showCurrentValue && paths.currentValueLine && (
            <G>
              <Path d={paths.currentValueArea} fill="url(#currentValueFill)" />
              <Path d={paths.currentValueLine} fill="none" stroke={CURRENT_VALUE_COLOR} strokeWidth={2} />
              {graph.currentValueCoords.map((coord, index) => (
                <Circle
                  key={`current-${index}`}
                  cx={coord.x}
                  cy={coord.y}
                  r={selectedIndex === index ? 4 : 2}
                  fill={CURRENT_VALUE_COLOR}
                />
              ))}
            </G>
          )}
        </Svg>

        {/* Touch targets for point selection */}
        <View style={styles.touchRow}>
          {data.map((_, index) => (
            <Pressable key={index} style={styles.touchSlot} onPress={() => handlePointSelect(index)} />
          ))}
        </View>
      </View>

      {/* X-axis labels */}
      <View style={styles.xAxisLabels}>
        <Text style={[styles.axisLabel, { color: themeColors.muted }]}>
          {data[0] ? formatDateLabel(data[0].date, view) : ""}
        </Text>
        <Text style={[styles.axisLabel, { color: themeColors.muted }]}>
          {data[data.length - 1] ? formatDateLabel(data[data.length - 1].date, view) : ""}
        </Text>
      </View>

      {/* Legend with toggle */}
      <View style={styles.legend}>
        <Pressable
          style={[styles.legendItem, !showInvested && styles.legendItemDisabled]}
          onPress={() => setShowInvested(!showInvested)}
        >
          <View style={[styles.legendDot, { backgroundColor: INVESTED_COLOR, opacity: showInvested ? 1 : 0.3 }]} />
          <Text style={[styles.legendText, { color: showInvested ? themeColors.text : themeColors.muted }]}>
            Invested
          </Text>
        </Pressable>
        <Pressable
          style={[styles.legendItem, !showCurrentValue && styles.legendItemDisabled]}
          onPress={() => setShowCurrentValue(!showCurrentValue)}
        >
          <View style={[styles.legendDot, { backgroundColor: CURRENT_VALUE_COLOR, opacity: showCurrentValue ? 1 : 0.3 }]} />
          <Text style={[styles.legendText, { color: showCurrentValue ? themeColors.text : themeColors.muted }]}>
            Current Value
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  viewSelector: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    padding: 2,
  },
  viewOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm - 1,
  },
  viewOptionText: {
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  tooltip: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
  },
  tooltipDate: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
    marginBottom: spacing.xs,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tooltipLabel: {
    fontSize: typography.micro,
    minWidth: 55,
  },
  tooltipValue: {
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    fontVariant: ["tabular-nums"],
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
  xAxisLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    paddingHorizontal: PADDING_X - spacing.md,
  },
  axisLabel: {
    fontSize: typography.micro,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendItemDisabled: {
    opacity: 0.6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: typography.caption,
  },
  // Empty state
  emptyContainer: {
    paddingVertical: spacing.xxxl,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: typography.caption,
    textAlign: "center",
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  // Loading state
  loadingContainer: {
    paddingVertical: spacing.xxxl,
    alignItems: "center",
  },
  loadingText: {
    fontSize: typography.caption,
  },
  // Error state
  errorContainer: {
    paddingVertical: spacing.xxxl,
    alignItems: "center",
  },
  errorText: {
    fontSize: typography.caption,
    textAlign: "center",
  },
});

