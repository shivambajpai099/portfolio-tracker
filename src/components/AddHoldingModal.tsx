import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { PortfolioGuideModal } from "./PortfolioGuideModal";
import { SegmentedControl } from "./SegmentedControl";
import { fetchLivePrices, searchTickerSuggestions } from "../services/yahooFinanceService";
import { applyIndiaAlias, buildIndiaQuoteCandidates } from "../utils/indiaSymbols";
import { colors, spacing } from "../theme";
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

const buildLivePriceCandidates = (symbol: string, currency: Currency): string[] =>
  buildIndiaQuoteCandidates(symbol, currency);

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
  const searchInputRef = useRef<TextInput>(null);

  // Auto-focus the ticker field when the modal opens.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [visible]);

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
    }, 100);

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

  // Compute helper message for disabled Save button
  const disabledHelperMessage = useMemo(() => {
    if (canSubmit) return null;
    
    const missing: string[] = [];
    const qty = parseNumber(quantity);
    const avg = parseNumber(averagePrice);
    const hasValidAccount = holdingAccounts.some((account) => account.id === accountId);
    
    if (customMode) {
      if (!customSymbol.trim()) missing.push("ticker symbol");
      if (!customCompanyName.trim()) missing.push("company name");
    } else {
      if (!selected) missing.push("ticker");
    }
    
    if (!hasValidAccount) missing.push("account");
    if (!(qty > 0)) missing.push("quantity");
    if (!(avg > 0)) missing.push("average price");
    
    if (missing.length === 0) return null;
    return `Enter ${missing.join(" and ")} to continue`;
  }, [canSubmit, customMode, selected, customSymbol, customCompanyName, accountId, quantity, averagePrice, holdingAccounts]);

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

      // Correct known Indian ticker mismatches so price lookups resolve.
      const storedSymbol = customCurrency === "INR" ? applyIndiaAlias(symbol) : symbol;

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
        symbol: storedSymbol,
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
        symbol: selected.currency === "INR" ? applyIndiaAlias(selected.symbol) : selected.symbol,
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
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={styles.iconBadge}>
                  <Text style={styles.iconEmoji}>📈</Text>
                </View>
                <Text style={styles.title}>Add Holding</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={handleClose}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {/* How to fill button */}
            <Pressable style={styles.helpBtn} onPress={() => setShowGuide(true)}>
              <Text style={styles.helpBtnText}>How to fill</Text>
            </Pressable>

            {!customMode ? (
              <>
                <Text style={styles.label}>Search Ticker</Text>
                <TextInput
                  ref={searchInputRef}
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
                  <>
                    {!errorText ? (
                      <Text style={styles.emptyResultsText}>No results for "{query.trim()}"</Text>
                    ) : null}
                    <Pressable style={styles.customModeLink} onPress={handleSwitchToCustomMode}>
                      <Text style={styles.customModeLinkText}>
                        Can't find your ticker? Enter manually →
                      </Text>
                    </Pressable>
                  </>
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

                <Text style={styles.label}>Company Name</Text>
                <TextInput
                  value={customCompanyName}
                  onChangeText={setCustomCompanyName}
                  placeholder="e.g. Dataram Corporation"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Currency</Text>
                <View style={styles.segmentedWrap}>
                  <SegmentedControl
                    options={[
                      { value: "USD", label: "USD" },
                      { value: "INR", label: "INR" },
                    ]}
                    value={customCurrency}
                    onChange={(v) => setCustomCurrency(v as Currency)}
                  />
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.accountChipRow}
                keyboardShouldPersistTaps="handled"
              >
                {holdingAccounts.map((account) => {
                  const active = accountId === account.id;
                  return (
                    <Pressable
                      key={account.id}
                      style={[styles.accountChip, active && styles.accountChipActive]}
                      onPress={() => setAccountId(account.id)}
                    >
                      <Text
                        style={[styles.accountChipText, active && styles.accountChipTextActive]}
                        numberOfLines={1}
                      >
                        {account.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Two-column row for Quantity and Average Price */}
            <View style={styles.twoColumnRow}>
              <View style={styles.columnHalf}>
                <Text style={styles.label}>Quantity</Text>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  placeholder="e.g. 12.5"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
              <View style={styles.columnHalf}>
                <Text style={styles.label}>Average Price</Text>
                <TextInput
                  value={averagePrice}
                  onChangeText={setAveragePrice}
                  placeholder="e.g. 150.00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
            </View>
            <Text style={styles.inputHint}>Total units owned and weighted cost per unit in ticker currency.</Text>

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <Pressable style={styles.cancelBtn} onPress={handleClose} disabled={isSaving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.saveBtn,
                  (!canSubmit || isSaving) && styles.saveBtnDisabled,
                ]}
                onPress={handleCreate}
                disabled={!canSubmit || isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color={colors.bg} size="small" />
                ) : (
                  <Text style={[styles.saveText, !canSubmit && styles.saveTextDisabled]}>
                    Save Holding
                  </Text>
                )}
              </Pressable>
            </View>
            
            {/* Helper message for disabled state */}
            {disabledHelperMessage && !isSaving ? (
              <Text style={styles.disabledHelper}>{disabledHelperMessage}</Text>
            ) : null}
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
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  modalCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#262B33",
    backgroundColor: "#12161C",
    padding: spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#16323A",
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: {
    fontSize: 16,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#1A1F26",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#8A94A3",
    fontSize: 14,
  },
  helpBtn: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262B33",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  helpBtnText: {
    color: "#8A94A3",
    fontSize: 12,
  },
  label: {
    marginTop: spacing.lg,
    marginBottom: 6,
    color: "#8A94A3",
    fontSize: 12,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262B33",
    backgroundColor: "#0E1116",
    color: colors.text,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
  },
  inputHint: {
    marginTop: spacing.xs,
    color: "#8A94A3",
    fontSize: 11,
  },
  segmentedWrap: {
    marginTop: 0,
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: spacing.sm,
  },
  columnHalf: {
    flex: 1,
  },
  loadingRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mutedText: {
    color: "#8A94A3",
    fontSize: 14,
  },
  errorText: {
    marginTop: spacing.md,
    color: colors.negative,
    fontSize: 14,
  },
  suggestionsWrap: {
    marginTop: spacing.md,
    maxHeight: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262B33",
    backgroundColor: "#0E1116",
  },
  suggestionItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#262B33",
    paddingHorizontal: 13,
    paddingVertical: spacing.sm,
  },
  suggestionSymbol: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  suggestionMeta: {
    color: "#8A94A3",
    fontSize: 12,
  },
  selectedCard: {
    marginTop: spacing.lg,
    borderRadius: 10,
    backgroundColor: "#0E1116",
    padding: spacing.md,
  },
  selectedSymbol: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  saveBtn: {
    borderRadius: 10,
    backgroundColor: "#5FD4EB",
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 120,
  },
  saveBtnDisabled: {
    backgroundColor: "#1A1F26",
    borderWidth: 1,
    borderColor: "#262B33",
  },
  actionRow: {
    marginTop: spacing.xxl,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.lg,
  },
  cancelBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262B33",
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  cancelText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyResultsText: {
    marginTop: spacing.md,
    color: "#8A94A3",
    fontSize: 14,
  },
  accountChipRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  accountChip: {
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#262B33",
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 160,
  },
  accountChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  accountChipText: {
    color: colors.text,
    fontSize: 13,
  },
  accountChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  saveText: {
    color: "#0B0C10",
    fontSize: 14,
    fontWeight: "600",
  },
  saveTextDisabled: {
    color: "#5A6472",
  },
  disabledHelper: {
    marginTop: spacing.sm,
    color: "#8A94A3",
    fontSize: 11,
    textAlign: "right",
  },
  // Custom mode styles
  customModeLink: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  customModeLinkText: {
    color: colors.accent,
    fontSize: 12,
  },
  customModeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backToSearchText: {
    color: colors.accent,
    fontSize: 12,
    marginTop: spacing.lg,
  },
  customWarning: {
    marginTop: spacing.md,
    backgroundColor: `${colors.warning}22`,
    borderRadius: 10,
    padding: spacing.md,
  },
  customWarningText: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 18,
  },
});
