import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { radii, spacing, typography, useTheme } from "../theme";
import type { ThemeColors } from "../theme";
import { usePortfolioStore } from "../store/portfolioStore";
import { corporateActionId, type StockSplit } from "../features/portfolio/corporateActionProcessor";

interface StockSplitManagerModalProps {
  visible: boolean;
  onClose: () => void;
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lets users record a stock split/bonus that automatic detection missed (common
 * for Indian equities, where Yahoo's split feed is unreliable) and apply it
 * retroactively to already-imported transactions and holdings. Entries are
 * persisted and re-applied on every launch; removing one reverses its effect.
 */
export function StockSplitManagerModal({ visible, onClose }: StockSplitManagerModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const stockSplits = usePortfolioStore((s) => s.stockSplits);
  const holdings = usePortfolioStore((s) => s.holdings);
  const transactions = usePortfolioStore((s) => s.transactions);
  const addStockSplits = usePortfolioStore((s) => s.addStockSplits);
  const removeStockSplit = usePortfolioStore((s) => s.removeStockSplit);

  const [symbol, setSymbol] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [newShares, setNewShares] = useState("");
  const [oldShares, setOldShares] = useState("1");
  const [error, setError] = useState("");

  // Symbols the user actually holds/traded — offered as quick-fill chips.
  const heldSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings) set.add(h.symbol.trim().toUpperCase());
    for (const t of transactions) set.add(t.symbol.trim().toUpperCase());
    return [...set].filter(Boolean).sort();
  }, [holdings, transactions]);

  const reset = () => {
    setSymbol("");
    setEffectiveDate("");
    setNewShares("");
    setOldShares("1");
    setError("");
  };

  const handleAdd = () => {
    const sym = symbol.trim().toUpperCase();
    const nNew = Number(newShares);
    const nOld = Number(oldShares);

    if (!sym) return setError("Enter the stock symbol.");
    if (!ISO_DATE.test(effectiveDate.trim())) return setError("Enter the ex-date as YYYY-MM-DD.");
    if (!Number.isFinite(nNew) || nNew <= 0) return setError("New shares must be a positive number.");
    if (!Number.isFinite(nOld) || nOld <= 0) return setError("Old shares must be a positive number.");

    const split: StockSplit = {
      type: "split",
      symbol: sym,
      effectiveDate: effectiveDate.trim(),
      ratio: { newShares: nNew, oldShares: nOld },
      label: `${sym} ${nNew}:${nOld} split`,
    };
    addStockSplits([split]);
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Stock Splits</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>Done</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.help}>
              Seeing a wrong average after a split/bonus that wasn’t detected? Add it below (e.g. a 4:1
              split → new 4, old 1). It applies to transactions dated before the ex-date, and can be
              removed to undo.
            </Text>

            {heldSymbols.length > 0 && (
              <View style={styles.chipsRow}>
                {heldSymbols.map((s) => (
                  <Pressable key={s} style={styles.chip} onPress={() => setSymbol(s)}>
                    <Text style={styles.chipText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>Symbol</Text>
            <TextInput
              style={styles.input}
              value={symbol}
              onChangeText={setSymbol}
              placeholder="BAJFINANCE"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
            />

            <Text style={styles.fieldLabel}>Ex / effective date</Text>
            <TextInput
              style={styles.input}
              value={effectiveDate}
              onChangeText={setEffectiveDate}
              placeholder="2025-06-16"
              placeholderTextColor={colors.muted}
            />

            <View style={styles.ratioRow}>
              <View style={styles.ratioCol}>
                <Text style={styles.fieldLabel}>New shares</Text>
                <TextInput
                  style={styles.input}
                  value={newShares}
                  onChangeText={setNewShares}
                  placeholder="4"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                />
              </View>
              <Text style={styles.ratioColon}>:</Text>
              <View style={styles.ratioCol}>
                <Text style={styles.fieldLabel}>Old shares</Text>
                <TextInput
                  style={styles.input}
                  value={oldShares}
                  onChangeText={setOldShares}
                  placeholder="1"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.addBtn} onPress={handleAdd}>
              <Text style={styles.addBtnText}>Add split & re-adjust</Text>
            </Pressable>

            <Text style={styles.listHeader}>Applied splits</Text>
            {stockSplits.length === 0 ? (
              <Text style={styles.empty}>No manual splits added yet.</Text>
            ) : (
              stockSplits.map((s) => {
                const id = corporateActionId(s);
                return (
                  <View key={id} style={styles.listRow}>
                    <View style={styles.listInfo}>
                      <Text style={styles.listSymbol}>{s.symbol ?? s.isin ?? "—"}</Text>
                      <Text style={styles.listMeta}>
                        {s.ratio.newShares}:{s.ratio.oldShares} · {s.effectiveDate}
                      </Text>
                    </View>
                    <Pressable onPress={() => removeStockSplit(id)} hitSlop={8}>
                      <Text style={styles.remove}>Remove</Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    card: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
      maxHeight: "88%",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    title: { color: colors.text, fontSize: typography.subheading, fontWeight: typography.weightBold },
    close: { color: colors.accent, fontSize: typography.body, fontWeight: typography.weightSemibold },
    help: { color: colors.muted, fontSize: typography.caption, lineHeight: 18, marginBottom: spacing.md },
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md },
    chip: {
      backgroundColor: colors.bg,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipText: { color: colors.text, fontSize: typography.caption },
    fieldLabel: {
      color: colors.muted,
      fontSize: typography.caption,
      marginBottom: spacing.xs,
      marginTop: spacing.sm,
    },
    input: {
      backgroundColor: colors.bg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.body,
    },
    ratioRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
    ratioCol: { flex: 1 },
    ratioColon: { color: colors.text, fontSize: typography.subheading, paddingBottom: spacing.sm },
    error: { color: colors.negative, fontSize: typography.caption, marginTop: spacing.sm },
    addBtn: {
      backgroundColor: colors.accent,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: "center",
      marginTop: spacing.md,
    },
    addBtnText: { color: colors.bg, fontSize: typography.body, fontWeight: typography.weightBold },
    listHeader: {
      color: colors.text,
      fontSize: typography.body,
      fontWeight: typography.weightSemibold,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    empty: { color: colors.muted, fontSize: typography.caption },
    listRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    listInfo: { flex: 1 },
    listSymbol: { color: colors.text, fontSize: typography.body, fontWeight: typography.weightSemibold },
    listMeta: { color: colors.muted, fontSize: typography.caption, marginTop: 2 },
    remove: { color: colors.negative, fontSize: typography.caption, fontWeight: typography.weightSemibold },
  });


