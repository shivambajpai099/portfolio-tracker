import { useMemo, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { colors, radii, spacing, typography, useTheme } from "../theme";
import type { Currency } from "../types/portfolio";
import { formatMoney, formatCompact, formatCompactGainLoss } from "../utils/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioHistoryPoint {
  date: string;
  investedAmount: number;
  currentValue: number;
}

export type TimeRangeView = "monthly" | "quarterly" | "yearly";

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

const CHART_HEIGHT = 220;
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
    case "monthly":
      return date.toLocaleDateString(undefined, { month: "short" });
    case "quarterly": {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      return `Q${quarter}`;
    }
    case "yearly":
      return date.getFullYear().toString().slice(-2);
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
 * Kept for backward compatibility with tests.
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

  const LEGEND_HEIGHT = 32;
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
 * Formats large numbers for Y-axis labels (e.g., 100000 -> 100L)
 * Uses Indian numbering notation: k (thousands), L (lakhs), Cr (crores)
 */
const formatYAxisLabel = (value: string): string => {
  const num = parseFloat(value);
  if (num >= 10000000) {
    return `${(num / 10000000).toFixed(1)}Cr`;
  }
  if (num >= 100000) {
    return `${(num / 100000).toFixed(1)}L`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}k`;
  }
  return num.toFixed(0);
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

  // Get screen width for responsive chart
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = Math.min(screenWidth - spacing.md * 2, 400);

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

  // Prepare chart data
  const chartData = useMemo(() => {
    if (data.length === 0) {
      return {
        labels: [],
        datasets: [{ data: [0] }],
      };
    }

    // Limit labels to avoid crowding
    const maxLabels = 6;
    const step = Math.ceil(data.length / maxLabels);
    const labels = data.map((point, index) => 
      index % step === 0 || index === data.length - 1 
        ? formatDateLabel(point.date, view) 
        : ""
    );

    return {
      labels,
      datasets: [
        {
          data: data.map((p) => p.investedAmount),
          color: () => INVESTED_COLOR,
          strokeWidth: 2,
        },
        {
          data: data.map((p) => p.currentValue),
          color: () => CURRENT_VALUE_COLOR,
          strokeWidth: 2,
        },
      ],
      legend: ["Invested", "Current Value"],
    };
  }, [data, view]);

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
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Transaction Data</Text>
          <Text style={[styles.emptyText, { color: themeColors.muted }]}>
            Import transactions to see your portfolio performance over time.
          </Text>
        </View>
      </View>
    );
  }

  const chartConfig = {
    backgroundColor: themeColors.surface,
    backgroundGradientFrom: themeColors.surface,
    backgroundGradientTo: themeColors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    labelColor: () => themeColors.muted,
    style: {
      borderRadius: radii.md,
    },
    propsForDots: {
      r: "4",
      strokeWidth: "2",
    },
    propsForLabels: {
      fontSize: typography.micro,
    },
    formatYLabel: formatYAxisLabel,
  };

  return (
    <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
      {/* Header with title and view selector */}
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: themeColors.text }]}>Portfolio Performance</Text>
        {onViewChange && (
          <View style={styles.viewSelector}>
            {(["monthly", "quarterly", "yearly"] as TimeRangeView[]).map((v) => {
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
                    {v === "monthly" ? "Mon" : v === "quarterly" ? "Qtr" : "Year"}
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
              {formatCompact(selectedPoint.investedAmount, currency)}
            </Text>
          </View>
          <View style={styles.tooltipRow}>
            <View style={[styles.tooltipDot, { backgroundColor: CURRENT_VALUE_COLOR }]} />
            <Text style={[styles.tooltipLabel, { color: themeColors.muted }]}>Current:</Text>
            <Text style={[styles.tooltipValue, { color: themeColors.text }]}>
              {formatCompact(selectedPoint.currentValue, currency)}
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
                {formatCompactGainLoss(gainLoss.absolute, currency)} ({gainLoss.percentage >= 0 ? "+" : ""}
                {gainLoss.percentage.toFixed(2)}%)
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Chart */}
      <View style={styles.chartContainer}>
        <LineChart
          data={chartData}
          width={chartWidth}
          height={CHART_HEIGHT}
          chartConfig={chartConfig}
          bezier
          withInnerLines={false}
          withOuterLines
          withVerticalLines={false}
          withHorizontalLines
          withVerticalLabels
          withHorizontalLabels
          fromZero={false}
          segments={4}
          onDataPointClick={({ index }) => setSelectedIndex(index)}
          style={styles.chart}
        />
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: INVESTED_COLOR }]} />
          <Text style={[styles.legendText, { color: themeColors.text }]}>Invested</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CURRENT_VALUE_COLOR }]} />
          <Text style={[styles.legendText, { color: themeColors.text }]}>Current Value</Text>
        </View>
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
  chartContainer: {
    alignItems: "center",
    marginHorizontal: -spacing.md,
  },
  chart: {
    borderRadius: radii.md,
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

