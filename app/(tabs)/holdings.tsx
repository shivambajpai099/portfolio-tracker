import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AddHoldingModal } from "../../src/components/AddHoldingModal";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { toINR, toUSD } from "../../src/features/portfolio/selectors";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors, radii, spacing, typography } from "../../src/theme";
import type { Currency, Holding } from "../../src/types/portfolio";
import { formatMoney } from "../../src/utils/format";

type SortKey = "current_desc" | "allocation_desc" | "gain_desc" | "ticker_asc";
type PerfFilter = "ALL" | "GAIN" | "LOSS";
type CurrencyFilter = "ALL" | Currency;

type GroupedHolding = {
  symbol: string;
  companyName: string;
  investedValue: number;
  currentValue: number;
  gainLoss: number;
  allocationPct: number;
  linkedAccountsLabel: string[];
  currencies: Currency[];
  lots: Holding[];
};

type EditDraft = {
  accountId: string;
  quantity: string;
  averagePrice: string;
  marketPrice: string;
};

const nowIso = () => new Date().toISOString();
const createHoldingId = () => `h-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const parseNumber = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

export default function HoldingsScreen() {
  const settings = usePortfolioStore((state) => state.settings);
  const accounts = usePortfolioStore((state) => state.accounts);
  const fxRates = usePortfolioStore((state) => state.fxRates);
  const holdings = usePortfolioStore((state) => state.holdings);
  const addHolding = usePortfolioStore((state) => state.addHolding);
  const updateHolding = usePortfolioStore((state) => state.updateHolding);
  const removeHolding = usePortfolioStore((state) => state.removeHolding);

  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("current_desc");
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("ALL");
  const [perfFilter, setPerfFilter] = useState<PerfFilter>("ALL");
  const [expandedSymbols, setExpandedSymbols] = useState<Record<string, boolean>>({});
  const [isAddVisible, setIsAddVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holding | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({
    accountId: "",
    quantity: "",
    averagePrice: "",
    marketPrice: "",
  });

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(account.id, `${account.name} (${account.owner})`);
    }
    return map;
  }, [accounts]);

  const toReportingCurrency = (value: number, currency: Currency): number => {
    if (settings.reportingCurrency === "INR") {
      return toINR(value, currency, fxRates);
    }
    return toUSD(value, currency, fxRates);
  };

  const groupedHoldings = useMemo<GroupedHolding[]>(() => {
    const grouped = new Map<string, GroupedHolding>();

    for (const holding of holdings) {
      const symbol = holding.symbol.toUpperCase();
      const invested = toReportingCurrency(holding.quantity * holding.averagePrice, holding.currency);
      const current = toReportingCurrency(holding.quantity * holding.marketPrice, holding.currency);

      const existing = grouped.get(symbol);
      if (!existing) {
        grouped.set(symbol, {
          symbol,
          companyName: holding.companyName,
          investedValue: invested,
          currentValue: current,
          gainLoss: current - invested,
          allocationPct: 0,
          linkedAccountsLabel: [accountNameById.get(holding.accountId) ?? holding.accountId],
          currencies: [holding.currency],
          lots: [holding],
        });
        continue;
      }

      existing.investedValue += invested;
      existing.currentValue += current;
      existing.gainLoss = existing.currentValue - existing.investedValue;
      const accountLabel = accountNameById.get(holding.accountId) ?? holding.accountId;
      if (!existing.linkedAccountsLabel.includes(accountLabel)) {
        existing.linkedAccountsLabel.push(accountLabel);
      }
      if (!existing.currencies.includes(holding.currency)) {
        existing.currencies.push(holding.currency);
      }
      existing.lots.push(holding);
    }

    const values = [...grouped.values()];
    const totalCurrent = values.reduce((sum, item) => sum + item.currentValue, 0);
    for (const item of values) {
      item.allocationPct = totalCurrent > 0 ? (item.currentValue / totalCurrent) * 100 : 0;
    }

    return values;
  }, [holdings, accountNameById, settings.reportingCurrency, fxRates.USDINR]);

  const visibleGroups = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return groupedHoldings
      .filter((group) => {
        const matchesQuery =
          query.length === 0 ||
          group.symbol.toLowerCase().includes(query) ||
          group.companyName.toLowerCase().includes(query) ||
          group.linkedAccountsLabel.join(" ").toLowerCase().includes(query);
        const matchesCurrency = currencyFilter === "ALL" || group.currencies.includes(currencyFilter);
        const matchesPerf =
          perfFilter === "ALL" ||
          (perfFilter === "GAIN" && group.gainLoss >= 0) ||
          (perfFilter === "LOSS" && group.gainLoss < 0);

        return matchesQuery && matchesCurrency && matchesPerf;
      })
      .sort((a, b) => {
        if (sortKey === "ticker_asc") {
          return a.symbol.localeCompare(b.symbol);
        }
        if (sortKey === "allocation_desc") {
          return b.allocationPct - a.allocationPct;
        }
        if (sortKey === "gain_desc") {
          return b.gainLoss - a.gainLoss;
        }
        return b.currentValue - a.currentValue;
      });
  }, [groupedHoldings, searchText, currencyFilter, perfFilter, sortKey]);

  const openEdit = (holding: Holding) => {
    setEditTarget(holding);
    setEditDraft({
      accountId: holding.accountId,
      quantity: String(holding.quantity),
      averagePrice: String(holding.averagePrice),
      marketPrice: String(holding.marketPrice),
    });
  };

  const submitEdit = () => {
    if (!editTarget) {
      return;
    }

    const quantity = parseNumber(editDraft.quantity);
    const averagePrice = parseNumber(editDraft.averagePrice);
    const marketPrice = parseNumber(editDraft.marketPrice);

    if (!editDraft.accountId || quantity <= 0 || averagePrice <= 0 || marketPrice <= 0) {
      return;
    }

    updateHolding(editTarget.id, {
      accountId: editDraft.accountId,
      quantity,
      averagePrice,
      marketPrice,
      updatedAt: nowIso(),
    });

    setEditTarget(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    removeHolding(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Holdings</Text>
        <Pressable style={styles.addBtn} onPress={() => setIsAddVisible(true)}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {/* Search */}
      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search ticker, company or account"
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
      />

      {/* Sort chips */}
      <View style={styles.chipWrap}>
        {([
          ["current_desc", "Value"],
          ["allocation_desc", "Alloc"],
          ["gain_desc", "Gain"],
          ["ticker_asc", "A-Z"],
        ] as const).map(([key, label]) => {
          const active = sortKey === key;
          return (
            <Pressable key={key} style={[styles.chip, active && styles.chipActive]} onPress={() => setSortKey(key)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}

        <View style={styles.divider} />

        {(["ALL", "INR", "USD"] as CurrencyFilter[]).map((value) => {
          const active = currencyFilter === value;
          return (
            <Pressable key={value} style={[styles.chip, active && styles.chipActive]} onPress={() => setCurrencyFilter(value)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{value}</Text>
            </Pressable>
          );
        })}

        {(["ALL", "GAIN", "LOSS"] as PerfFilter[]).map((value) => {
          const active = perfFilter === value;
          return (
            <Pressable key={value} style={[styles.chip, active && styles.chipActive]} onPress={() => setPerfFilter(value)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{value}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.listWrap}>
          {visibleGroups.map((group) => {
            const isExpanded = Boolean(expandedSymbols[group.symbol]);

            return (
              <View key={group.symbol} style={styles.groupCard}>
                <Pressable onPress={() => setExpandedSymbols((prev) => ({ ...prev, [group.symbol]: !prev[group.symbol] }))}>
                  {/* Symbol + allocation % */}
                  <View style={styles.groupTitleRow}>
                    <View style={styles.groupTitleWrap}>
                      <Text style={styles.groupSymbol}>{group.symbol}</Text>
                      <Text style={styles.groupName}>{group.companyName}</Text>
                    </View>
                    <Text style={styles.groupAllocation}>{group.allocationPct.toFixed(1)}%</Text>
                  </View>

                  {/* Allocation bar */}
                  <View style={styles.allocTrack}>
                    <View style={[styles.allocFill, { width: `${group.allocationPct}%` }]} />
                  </View>

                  {/* Metrics row */}
                  <View style={styles.metricRow}>
                    <View>
                      <Text style={styles.metricLabel}>Current</Text>
                      <Text style={styles.metricValue}>{formatMoney(group.currentValue, settings.reportingCurrency)}</Text>
                    </View>
                    <View style={styles.metricCenter}>
                      <Text style={styles.metricLabel}>Invested</Text>
                      <Text style={styles.metricValue}>{formatMoney(group.investedValue, settings.reportingCurrency)}</Text>
                    </View>
                    <View style={styles.metricRight}>
                      <Text style={styles.metricLabel}>Gain/Loss</Text>
                      <Text style={[styles.metricValue, group.gainLoss >= 0 ? styles.positiveText : styles.negativeText]}>
                        {formatMoney(group.gainLoss, settings.reportingCurrency)}
                      </Text>
                    </View>
                  </View>
                </Pressable>

                {/* Account chips */}
                <View style={styles.accountChipWrap}>
                  {group.linkedAccountsLabel.map((label) => (
                    <Text key={`${group.symbol}-${label}`} style={styles.accountChip}>{label}</Text>
                  ))}
                </View>

                {/* Expanded lots */}
                {isExpanded ? (
                  <View style={styles.expandedWrap}>
                    {group.lots.map((lot) => (
                      <View key={lot.id} style={styles.lotRow}>
                        <View style={styles.lotInfo}>
                          <Text style={styles.lotAccount}>{accountNameById.get(lot.accountId) ?? lot.accountId}</Text>
                          <Text style={styles.lotMeta}>
                            {lot.quantity} shares · avg {formatMoney(lot.averagePrice, lot.currency)}
                          </Text>
                        </View>
                        <View style={styles.lotActions}>
                          <Pressable onPress={() => openEdit(lot)}>
                            <Text style={styles.editText}>Edit</Text>
                          </Pressable>
                          <Pressable onPress={() => setDeleteTarget(lot)}>
                            <Text style={styles.deleteText}>Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}

          {visibleGroups.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No holdings match current filters.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <AddHoldingModal
        visible={isAddVisible}
        accounts={accounts}
        onClose={() => setIsAddVisible(false)}
        onCreate={(input) => {
          addHolding({
            id: createHoldingId(),
            accountId: input.accountId,
            symbol: input.symbol,
            companyName: input.companyName,
            quantity: input.quantity,
            averagePrice: input.averagePrice,
            marketPrice: input.averagePrice,
            currency: input.currency,
            asOf: nowIso(),
            updatedAt: nowIso(),
          });
        }}
      />

      <Modal visible={Boolean(editTarget)} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Holding</Text>
            <Text style={styles.modalSubTitle}>{editTarget?.symbol} · {editTarget?.companyName}</Text>

            <Text style={styles.modalLabel}>Account</Text>
            <View style={styles.modalPillRow}>
              {accounts.map((account) => {
                const active = editDraft.accountId === account.id;
                return (
                  <Pressable
                    key={account.id}
                    style={[styles.modalPill, active && styles.modalPillActive]}
                    onPress={() => setEditDraft((prev) => ({ ...prev, accountId: account.id }))}
                  >
                    <Text style={[styles.modalPillText, active && styles.modalPillTextActive]}>{account.name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={editDraft.quantity}
              onChangeText={(value) => setEditDraft((prev) => ({ ...prev, quantity: value }))}
              placeholder="Quantity"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              style={styles.modalInput}
            />
            <TextInput
              value={editDraft.averagePrice}
              onChangeText={(value) => setEditDraft((prev) => ({ ...prev, averagePrice: value }))}
              placeholder="Average buy price"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              style={styles.modalInputCompact}
            />
            <TextInput
              value={editDraft.marketPrice}
              onChangeText={(value) => setEditDraft((prev) => ({ ...prev, marketPrice: value }))}
              placeholder="Current market price"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              style={styles.modalInputCompact}
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setEditTarget(null)}>
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={submitEdit}>
                <Text style={styles.primaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(deleteTarget)} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete holding?</Text>
            <Text style={styles.modalDangerText}>This removes {deleteTarget?.symbol} permanently.</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setDeleteTarget(null)}>
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={confirmDelete}>
                <Text style={styles.primaryText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginBottom: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  addBtn: {
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  addBtnText: {
    color: colors.bg,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  searchInput: {
    marginBottom: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: typography.body,
  },
  chipWrap: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
  },
  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  chipTextActive: {
    color: colors.bg,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: spacing.xs,
    backgroundColor: "#252932",
  },
  listWrap: {
    marginTop: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  groupCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  groupTitleRow: {
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  groupTitleWrap: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  groupSymbol: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  groupName: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typography.caption,
  },
  groupAllocation: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  allocTrack: {
    marginBottom: spacing.md,
    height: 6,
    width: "100%",
    overflow: "hidden",
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
  },
  allocFill: {
    width: "30%",
    height: "100%",
    backgroundColor: colors.accent,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricCenter: {
    alignItems: "center",
  },
  metricRight: {
    alignItems: "flex-end",
  },
  metricLabel: {
    color: colors.muted,
    fontSize: typography.micro,
  },
  metricValue: {
    marginTop: 2,
    color: colors.text,
    fontSize: typography.body,
  },
  accountChipWrap: {
    marginTop: spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  accountChip: {
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    color: colors.muted,
    fontSize: typography.micro,
  },
  expandedWrap: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "#1E2128",
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  lotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  lotInfo: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  lotAccount: {
    color: colors.text,
    fontSize: typography.caption,
  },
  lotMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typography.micro,
  },
  lotActions: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  editText: {
    color: colors.accent,
    fontSize: typography.caption,
  },
  deleteText: {
    color: colors.negative,
    fontSize: typography.caption,
  },
  emptyWrap: {
    marginTop: spacing.xxxl,
    alignItems: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: typography.body,
  },
  positiveText: {
    color: colors.positive,
  },
  negativeText: {
    color: colors.negative,
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: "100%",
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  modalSubTitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typography.body,
  },
  modalLabel: {
    marginTop: spacing.xl,
    color: colors.muted,
    fontSize: typography.caption,
  },
  modalPillRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  modalPill: {
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  modalPillActive: {
    backgroundColor: colors.accent,
  },
  modalPillText: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  modalPillTextActive: {
    color: colors.bg,
  },
  modalInput: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalInputCompact: {
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalActions: {
    marginTop: spacing.xxl,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
  },
  ghostBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  ghostText: {
    color: colors.muted,
  },
  primaryBtn: {
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  dangerBtn: {
    borderRadius: radii.lg,
    backgroundColor: colors.negative,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  primaryText: {
    color: colors.text,
    fontWeight: typography.weightSemibold,
  },
  modalDangerText: {
    marginTop: spacing.sm,
    color: colors.muted,
    fontSize: typography.body,
  },
});
