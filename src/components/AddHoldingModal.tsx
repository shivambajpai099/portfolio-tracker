import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { PortfolioGuideModal } from "./PortfolioGuideModal";
import { fetchLivePrices, searchTickerSuggestions } from "../services/yahooFinanceService";
import { colors, radii, spacing, typography } from "../theme";
import type { TickerSuggestion } from "../types/marketData";
import { accountSupportsHoldings, type Account, type Currency } from "../types/portfolio";

interface AddHoldingInput {
  accountId: string;
  symbol: string;
  companyName: string;
  currency: Currency;
  quantity: number;
  averagePrice: number;
  marketPrice: number;
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

const buildLivePriceCandidates = (symbol: string, currency: Currency): string[] => {
  const normalized = symbol.trim().toUpperCase();
  const candidates = new Set<string>([normalized]);

  if (currency === "INR" && !normalized.endsWith(".NS") && !normalized.endsWith(".BO")) {
    candidates.add(`${normalized}.NS`);
    candidates.add(`${normalized}.BO`);
  }

  return [...candidates];
};

export function AddHoldingModal({ visible, accounts, onClose, onCreate }: AddHoldingModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedTicker | null>(null);
  const [accountId, setAccountId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [averagePrice, setAveragePrice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceLoading, setLivePriceLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [suggestions, setSuggestions] = useState<SelectedTicker[]>([]);
  const [showGuide, setShowGuide] = useState(false);

  // Custom symbol mode - allows entering tickers not found in search
  const [customMode, setCustomMode] = useState(false);
  const [customSymbol, setCustomSymbol] = useState("");
  const [customCompanyName, setCustomCompanyName] = useState("");
  const [customCurrency, setCustomCurrency] = useState<Currency>("USD");

  const holdingAccounts = useMemo(
    () => accounts.filter((account) => accountSupportsHoldings(account.type)),
    [accounts]
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    setAccountId((prev) => {
      if (prev && holdingAccounts.some((account) => account.id === prev)) {
        return prev;
      }
      return holdingAccounts[0]?.id || "";
    });
  }, [visible, holdingAccounts]);

  useEffect(() => {
    if (!visible || customMode) {
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
  }, [query, selected, visible, customMode]);

  useEffect(() => {
    if (!visible || !selected) {
      setLivePrice(null);
      setLivePriceLoading(false);
      return;
    }

    const controller = new AbortController();
    setLivePriceLoading(true);
    fetchLivePrices(buildLivePriceCandidates(selected.symbol, selected.currency), controller.signal)
      .then((result) => {
        if (result.ok && result.data[0]?.price) {
          setLivePrice(result.data[0].price);
        } else {
          setLivePrice(null);
        }
      })
      .catch(() => {
        setLivePrice(null);
      })
      .finally(() => {
        setLivePriceLoading(false);
      });

    return () => controller.abort();
  }, [selected, visible]);

  // canSubmit for search mode
  const canSubmitSearch = useMemo(() => {
    const qty = parseNumber(quantity);
    const avg = parseNumber(averagePrice);
    const hasValidAccount = holdingAccounts.some((account) => account.id === accountId);
    return Boolean(selected && hasValidAccount && qty > 0 && avg > 0);
  }, [selected, accountId, quantity, averagePrice, holdingAccounts]);

  // canSubmit for custom mode
  const canSubmitCustom = useMemo(() => {
    const qty = parseNumber(quantity);
    const avg = parseNumber(averagePrice);
    const hasValidAccount = holdingAccounts.some((account) => account.id === accountId);
    const hasSymbol = customSymbol.trim().length > 0;
    const hasCompanyName = customCompanyName.trim().length > 0;
    return Boolean(hasValidAccount && hasSymbol && hasCompanyName && qty > 0 && avg > 0);
  }, [accountId, quantity, averagePrice, holdingAccounts, customSymbol, customCompanyName]);

  const canSubmit = customMode ? canSubmitCustom : canSubmitSearch;

  const resetState = () => {
    setQuery("");
    setSelected(null);
    setQuantity("");
    setAveragePrice("");
    setSuggestions([]);
    setIsLoading(false);
    setIsSaving(false);
    setErrorText("");
    setCustomMode(false);
    setCustomSymbol("");
    setCustomCompanyName("");
    setCustomCurrency("USD");
  };

  const handleClose = () => {
    resetState();
    setShowGuide(false);
    onClose();
  };

  const handleSelectTicker = (item: SelectedTicker) => {
    setSelected(item);
    setQuery(item.symbol);
    setSuggestions([]);
    setErrorText("");
  };

  const handleSwitchToCustomMode = () => {
    setCustomMode(true);
    setCustomSymbol(query.trim().toUpperCase());
    setSelected(null);
    setSuggestions([]);
  };

  const handleSwitchToSearchMode = () => {
    setCustomMode(false);
    setQuery(customSymbol);
    setCustomSymbol("");
    setCustomCompanyName("");
  };

  const handleCreate = async () => {
    const qty = parseNumber(quantity);
    const avg = parseNumber(averagePrice);
    const hasValidAccount = holdingAccounts.some((account) => account.id === accountId);
    
    if (!hasValidAccount || qty <= 0 || avg <= 0) {
      return;
    }

    if (customMode) {
      // Custom mode: use manually entered values
      const symbol = customSymbol.trim().toUpperCase();
      const companyName = customCompanyName.trim();
      
      if (!symbol || !companyName) {
        return;
      }

      setIsSaving(true);

      let marketPrice = avg;
      try {
        const result = await fetchLivePrices(buildLivePriceCandidates(symbol, customCurrency));
        if (result.ok && result.data[0]?.price) {
          marketPrice = result.data[0].price;
        }
      } catch {
        // Keep avg price as market price fallback
      }

      onCreate({
        accountId,
        symbol,
        companyName,
        currency: customCurrency,
        quantity: qty,
        averagePrice: avg,
        marketPrice,
      });

      handleClose();
    } else {
      // Search mode: use selected ticker
      if (!selected) {
        return;
      }

      setIsSaving(true);

      let marketPrice = livePrice ?? avg;
      try {
        if (livePrice == null) {
          const result = await fetchLivePrices(buildLivePriceCandidates(selected.symbol, selected.currency));
          if (result.ok && result.data[0]?.price) {
            marketPrice = result.data[0].price;
          }
        }
      } catch {
        // Keep marketPrice fallback to the average buy price so add flow remains offline-safe.
      }

      onCreate({
        accountId,
        symbol: selected.symbol,
        companyName: selected.companyName,
        currency: selected.currency,
        quantity: qty,
        averagePrice: avg,
        marketPrice,
      });

      handleClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.modalCard}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Add Holding</Text>
              <Pressable style={styles.helpBtn} onPress={() => setShowGuide(true)}>
                <Text style={styles.helpBtnText}>How to fill</Text>
              </Pressable>
            </View>

            {!customMode ? (
              <>
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
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
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

                {/* Show "Can't find ticker?" link when search returns no results and query has content */}
                {!isLoading && suggestions.length === 0 && query.trim().length >= 2 && !selected ? (
                  <Pressable style={styles.customModeLink} onPress={handleSwitchToCustomMode}>
                    <Text style={styles.customModeLinkText}>
                      Can't find your ticker? Enter manually →
                    </Text>
                  </Pressable>
                ) : null}

                {selected ? (
                  <View style={styles.selectedCard}>
                    <Text style={styles.selectedSymbol}>{selected.symbol}</Text>
                    <Text style={styles.suggestionMeta}>{selected.companyName}</Text>
                    <Text style={styles.suggestionMeta}>{selected.exchange} - {selected.currency}</Text>
                    <Text style={styles.suggestionMeta}>
                      Current price: {livePriceLoading ? "Loading..." : livePrice != null ? `${livePrice.toFixed(2)} ${selected.currency}` : "Unavailable"}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {/* Custom symbol mode */}
                <View style={styles.customModeHeader}>
                  <Text style={styles.label}>Manual Entry</Text>
                  <Pressable onPress={handleSwitchToSearchMode}>
                    <Text style={styles.backToSearchText}>← Back to search</Text>
                  </Pressable>
                </View>

                <TextInput
                  value={customSymbol}
                  onChangeText={(value) => setCustomSymbol(value.toUpperCase())}
                  placeholder="Ticker symbol (e.g. DRAM)"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  style={styles.input}
                />

                <TextInput
                  value={customCompanyName}
                  onChangeText={setCustomCompanyName}
                  placeholder="Company name (e.g. Dataram Corporation)"
                  placeholderTextColor={colors.muted}
                  style={styles.inputCompact}
                />

                <Text style={styles.label}>Currency</Text>
                <View style={styles.pillRow}>
                  {(["USD", "INR"] as Currency[]).map((curr) => {
                    const active = customCurrency === curr;
                    return (
                      <Pressable
                        key={curr}
                        style={[styles.pill, active && styles.pillActive]}
                        onPress={() => setCustomCurrency(curr)}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>{curr}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.customWarning}>
                  <Text style={styles.customWarningText}>
                    ⚠ Price updates may not work for unrecognized symbols. The holding will be tracked at cost basis.
                  </Text>
                </View>
              </>
            )}

            <Text style={styles.label}>Account</Text>
            {holdingAccounts.length === 0 ? (
              <Text style={styles.errorText}>Create a BROKER account before adding holdings.</Text>
            ) : (
              <View style={styles.pillRow}>
                {holdingAccounts.map((account) => {
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
            )}

            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              placeholder="Quantity"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              style={styles.inputCompact}
            />
            <Text style={styles.inputHint}>Quantity = total units you currently own (for example, 12.5).</Text>
            <TextInput
              value={averagePrice}
              onChangeText={setAveragePrice}
              placeholder="Average buy price"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              style={styles.inputCompact}
            />
            <Text style={styles.inputHint}>Average buy price = weighted cost per unit in the same currency as the ticker.</Text>

            <View style={styles.actionsRow}>
              <Pressable style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, (!canSubmit || isSaving) && styles.saveBtnDisabled]}
                onPress={handleCreate}
                disabled={!canSubmit || isSaving}
              >
                <Text style={[styles.saveText, (!canSubmit || isSaving) && styles.saveTextDisabled]}>
                  {isSaving ? "Saving..." : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
      <PortfolioGuideModal visible={showGuide} onClose={() => setShowGuide(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  modalCard: {
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  helpBtn: {
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  helpBtnText: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
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
  inputHint: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typography.micro,
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
  // Custom mode styles
  customModeLink: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  customModeLinkText: {
    color: colors.accent,
    fontSize: typography.caption,
  },
  customModeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backToSearchText: {
    color: colors.accent,
    fontSize: typography.caption,
    marginTop: spacing.lg,
  },
  customWarning: {
    marginTop: spacing.md,
    backgroundColor: `${colors.warning}22`,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  customWarningText: {
    color: colors.warning,
    fontSize: typography.caption,
    lineHeight: 20,
  },
});
