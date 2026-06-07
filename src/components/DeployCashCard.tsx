import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { calcDeployCash } from "../features/portfolio/calculations";
import type { DeployCashSlice } from "../features/portfolio/calculations";
import type { Currency, TargetAllocation } from "../types/portfolio";
import { colors, radii, spacing, typography } from "../theme";
import { formatMoney } from "../utils/format";

// ─── Region colours ───────────────────────────────────────────────────────────

const REGION_COLOR: Record<DeployCashSlice["region"], string> = {
  INDIA: "#F59E0B",   // amber  — matches geo split
  US:    "#6366F1",   // indigo — matches geo split
  CASH:  "#374151",   // muted grey
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DeployCashCardProps {
  /** Total cash available in reporting currency (used as the default amount). */
  totalCashRC: number;
  targetAllocation: TargetAllocation | null | undefined;
  reportingCurrency: Currency;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeployCashCard({
  totalCashRC,
  targetAllocation,
  reportingCurrency,
}: DeployCashCardProps) {
  const [amountStr, setAmountStr] = useState(() => Math.round(totalCashRC).toString());

  // Keep in sync when external cash changes (e.g. after adding a cash holding)
  useEffect(() => {
    setAmountStr(Math.round(totalCashRC).toString());
  }, [totalCashRC]);

  const deployAmount = useMemo(
    () => parseFloat(amountStr.replace(/[^0-9.]/g, "")) || 0,
    [amountStr],
  );

  const result = useMemo(() => {
    if (!targetAllocation) return null;
    return calcDeployCash(deployAmount, targetAllocation, reportingCurrency);
  }, [deployAmount, targetAllocation, reportingCurrency]);

  const currencyPrefix = reportingCurrency === "INR" ? "₹" : "$";

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Deploy Cash</Text>

      {/* ── No target set ── */}
      {!targetAllocation && (
        <Text style={styles.emptyText}>
          Set a target allocation in Rebalancing Suggestions to see deployment guidance.
        </Text>
      )}

      {/* ── Main UI ── */}
      {targetAllocation && (
        <>
          {/* Amount input */}
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Cash to deploy</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.currencyPrefix}>{currencyPrefix}</Text>
              <TextInput
                style={styles.input}
                value={amountStr}
                onChangeText={setAmountStr}
                keyboardType="numeric"
                selectTextOnFocus
                placeholderTextColor={colors.muted}
                placeholder="0"
              />
            </View>
          </View>

          {/* Allocation rows */}
          {result && result.slices.length > 0 && deployAmount > 0 && (
            <View style={styles.allocationBlock}>
              <Text style={styles.sectionLabel}>Suggested allocation</Text>

              {result.slices.map((slice) => {
                const barColor = REGION_COLOR[slice.region];
                return (
                  <View key={slice.region} style={styles.sliceRow}>
                    {/* Label row */}
                    <View style={styles.sliceMeta}>
                      <View style={styles.sliceLabelLeft}>
                        <View style={[styles.dot, { backgroundColor: barColor }]} />
                        <Text style={styles.sliceLabel}>{slice.label}</Text>
                      </View>
                      <View style={styles.sliceAmountGroup}>
                        <Text style={styles.slicePct}>{slice.pct.toFixed(0)}%</Text>
                        <Text style={styles.sliceAmount}>
                          {formatMoney(slice.amount, reportingCurrency)}
                        </Text>
                      </View>
                    </View>

                    {/* Progress bar */}
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${slice.pct}%` as unknown as number,
                            backgroundColor: barColor,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {deployAmount === 0 && (
            <Text style={styles.emptyText}>
              Enter an amount above to see suggested allocation.
            </Text>
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
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  // ── Input
  inputBlock: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  inputLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  currencyPrefix: {
    color: colors.muted,
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
    padding: 0,
  },
  // ── Allocation list
  allocationBlock: {
    gap: spacing.lg,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: -spacing.xs,
  },
  sliceRow: {
    gap: spacing.xs,
  },
  sliceMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sliceLabelLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sliceLabel: {
    color: colors.text,
    fontSize: typography.caption,
  },
  sliceAmountGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  slicePct: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
    width: 32,
    textAlign: "right",
  },
  sliceAmount: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    minWidth: 90,
    textAlign: "right",
  },
  // ── Progress bar
  barTrack: {
    height: 4,
    width: "100%",
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  barFill: {
    height: "100%" as unknown as number,
  },
});

