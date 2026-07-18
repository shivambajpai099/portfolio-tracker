import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { radii, spacing, typography, useTheme } from "../theme";
import type { Currency } from "../types/portfolio";
import { formatMoney, formatCompactAxis } from "../utils/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioHistoryPoint {
  date: string;
  investedAmount: number;
  currentValue: number;
  /** Optional: cash balance at this point */
  cashBalance?: number;
  /** Optional: number of holdings at this point */
  holdingsCount?: number;
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
const MIN_CHART_WIDTH = 280;
const PADDING_LEFT = 48;
const PADDING_RIGHT = 16;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 28;
const Y_AXIS_SECTIONS = 4;
const Y_AXIS_PADDING_PERCENT = 0.075; // 7.5% padding top and bottom

const INVESTED_COLOR = "#6366F1"; // Indigo
const CURRENT_VALUE_COLOR = "#22C55E"; // Green
const GRID_COLOR = "#1E2128";
const TOOLTIP_BG = "#1A1D24";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a date string with year context.
 */
const formatDateWithYear = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const month = date.toLocaleDateString(undefined, { month: "short" });
  const year = date.getFullYear().toString().slice(-2);
  return `${month} '${year}`;
};

/**
 * Formats a full date for tooltips
 */
const formatFullDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/**
 * Formats a date string based on the time range view (for exports/tests).
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
 * Build a smooth line path (straight segments between points)
 */
const buildLinePath = (coords: Array<{ x: number; y: number }>): string => {
  if (coords.length === 0) return "";
  return coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
};

/**
 * Build a step-line path (horizontal then vertical between points)
 * This is used for invested values that should only change on transactions
 */
