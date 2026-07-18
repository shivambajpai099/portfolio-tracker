import { useMemo, useState, useCallback } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { colors as themeColors, radii, spacing, typography, useTheme } from "../theme";
import type { Currency } from "../types/portfolio";
import { formatMoney, formatCompactAxis } from "../utils/format";
import type { HoldingPerformancePoint } from "../features/portfolio/calculations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PerformanceTimeRange = "1Y" | "2Y" | "ALL";

interface HoldingPerformanceChartProps {
  /** Performance data points (from calcHoldingPerformanceHistory) */
  data: HoldingPerformancePoint[];
  /** Currency for formatting values */
  currency: Currency;
  /** Current time range view */
  view?: PerformanceTimeRange;
  /** Callback when view changes */
  onViewChange?: (view: PerformanceTimeRange) => void;
  /** Current shares held (for tooltip) */
  sharesHeld?: number;
  /** Average cost per share (for tooltip) */
  avgCost?: number;
  /** Current market price (for tooltip) */
  currentPrice?: number;
  /** First transaction date (for holding period) */
  firstTransactionDate?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_HEIGHT = 180;
const INVESTED_COLOR = "#6366F1"; // Indigo/purple - step line
const CURRENT_VALUE_COLOR = "#22C55E"; // Green - continuous line

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a date string with year context.
 * e.g., "Jul '24", "Jan '25"
 */
const formatDateWithYear = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  const month = date.toLocaleDateString(undefined, { month: "short" });
  const year = date.getFullYear().toString().slice(-2);
  return `${month} '${year}`;
};

/**
 * Formats a full date string for tooltips.
 * e.g., "Jul 15, 2024"
 */
const formatFullDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  return date.toLocaleDateString(undefined, { 
    year: "numeric", 
    month: "short", 
    day: "numeric" 
  });
};

/**
 * Filters data points based on the selected time range.
 */
const filterDataByRange = (
  data: HoldingPerformancePoint[],
  range: PerformanceTimeRange
): HoldingPerformancePoint[] => {
  if (data.length === 0) return [];

  const now = new Date();
  let cutoffDate: Date;

  switch (range) {
    case "1Y":
      cutoffDate = new Date(now);
      cutoffDate.setMonth(cutoffDate.getMonth() - 12);
      break;
    case "2Y":
      cutoffDate = new Date(now);
      cutoffDate.setMonth(cutoffDate.getMonth() - 24);
      break;
    case "ALL":
    default:
      return data;
  }

  return data.filter((point) => new Date(point.date) >= cutoffDate);
};

/**
 * Calculate gain/loss from invested and current values.
 */
const calcGainLoss = (
  invested: number,
  current: number
): { absolute: number; percentage: number } => {
  const absolute = current - invested;
  const percentage = invested > 0 ? (absolute / invested) * 100 : 0;
  return { absolute, percentage };
};

/**
 * Generate evenly spaced label indices for X-axis
 */
const getLabelIndices = (dataLength: number, maxLabels: number = 5): Set<number> => {
  if (dataLength <= maxLabels) {
    return new Set(Array.from({ length: dataLength }, (_, i) => i));
  }
  
  const indices = new Set<number>();
  const step = (dataLength - 1) / (maxLabels - 1);
  
  for (let i = 0; i < maxLabels; i++) {
    indices.add(Math.round(i * step));
  }
  
  return indices;
};

/**
 * Expand data for step line rendering
 * For each point, adds an intermediate point to create a step effect.
 */
