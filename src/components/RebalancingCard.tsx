import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { RebalancingResult } from "../features/portfolio/calculations";
import type { TargetAllocation } from "../types/portfolio";
import { colors, radii, spacing, typography } from "../theme";
import { formatMoney } from "../utils/format";

// ─── Constants ────────────────────────────────────────────────────────────────

const AMBER = "#F59E0B";

// ─── Draft helpers ────────────────────────────────────────────────────────────

interface Draft {
  india: string;
  us: string;
  cash: string;
}

function draftFromTarget(t: TargetAllocation | null | undefined): Draft {
  if (!t) return { india: "50", us: "40", cash: "10" };
  return { india: String(t.indiaPct), us: String(t.usPct), cash: String(t.cashPct) };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RebalancingCardProps {
  targetAllocation: TargetAllocation | null | undefined;
  /** Pass null when targets aren't set yet or portfolio is empty. */
  result: RebalancingResult | null;
  onSave: (target: TargetAllocation) => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RebalancingCard({
  targetAllocation,
  result,
  onSave,
  isExpanded,
  onToggleExpanded,
}: RebalancingCardProps) {
  const hasTarget = !!targetAllocation;
  const expanded = isExpanded ?? true;
  const [editing, setEditing] = useState(!hasTarget);
  const [draft, setDraft] = useState<Draft>(() => draftFromTarget(targetAllocation));

  // If target is cleared externally, open edit mode with defaults
  useEffect(() => {
    if (!targetAllocation) {
      setEditing(true);
      setDraft(draftFromTarget(null));
    }
  }, [targetAllocation]);

  const indiaN = parseFloat(draft.india) || 0;
  const usN = parseFloat(draft.us) || 0;
  const cashN = parseFloat(draft.cash) || 0;
  const draftSum = indiaN + usN + cashN;
  const draftValid = Math.abs(draftSum - 100) < 0.5;

  const handleSave = () => {
    if (!draftValid) return;
    onSave({ indiaPct: indiaN, usPct: usN, cashPct: cashN });
    setEditing(false);
  };

  const handleEdit = () => {
    setDraft(draftFromTarget(targetAllocation));
    setEditing(true);
  };

  return (
    <View style={styles.card}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Rebalancing Suggestions</Text>
        <View style={styles.headerActions}>
          {hasTarget && !editing && expanded && (
            <Pressable onPress={handleEdit} hitSlop={8}>
              <Text style={styles.editBtn}>Edit targets</Text>
            </Pressable>
          )}
          {onToggleExpanded && (
            <Pressable onPress={onToggleExpanded} hitSlop={8}>
              <Text style={styles.toggleBtn}>{expanded ? "Hide" : "Show"}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {!expanded && (
        <Text style={styles.collapsedText}>
          {!hasTarget
            ? "Set your target allocation to see rebalancing suggestions."
            : result && result.suggestions.every((s) => s.direction === "ON_TARGET")
            ? "Portfolio is on target across all regions."
            : "Portfolio has target drift. Expand to review the region breakdown and edit targets."}
        </Text>
      )}

      {/* ── Edit form ── */}
      {expanded && editing && (
        <View style={styles.editSection}>
          <Text style={styles.editHint}>
            Set your target allocation — the three buckets must sum to 100%.
          </Text>

          <View style={styles.inputRow}>
            {([
              ["India %", "india"],
              ["US %", "us"],
              ["Cash %", "cash"],
            ] as [string, keyof Draft][]).map(([label, key]) => (
              <View key={key} style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{label}</Text>
                <TextInput
                  style={styles.input}
                  value={draft[key]}
                  onChangeText={(v) => setDraft((prev) => ({ ...prev, [key]: v }))}
                  keyboardType="numeric"
                  maxLength={5}
                  selectTextOnFocus
                  placeholderTextColor={colors.muted}
                />
              </View>
            ))}
          </View>

          <View style={styles.editFooter}>
            <Text style={[styles.sumText, { color: draftValid ? colors.positive : colors.negative }]}>
              {`Sum: ${draftSum.toFixed(0)}%`}
              {draftValid ? "  ✓" : "  — must equal 100%"}
            </Text>
            <View style={styles.btnRow}>
              {hasTarget && (
                <Pressable onPress={() => setEditing(false)} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleSave}
                style={[styles.saveBtn, !draftValid && styles.saveBtnDisabled]}
                disabled={!draftValid}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ── Comparison + recommendations ── */}
      {expanded && !editing && result && result.suggestions.length > 0 && (
        <>
          {/* Column headers */}
          <View style={[styles.compRow, styles.compHeaderRow]}>
            <Text style={[styles.compRegion, styles.compHeader]} />
            <Text style={[styles.compTarget, styles.compHeader]}>Target</Text>
            <Text style={[styles.compCurrent, styles.compHeader]}>Current</Text>
            <Text style={[styles.compDiff, styles.compHeader]}>Diff</Text>
          </View>

          {result.suggestions.map((s) => {
            const diffColor =
              s.direction === "OVERWEIGHT"
                ? colors.negative
                : s.direction === "UNDERWEIGHT"
                ? AMBER
                : colors.positive;
            const diffLabel =
              s.direction === "ON_TARGET"
                ? "—"
                : `${s.diffPct > 0 ? "▲" : "▼"} ${Math.abs(s.diffPct).toFixed(1)}%`;
            return (
              <View key={s.region} style={styles.compRow}>
                <Text style={styles.compRegion}>{s.label}</Text>
                <Text style={styles.compTarget}>{s.targetPct.toFixed(0)}%</Text>
                <Text style={styles.compCurrent}>{s.currentPct.toFixed(1)}%</Text>
                <Text style={[styles.compDiff, { color: diffColor }]}>{diffLabel}</Text>
              </View>
            );
          })}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Plain-English recommendations */}
          <View style={styles.recommendationList}>
            {result.suggestions.every((s) => s.direction === "ON_TARGET") ? (
              <View style={styles.recommendRow}>
                <View style={[styles.recommendDot, { backgroundColor: colors.positive }]} />
                <Text style={styles.recommendText}>
                  Portfolio is on target across all regions.
                </Text>
              </View>
            ) : (
              result.suggestions
                .filter((s) => s.direction !== "ON_TARGET")
                .map((s) => {
                  const isOver = s.direction === "OVERWEIGHT";
                  const dotColor = isOver ? colors.negative : AMBER;
                  const text = isOver
                    ? `Portfolio is overweight ${s.label} by ${Math.abs(s.diffPct).toFixed(1)}%.`
                    : `To rebalance, allocate approximately ${formatMoney(
                        Math.abs(s.diffValue),
                        result.currency
                      )} to ${s.label}.`;
                  return (
                    <View key={s.region} style={styles.recommendRow}>
                      <View style={[styles.recommendDot, { backgroundColor: dotColor }]} />
                      <Text style={styles.recommendText}>{text}</Text>
                    </View>
                  );
                })
            )}
          </View>
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
    marginBottom: spacing.md,
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
  },
  editBtn: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  toggleBtn: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  collapsedText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  // ── Edit form
  editSection: {
    gap: spacing.md,
  },
  editHint: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  inputGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  inputLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.surface,
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlign: "center",
  },
  editFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sumText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  btnRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cancelBtn: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bg,
  },
  cancelBtnText: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  saveBtn: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: colors.accent,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: colors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  // ── Comparison table
  compHeaderRow: {
    marginBottom: spacing.xs,
  },
  compHeader: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  compRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  compRegion: {
    flex: 1,
    color: colors.text,
    fontSize: typography.caption,
  },
  compTarget: {
    width: 52,
    color: colors.muted,
    fontSize: typography.caption,
    textAlign: "right",
  },
  compCurrent: {
    width: 60,
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
    textAlign: "right",
  },
  compDiff: {
    width: 64,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: colors.bg,
    marginVertical: spacing.md,
  },
  // ── Recommendations
  recommendationList: {
    gap: spacing.sm,
  },
  recommendRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  recommendDot: {
    marginTop: 5,
    width: 5,
    height: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  recommendText: {
    flex: 1,
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
});