const buildStepPath = (coords: Array<{ x: number; y: number }>): string => {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;
  
  let path = `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;
  for (let i = 1; i < coords.length; i++) {
    // Horizontal line to new x, then vertical to new y
    path += ` H ${coords[i].x.toFixed(2)} V ${coords[i].y.toFixed(2)}`;
  }
  return path;
};

/**
 * Build area path under a line for gradient fill
 */
const buildAreaPath = (
  coords: Array<{ x: number; y: number }>,
  baseY: number,
  isStep: boolean = false
): string => {
  if (coords.length === 0) return "";
  
  let linePath: string;
  if (isStep) {
    linePath = buildStepPath(coords);
  } else {
    linePath = buildLinePath(coords);
  }
  
  const lastX = coords[coords.length - 1].x;
  const firstX = coords[0].x;
  
  return `${linePath} L ${lastX.toFixed(2)} ${baseY.toFixed(2)} L ${firstX.toFixed(2)} ${baseY.toFixed(2)} Z`;
};

/**
 * Get evenly distributed label indices for X-axis
 */
const getLabelIndices = (dataLength: number, maxLabels: number = 5): number[] => {
  if (dataLength <= maxLabels) {
    return Array.from({ length: dataLength }, (_, i) => i);
  }
  
  const indices: number[] = [];
  const step = (dataLength - 1) / (maxLabels - 1);
  
  for (let i = 0; i < maxLabels; i++) {
    indices.push(Math.round(i * step));
  }
  
  return indices;
};

/**
 * Returns a "nice" rounded step (1, 2, 2.5 or 5 × 10^n) for the given raw step
 * so axis intervals fall on clean, human-friendly values.
 */
const niceStep = (rawStep: number): number => {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  let niceNormalized: number;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 2.5) niceNormalized = 2.5;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;
  return niceNormalized * magnitude;
};

/**
 * Calculate nice Y-axis values
 */
const calculateYAxisValues = (
  minValue: number,
  maxValue: number,
  sections: number
): number[] => {
  const range = maxValue - minValue;
  const step = range / sections;
  
  const values: number[] = [];
  for (let i = 0; i <= sections; i++) {
    values.push(minValue + step * i);
  }
  
  return values;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PortfolioPerformanceChart({
  data,
  currency,
  isLoading = false,
  error = null,
}: PortfolioPerformanceChartProps) {
  const { colors: themeColors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Animation values
  const hoverOpacity = useRef(new Animated.Value(0)).current;
  const investedOpacity = useRef(new Animated.Value(1)).current;

  // Handle container layout
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // Calculate chart dimensions
  const chartWidth = Math.max(containerWidth - spacing.md * 2, MIN_CHART_WIDTH);
  const drawableWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
  const drawableHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  // Calculate Y-axis bounds with padding
  const yAxisBounds = useMemo(() => {
    if (data.length === 0) {
      return { min: 0, max: 100, range: 100, paddedMin: 0, paddedMax: 100 };
    }

    const allValues = data.flatMap((p) => [p.investedAmount, p.currentValue]);
    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const rawRange = rawMax - rawMin || 1;

    // Add padding to prevent clipping
    const padding = rawRange * Y_AXIS_PADDING_PERCENT;
    const roughMin = Math.max(0, rawMin - padding);
    const roughMax = rawMax + padding;

    // Snap bounds to a "nice" step so axis labels land on clean, evenly
    // spaced values (e.g. ₹1L, ₹2L, ₹3L) instead of oddly rounded numbers.
    const step = niceStep((roughMax - roughMin) / Y_AXIS_SECTIONS);
    const paddedMin = Math.max(0, Math.floor(roughMin / step) * step);
    const paddedMax = Math.ceil(roughMax / step) * step;

    return {
      min: rawMin,
      max: rawMax,
      range: rawRange,
      paddedMin,
      paddedMax,
    };
  }, [data]);

  // Project data points to SVG coordinates
  const projectedData = useMemo(() => {
    if (data.length === 0 || drawableWidth <= 0) {
      return {
        invested: [] as Array<{ x: number; y: number; point: PortfolioHistoryPoint }>,
        current: [] as Array<{ x: number; y: number; point: PortfolioHistoryPoint }>,
      };
    }

    const { paddedMin, paddedMax } = yAxisBounds;
    const valueRange = paddedMax - paddedMin || 1;

    const projectPoint = (value: number, index: number) => {
      const x = PADDING_LEFT + (data.length === 1 ? drawableWidth / 2 : (index / (data.length - 1)) * drawableWidth);
      const normalized = (value - paddedMin) / valueRange;
      const y = CHART_HEIGHT - PADDING_BOTTOM - normalized * drawableHeight;
      return { x, y };
    };

    return {
      invested: data.map((point, index) => ({
        ...projectPoint(point.investedAmount, index),
        point,
      })),
      current: data.map((point, index) => ({
        ...projectPoint(point.currentValue, index),
        point,
      })),
    };
  }, [data, drawableWidth, drawableHeight, yAxisBounds]);

  // Y-axis labels
  const yAxisLabels = useMemo(() => {
    const { paddedMin, paddedMax } = yAxisBounds;
    const values = calculateYAxisValues(paddedMin, paddedMax, Y_AXIS_SECTIONS);
    const valueRange = paddedMax - paddedMin || 1;
    
    return values.map((value) => {
      const normalized = (value - paddedMin) / valueRange;
      const y = CHART_HEIGHT - PADDING_BOTTOM - normalized * drawableHeight;
      return { value, y, label: formatCompactAxis(value, currency) };
    });
  }, [yAxisBounds, drawableHeight, currency]);

  // X-axis labels
  const xAxisLabels = useMemo(() => {
    if (data.length === 0) return [];
    
    const indices = getLabelIndices(data.length, 5);
    return indices.map((index) => {
      const x = PADDING_LEFT + (data.length === 1 ? drawableWidth / 2 : (index / (data.length - 1)) * drawableWidth);
      return {
        x,
        label: formatDateWithYear(data[index].date),
      };
    });
  }, [data, drawableWidth]);

  // SVG paths
  const paths = useMemo(() => {
    const investedCoords = projectedData.invested.map((p) => ({ x: p.x, y: p.y }));
    const currentCoords = projectedData.current.map((p) => ({ x: p.x, y: p.y }));
    const baseY = CHART_HEIGHT - PADDING_BOTTOM;

    return {
      investedLine: buildStepPath(investedCoords),
      currentLine: buildLinePath(currentCoords),
      currentArea: buildAreaPath(currentCoords, baseY, false),
    };
  }, [projectedData]);

  // Handle touch/hover
  const findNearestPoint = useCallback(
    (touchX: number): number | null => {
      if (projectedData.current.length === 0) return null;
      
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      
      for (let i = 0; i < projectedData.current.length; i++) {
        const distance = Math.abs(projectedData.current[i].x - touchX);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }
      
      return nearestIndex;
    },
    [projectedData]
  );

  const handleHoverStart = useCallback(
    (x: number, y: number) => {
      const index = findNearestPoint(x);
      if (index !== null) {
        setHoveredIndex(index);
        setTooltipPosition({ x, y });
        
        Animated.parallel([
          Animated.timing(hoverOpacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(investedOpacity, {
            toValue: 0.5,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();
      }
    },
    [findNearestPoint, hoverOpacity, investedOpacity]
  );

  const handleHoverEnd = useCallback(() => {
    Animated.parallel([
      Animated.timing(hoverOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(investedOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setHoveredIndex(null);
      setTooltipPosition(null);
    });
  }, [hoverOpacity, investedOpacity]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          handleHoverStart(locationX, locationY);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const index = findNearestPoint(locationX);
          if (index !== null && index !== hoveredIndex) {
            setHoveredIndex(index);
            setTooltipPosition({ x: locationX, y: locationY });
          }
        },
        onPanResponderRelease: handleHoverEnd,
        onPanResponderTerminate: handleHoverEnd,
      }),
    [handleHoverStart, handleHoverEnd, findNearestPoint, hoveredIndex]
  );

  // Hovered point data
  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : null;
  const hoveredGainLoss = hoveredPoint ? calcGainLoss(hoveredPoint) : null;

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

  return (
    <View
      style={[styles.card, { backgroundColor: themeColors.surface }]}
      onLayout={handleLayout}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>Portfolio Performance</Text>
        </View>
      </View>


      {/* Chart */}
      <View style={styles.chartContainer} {...panResponder.panHandlers}>
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="currentValueFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={CURRENT_VALUE_COLOR} stopOpacity={0.25} />
              <Stop offset="100%" stopColor={CURRENT_VALUE_COLOR} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {yAxisLabels.map((label, i) => (
            <Line
              key={`grid-${i}`}
              x1={PADDING_LEFT}
              y1={label.y}
              x2={chartWidth - PADDING_RIGHT}
              y2={label.y}
              stroke={GRID_COLOR}
              strokeWidth={0.5}
              strokeDasharray={i === 0 ? undefined : "4,4"}
            />
          ))}

          {/* Y-axis labels */}
          {yAxisLabels.map((label, i) => (
            <SvgText
              key={`y-label-${i}`}
              x={PADDING_LEFT - 8}
              y={label.y + 4}
              fontSize={10}
              fill={themeColors.muted}
              textAnchor="end"
            >
              {label.label}
            </SvgText>
          ))}

          {/* Current Value area fill */}
          {paths.currentArea && (
            <Path d={paths.currentArea} fill="url(#currentValueFill)" />
          )}

          {/* Invested line (step) */}
          <Path
            d={paths.investedLine}
            fill="none"
            stroke={INVESTED_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={hoveredIndex !== null ? 0.5 : 1}
          />

          {/* Current Value line */}
          <Path
            d={paths.currentLine}
            fill="none"
            stroke={CURRENT_VALUE_COLOR}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hover vertical guide */}
          {hoveredIndex !== null && projectedData.current[hoveredIndex] && (
            <Line
              x1={projectedData.current[hoveredIndex].x}
              y1={PADDING_TOP}
              x2={projectedData.current[hoveredIndex].x}
              y2={CHART_HEIGHT - PADDING_BOTTOM}
              stroke={themeColors.border}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          )}

          {/* Hover point markers */}
          {hoveredIndex !== null && (
            <G>
              {/* Invested point */}
              {projectedData.invested[hoveredIndex] && (
                <Circle
                  cx={projectedData.invested[hoveredIndex].x}
                  cy={projectedData.invested[hoveredIndex].y}
                  r={5}
                  fill={INVESTED_COLOR}
                  stroke={themeColors.surface}
                  strokeWidth={2}
                />
              )}
              {/* Current value point */}
              {projectedData.current[hoveredIndex] && (
                <Circle
                  cx={projectedData.current[hoveredIndex].x}
                  cy={projectedData.current[hoveredIndex].y}
                  r={6}
                  fill={CURRENT_VALUE_COLOR}
                  stroke={themeColors.surface}
                  strokeWidth={2}
                />
              )}
            </G>
          )}

          {/* X-axis labels */}
          {xAxisLabels.map((label, i) => (
            <SvgText
              key={`x-label-${i}`}
              x={label.x}
              y={CHART_HEIGHT - 8}
              fontSize={10}
              fill={themeColors.muted}
              textAnchor="middle"
            >
              {label.label}
            </SvgText>
          ))}
        </Svg>

        {/* Tooltip */}
        {hoveredPoint && tooltipPosition && (
          <Animated.View
            style={[
              styles.tooltip,
              {
                backgroundColor: TOOLTIP_BG,
                borderColor: themeColors.border,
                opacity: hoverOpacity,
                left: Math.min(
                  Math.max(tooltipPosition.x - 90, spacing.sm),
                  chartWidth - 180 - spacing.sm
                ),
                top: Math.max(tooltipPosition.y - 140, spacing.sm),
              },
            ]}
          >
            <Text style={[styles.tooltipDate, { color: themeColors.text }]}>
              {formatFullDate(hoveredPoint.date)}
            </Text>
            
            <View style={styles.tooltipDivider} />
            
            <View style={styles.tooltipRow}>
              <View style={[styles.tooltipDot, { backgroundColor: CURRENT_VALUE_COLOR }]} />
              <Text style={[styles.tooltipLabel, { color: themeColors.muted }]}>Portfolio Value</Text>
              <Text style={[styles.tooltipValue, { color: themeColors.text }]}>
                {formatMoney(hoveredPoint.currentValue, currency)}
              </Text>
            </View>
            
            <View style={styles.tooltipRow}>
              <View style={[styles.tooltipDot, { backgroundColor: INVESTED_COLOR }]} />
              <Text style={[styles.tooltipLabel, { color: themeColors.muted }]}>Invested</Text>
              <Text style={[styles.tooltipValue, { color: themeColors.text }]}>
                {formatMoney(hoveredPoint.investedAmount, currency)}
              </Text>
            </View>
            
            {hoveredGainLoss && (
              <View style={styles.tooltipRow}>
                <View style={[styles.tooltipDot, { backgroundColor: "transparent" }]} />
                <Text style={[styles.tooltipLabel, { color: themeColors.muted }]}>Gain/Loss</Text>
                <Text
                  style={[
                    styles.tooltipValue,
                    {
                      color: hoveredGainLoss.absolute >= 0
                        ? themeColors.positive
                        : themeColors.negative,
                    },
                  ]}
                >
                  {hoveredGainLoss.absolute >= 0 ? "+" : ""}
                  {formatMoney(hoveredGainLoss.absolute, currency)}
                </Text>
              </View>
            )}
            
            {hoveredGainLoss && (
              <View style={styles.tooltipRow}>
                <View style={[styles.tooltipDot, { backgroundColor: "transparent" }]} />
                <Text style={[styles.tooltipLabel, { color: themeColors.muted }]}>Return</Text>
                <Text
                  style={[
                    styles.tooltipValue,
                    {
                      color: hoveredGainLoss.percentage >= 0
                        ? themeColors.positive
                        : themeColors.negative,
                    },
                  ]}
                >
                  {hoveredGainLoss.percentage >= 0 ? "+" : ""}
                  {hoveredGainLoss.percentage.toFixed(2)}%
                </Text>
              </View>
            )}
            
            {hoveredPoint.cashBalance !== undefined && (
              <View style={styles.tooltipRow}>
                <View style={[styles.tooltipDot, { backgroundColor: "transparent" }]} />
                <Text style={[styles.tooltipLabel, { color: themeColors.muted }]}>Cash</Text>
                <Text style={[styles.tooltipValue, { color: themeColors.text }]}>
                  {formatMoney(hoveredPoint.cashBalance, currency)}
                </Text>
              </View>
            )}
            
            {hoveredPoint.holdingsCount !== undefined && (
              <View style={styles.tooltipRow}>
                <View style={[styles.tooltipDot, { backgroundColor: "transparent" }]} />
                <Text style={[styles.tooltipLabel, { color: themeColors.muted }]}>Holdings</Text>
                <Text style={[styles.tooltipValue, { color: themeColors.text }]}>
                  {hoveredPoint.holdingsCount}
                </Text>
              </View>
            )}
          </Animated.View>
        )}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: CURRENT_VALUE_COLOR }]} />
          <Text style={[styles.legendText, { color: themeColors.text }]}>Current Value</Text>
        </View>
        <View style={styles.legendItem}>
          <Svg width={16} height={8}>
            <Path
              d="M 0 6 H 6 V 2 H 16"
              fill="none"
              stroke={INVESTED_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <View style={{ width: spacing.xs }} />
          <Text style={[styles.legendText, { color: themeColors.text }]}>Invested</Text>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flex: 1,
  },
  cardTitle: {
    fontSize: typography.body,
    fontWeight: "600",
  },
  dateRange: {
    fontSize: typography.caption,
    marginTop: 2,
  },
  subtitle: {
    fontSize: typography.caption,
    marginBottom: spacing.sm,
  },
  viewSelector: {
    flexDirection: "row",
    borderRadius: radii.sm,
    padding: 2,
  },
  viewOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm - 1,
    minWidth: 28,
    alignItems: "center",
  },
  viewOptionText: {
    fontSize: typography.caption,
    fontWeight: "600",
  },
  chartContainer: {
    position: "relative",
    marginHorizontal: -spacing.md,
  },
  tooltip: {
    position: "absolute",
    borderRadius: radii.sm,
    padding: spacing.sm,
    borderWidth: 1,
    minWidth: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  tooltipDate: {
    fontSize: typography.caption,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  tooltipDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginBottom: spacing.xs,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  tooltipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  tooltipLabel: {
    fontSize: typography.micro,
    flex: 1,
  },
  tooltipValue: {
    fontSize: typography.micro,
    fontWeight: "600",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendLine: {
    width: 16,
    height: 3,
    borderRadius: 1.5,
    marginRight: spacing.xs,
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
    fontWeight: "600",
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