const expandForStepLine = (
  data: HoldingPerformancePoint[]
): HoldingPerformancePoint[] => {
  if (data.length <= 1) return data;
  
  const expanded: HoldingPerformancePoint[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const current = data[i];
    
    // For step effect: before changing to new value, add point at previous value
    if (i > 0 && expanded.length > 0) {
      const prevInvested = expanded[expanded.length - 1].invested;
      // Only add step point if invested value changed
      if (prevInvested !== current.invested) {
        expanded.push({
          date: current.date,
          invested: prevInvested,
          current: current.current,
        });
      }
    }
    
    expanded.push(current);
  }
  
  return expanded;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HoldingPerformanceChart({
  data,
  currency,
  view = "ALL",
  sharesHeld: propSharesHeld,
  avgCost: propAvgCost,
  currentPrice: propCurrentPrice,
}: HoldingPerformanceChartProps) {
  const { colors } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Filter data by range
  const filteredData = useMemo(() => filterDataByRange(data, view), [data, view]);
  
  // Expand for step line rendering (invested line)
  const chartData = useMemo(() => expandForStepLine(filteredData), [filteredData]);

  // Get screen width for responsive chart
  const screenWidth = Dimensions.get("window").width;
  // Chart takes full container width minus padding (no max limit)
  const chartWidth = screenWidth - spacing.lg * 2 - spacing.md * 2;

  // Derive shares held and avg cost from latest data point if not provided
  const derivedMetrics = useMemo(() => {
    if (filteredData.length === 0) return null;
    
    const last = filteredData[filteredData.length - 1];
    const shares = propSharesHeld ?? (last.current > 0 && propCurrentPrice ? last.current / propCurrentPrice : 0);
    const avg = propAvgCost ?? (shares > 0 ? last.invested / shares : 0);
    const price = propCurrentPrice ?? (shares > 0 ? last.current / shares : 0);
    
    return { sharesHeld: shares, avgCost: avg, currentPrice: price };
  }, [filteredData, propSharesHeld, propAvgCost, propCurrentPrice]);

  // Label indices for X-axis
  const labelIndices = useMemo(() => getLabelIndices(chartData.length, 4), [chartData.length]);

  // Prepare data for gifted-charts - Invested line (step)
  const investedLineData = useMemo(() => {
    return chartData.map((point, index) => ({
      value: point.invested,
      label: labelIndices.has(index) ? formatDateWithYear(point.date) : "",
      labelTextStyle: { color: colors.muted, fontSize: 10 },
    }));
  }, [chartData, labelIndices, colors.muted]);

  // Prepare data for gifted-charts - Current line (smooth)
  const currentLineData = useMemo(() => {
    return chartData.map((point) => ({
      value: point.current,
    }));
  }, [chartData]);

  // Selected point for tooltip
  const selectedPoint = useMemo(() => {
    if (selectedIndex === null || selectedIndex >= chartData.length) return null;
    
    const point = chartData[selectedIndex];
    const gainLoss = calcGainLoss(point.invested, point.current);
    
    // Calculate shares at this point
    const shares = derivedMetrics?.currentPrice && derivedMetrics.currentPrice > 0
      ? point.current / derivedMetrics.currentPrice
      : (propSharesHeld ?? 0);
    
    return {
      ...point,
      gainLoss,
      sharesHeld: shares,
    };
  }, [selectedIndex, chartData, derivedMetrics, propSharesHeld]);

  // Handle focus on data point
  const handleFocus = useCallback((_item: { value: number }, index: number) => {
    if (index >= 0 && index < chartData.length) {
      setSelectedIndex(prev => prev === index ? null : index);
    }
  }, [chartData.length]);

  // Empty state
  if (filteredData.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            No transaction history available for this holding.
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            Add transactions to see performance over time.
          </Text>
        </View>
      </View>
    );
  }

  // Calculate Y-axis range
  const allValues = chartData.flatMap(p => [p.invested, p.current]);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = maxValue - minValue || 1;
  const yAxisOffset = Math.max(0, minValue - range * 0.1);

  // Format Y-axis label using compact axis formatter
  const formatYLabel = (valueStr: string): string => {
    const value = parseFloat(valueStr);
    if (Number.isNaN(value)) return valueStr;
    return formatCompactAxis(value, currency);
  };

  return (
    <View style={styles.container}>

      {/* Tooltip for selected point - uses full formatting */}
      {selectedPoint && (
        <View style={[styles.tooltip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.tooltipContent}>
            <Text style={[styles.tooltipDate, { color: colors.text }]}>
              {formatFullDate(selectedPoint.date)}
            </Text>
            
            <View style={styles.tooltipGrid}>
              <View style={styles.tooltipGridItem}>
                <Text style={[styles.tooltipLabel, { color: colors.muted }]}>Current Value</Text>
                <Text style={[styles.tooltipValue, { color: colors.text }]}>
                  {formatMoney(selectedPoint.current, currency)}
                </Text>
              </View>
              
              <View style={styles.tooltipGridItem}>
                <Text style={[styles.tooltipLabel, { color: colors.muted }]}>Invested</Text>
                <Text style={[styles.tooltipValue, { color: colors.text }]}>
                  {formatMoney(selectedPoint.invested, currency)}
                </Text>
              </View>
              
              <View style={styles.tooltipGridItem}>
                <Text style={[styles.tooltipLabel, { color: colors.muted }]}>Gain/Loss</Text>
                <Text style={[
                  styles.tooltipValue,
                  { color: selectedPoint.gainLoss.absolute >= 0 ? colors.positive : colors.negative }
                ]}>
                  {selectedPoint.gainLoss.absolute >= 0 ? "+" : ""}{formatMoney(selectedPoint.gainLoss.absolute, currency)}
                </Text>
              </View>
              
              <View style={styles.tooltipGridItem}>
                <Text style={[styles.tooltipLabel, { color: colors.muted }]}>Return</Text>
                <Text style={[
                  styles.tooltipValue,
                  { color: selectedPoint.gainLoss.absolute >= 0 ? colors.positive : colors.negative }
                ]}>
                  {selectedPoint.gainLoss.percentage >= 0 ? "+" : ""}{selectedPoint.gainLoss.percentage.toFixed(2)}%
                </Text>
              </View>
              
              {derivedMetrics && derivedMetrics.sharesHeld > 0 && (
                <View style={styles.tooltipGridItem}>
                  <Text style={[styles.tooltipLabel, { color: colors.muted }]}>Shares Held</Text>
                  <Text style={[styles.tooltipValue, { color: colors.text }]}>
                    {derivedMetrics.sharesHeld.toFixed(derivedMetrics.sharesHeld < 10 ? 4 : 2)}
                  </Text>
                </View>
              )}
            </View>
          </View>
          
          <Pressable onPress={() => setSelectedIndex(null)} style={styles.tooltipClose}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* Chart */}
      <View style={styles.chartContainer}>
        <LineChart
          data={investedLineData}
          data2={currentLineData}
          width={chartWidth}
          height={CHART_HEIGHT}
          color1={INVESTED_COLOR}
          color2={CURRENT_VALUE_COLOR}
          thickness1={2}
          thickness2={2}
          // Invested line: step (no curve)
          curved={false}
          // Current value line: smooth area
          areaChart
          startFillColor2={CURRENT_VALUE_COLOR}
          endFillColor2={CURRENT_VALUE_COLOR}
          startOpacity2={0.2}
          endOpacity2={0.02}
          startFillColor1="transparent"
          endFillColor1="transparent"
          startOpacity1={0}
          endOpacity1={0}
          hideDataPoints
          spacing={(chartWidth - 60) / Math.max(chartData.length - 1, 1)}
          initialSpacing={15}
          endSpacing={15}
          yAxisOffset={yAxisOffset}
          noOfSections={4}
          yAxisColor="transparent"
          xAxisColor={colors.border}
          yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
          formatYLabel={formatYLabel}
          rulesType="solid"
          rulesColor={colors.border}
          rulesThickness={StyleSheet.hairlineWidth}
          backgroundColor="transparent"
          pointerConfig={{
            pointerStripHeight: CHART_HEIGHT,
            pointerStripColor: colors.border,
            pointerStripWidth: 1,
            pointerColor: CURRENT_VALUE_COLOR,
            radius: 6,
            pointerLabelWidth: 0,
            pointerLabelHeight: 0,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: false,
            pointerVanishDelay: 0,
            persistPointer: true,
            pointerEvents: "auto",
            showPointerStrip: true,
            pointerStripUptoDataPoint: true,
            pointer1Color: INVESTED_COLOR,
            pointer2Color: CURRENT_VALUE_COLOR,
          }}
          onFocus={handleFocus}
        />
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: INVESTED_COLOR }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Invested</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CURRENT_VALUE_COLOR }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Current</Text>
        </View>
      </View>

    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xs,
    marginHorizontal: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  dateRange: {
    fontSize: typography.caption,
    fontWeight: "500",
  },
  viewSelector: {
    flexDirection: "row",
    backgroundColor: themeColors.bg,
    borderRadius: radii.sm,
    padding: 2,
  },
  viewOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  viewOptionText: {
    fontSize: typography.caption,
    fontWeight: "500",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  summaryGain: {
    fontSize: typography.subheading,
    fontWeight: "700",
  },
  holdingPeriod: {
    fontSize: typography.caption,
  },
  tooltip: {
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderWidth: 1,
  },
  tooltipContent: {
    flex: 1,
  },
  tooltipDate: {
    fontSize: typography.body,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  tooltipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tooltipGridItem: {
    minWidth: 80,
  },
  tooltipLabel: {
    fontSize: typography.micro,
    marginBottom: 2,
  },
  tooltipValue: {
    fontSize: typography.caption,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  tooltipClose: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  chartContainer: {
    alignItems: "flex-start",
    marginVertical: spacing.xs,
    overflow: "hidden",
    width: "100%",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendLine: {
    width: 16,
    height: 2,
    marginRight: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.xs,
  },
  legendText: {
    fontSize: typography.micro,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metricItem: {
    alignItems: "center",
  },
  metricLabel: {
    fontSize: typography.micro,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: typography.caption,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  emptyContainer: {
    padding: spacing.lg,
    alignItems: "center",
  },
  emptyText: {
    fontSize: typography.body,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: typography.caption,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});


