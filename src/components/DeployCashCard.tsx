import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { calcDeployCash, type DeployCashAllocationContext } from "../features/portfolio/calculations";
import type { Currency, TargetAllocation } from "../types/portfolio";
import { colors, radii, spacing, typography } from "../theme";
import { formatMoney } from "../utils/format";

// ─── Region colours ───────────────────────────────────────────────────────────

const REGION_COLOR: Record<string, string> = {
  INDIA: "#F59E0B",   // amber  — matches geo split
  US:    "#6366F1",   // indigo — matches geo split
  CASH:  "#374151",   // muted grey
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DeployCashCardProps {
  /** Total cash available in reporting currency. */
  totalCashRC: number;
  targetAllocation: TargetAllocation | null | undefined;
  reportingCurrency: Currency;
  currentAllocation?: DeployCashAllocationContext | null;
  onPlanDeployment: () => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeployCashCard({
  totalCashRC,
  targetAllocation,
  reportingCurrency,
  currentAllocation,
  onPlanDeployment,
  isExpanded,
  onToggleExpanded,
}: DeployCashCardProps) {
  const expanded = isExpanded ?? true;
  const currencyPrefix = reportingCurrency === "INR" ? "₹" : "$";

  // Show suggested allocation for the full available cash at a glance
  const suggestedAllocation = useMemo(() => {
    if (!targetAllocation || totalCashRC <= 0) return null;
    return calcDeployCash(totalCashRC, targetAllocation, reportingCurrency, currentAllocation ?? undefined);
  }, [targetAllocation, totalCashRC, reportingCurrency, currentAllocation]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Deploy Cash</Text>
        <View style={styles.headerActions}>
          {onToggleExpanded && (
            <Pressable onPress={onToggleExpanded} hitSlop={8}>
              <Text style={styles.toggleBtn}>{expanded ? "Hide" : "Show"}</Text>
            </Pressable>
          )}
          {targetAllocation && (
            <Pressable onPress={onPlanDeployment} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>Plan Deployment</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── No target set ── */}
      {!targetAllocation && (
        <Text style={styles.emptyText}>
          Set your target allocation in the Rebalancing Suggestions card to plan how to deploy cash while keeping your target cash reserve intact.
        </Text>
      )}

      {/* ── Available cash summary ── */}
      {targetAllocation && (
        <>
          <View style={styles.cashSummary}>
            <Text style={styles.cashLabel}>Available Cash</Text>
            <Text style={styles.cashHint}>Based on current allocation</Text>
            <Text style={styles.cashValue}>
              {currencyPrefix}{formatMoney(totalCashRC, reportingCurrency).replace(/^[₹$]/, "")}
            </Text>
          </View>

          {/* Suggested allocation summary */}
          {expanded && suggestedAllocation && suggestedAllocation.slices.length > 0 && (
            <View style={styles.allocationSummary}>
              <Text style={styles.summaryLabel}>Suggested deployment</Text>
              <View style={styles.summaryGrid}>
                {suggestedAllocation.slices.map((slice) => {
                  const barColor = REGION_COLOR[slice.region];
                  return (
                    <View key={slice.region} style={styles.summaryItem}>
                      <View style={styles.summaryHeader}>
                        <View style={[styles.dot, { backgroundColor: barColor }]} />
                        <Text style={styles.summaryItemLabel}>{slice.label}</Text>
                      </View>
                      <View style={styles.summaryValues}>
                        <Text style={styles.summaryPct}>{slice.pct.toFixed(0)}%</Text>
                        <Text style={styles.summaryAmount}>
                          {formatMoney(slice.amount, reportingCurrency)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}


// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xxxl,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    flex: 1,
  },
  toggleBtn: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
  },
  actionBtnText: {
    color: colors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  emptyText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  // ── Cash summary
  cashSummary: {
    marginBottom: spacing.lg,
  },
  cashLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  cashHint: {
    color: colors.muted,
    fontSize: typography.caption,
    marginBottom: spacing.xs,
  },
  cashValue: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  // ── Allocation summary
  allocationSummary: {
    gap: spacing.md,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryGrid: {
    gap: spacing.md,
  },
  summaryItem: {
    gap: spacing.sm,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryItemLabel: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  summaryValues: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: spacing.xl,
  },
  summaryPct: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
    minWidth: 40,
  },
  summaryAmount: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    minWidth: 90,
    textAlign: "right",
  },
});

