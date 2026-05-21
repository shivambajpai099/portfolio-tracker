import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { searchTickerSuggestions } from "../services/yahooFinanceService";
import { colors, radii, spacing, typography } from "../theme";
import type { TickerSuggestion } from "../types/marketData";
import type { Account, Currency } from "../types/portfolio";

interface AddHoldingInput {
  accountId: string;
  symbol: string;
  companyName: string;
  currency: Currency;
  quantity: number;
  averagePrice: number;
}

interface AddHoldingModalProps {
  visible: boolean;
  accounts: Account[];
  onClose: () => void;
  onCreate: (input: AddHoldingInput) => void;
}

type SelectedTicker = TickerSuggestion;

const parseNumber = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

export function AddHoldingModal({ visible, accounts, onClose, onCreate }: AddHoldingModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedTicker | null>(null);
  const [accountId, setAccountId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [averagePrice, setAveragePrice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [suggestions, setSuggestions] = useState<SelectedTicker[]>([]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setAccountId((prev) => prev || accounts[0]?.id || "");
  }, [visible, accounts]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 2 || selected?.symbol === trimmed.toUpperCase()) {
      setSuggestions([]);
      setIsLoading(false);
      setErrorText("");
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      setIsLoading(true);
      searchTickerSuggestions(trimmed, controller.signal)
        .then((result) => {
          setSuggestions(result.data ?? []);
          setErrorText(result.ok ? "" : result.error.message);
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          setSuggestions([]);
          setErrorText("Could not load ticker suggestions.");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, selected, visible]);

  const canSubmit = useMemo(() => {
    const qty = parseNumber(quantity);
    const avg = parseNumber(averagePrice);
    return Boolean(selected && accountId && qty > 0 && avg > 0);
  }, [selected, accountId, quantity, averagePrice]);

  const resetState = () => {
    setQuery("");
    setSelected(null);
    setQuantity("");
    setAveragePrice("");
    setSuggestions([]);
    setIsLoading(false);
    setErrorText("");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSelectTicker = (item: SelectedTicker) => {
    setSelected(item);
    setQuery(item.symbol);
    setSuggestions([]);
  };

  const handleCreate = () => {
    if (!selected) {
      return;
    }

    const qty = parseNumber(quantity);
    const avg = parseNumber(averagePrice);
    if (!accountId || qty <= 0 || avg <= 0) {
      return;
    }

    onCreate({
      accountId,
      symbol: selected.symbol,
      companyName: selected.companyName,
      currency: selected.currency,
      quantity: qty,
      averagePrice: avg,
    });

    handleClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.title}>Add Holding</Text>

          <Text style={styles.label}>Search Ticker</Text>
          <TextInput
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setSelected(null);
            }}
            placeholder="e.g. AAPL, RELIANCE.NS"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            style={styles.input}
          />

          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.mutedText}>Searching...</Text>
            </View>
          ) : null}

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          {suggestions.length > 0 ? (
            <View style={styles.suggestionsWrap}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {suggestions.map((item) => (
                  <Pressable
                    key={`${item.symbol}-${item.exchange}`}
                    style={styles.suggestionItem}
                    onPress={() => handleSelectTicker(item)}
                  >
                    <Text style={styles.suggestionSymbol}>{item.symbol}</Text>
                    <Text style={styles.suggestionMeta}>{item.companyName}</Text>
                    <Text style={styles.suggestionMeta}>{item.exchange} - {item.currency}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {selected ? (
            <View style={styles.selectedCard}>
              <Text style={styles.selectedSymbol}>{selected.symbol}</Text>
              <Text style={styles.suggestionMeta}>{selected.companyName}</Text>
              <Text style={styles.suggestionMeta}>{selected.exchange} - {selected.currency}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Account</Text>
          <View style={styles.pillRow}>
            {accounts.map((account) => {
              const active = accountId === account.id;
              return (
                <Pressable
                  key={account.id}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setAccountId(account.id)}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{account.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder="Quantity"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            style={styles.inputCompact}
          />
          <TextInput
            value={averagePrice}
            onChangeText={setAveragePrice}
            placeholder="Average buy price"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            style={styles.inputCompact}
          />

          <View style={styles.actionsRow}>
            <Pressable style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveBtn, !canSubmit && styles.saveBtnDisabled]} onPress={handleCreate}>
              <Text style={[styles.saveText, !canSubmit && styles.saveTextDisabled]}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    maxHeight: "90%",
    width: "100%",
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  label: {
    marginTop: spacing.lg,
    color: colors.muted,
    fontSize: typography.body,
  },
  input: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#252932",
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputCompact: {
    marginTop: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#252932",
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  loadingRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mutedText: {
    color: colors.muted,
    fontSize: typography.body,
  },
  errorText: {
    marginTop: spacing.md,
    color: colors.negative,
    fontSize: typography.body,
  },
  suggestionsWrap: {
    marginTop: spacing.md,
    maxHeight: 160,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#252932",
    backgroundColor: colors.bg,
  },
  suggestionItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#1E2128",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  suggestionSymbol: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  suggestionMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  selectedCard: {
    marginTop: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    padding: spacing.md,
  },
  selectedSymbol: {
    color: colors.text,
    fontSize: typography.body,
  },
  pillRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pill: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
  },
  pillActive: {
    backgroundColor: colors.accent,
  },
  pillText: {
    color: colors.text,
    fontSize: typography.body,
  },
  pillTextActive: {
    color: colors.bg,
  },
  actionsRow: {
    marginTop: spacing.xxl,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  cancelBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.muted,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelText: {
    color: colors.muted,
  },
  saveBtn: {
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  saveBtnDisabled: {
    backgroundColor: "#39414F",
  },
  saveText: {
    color: colors.bg,
    fontWeight: typography.weightSemibold,
  },
  saveTextDisabled: {
    color: colors.muted,
  },
});
