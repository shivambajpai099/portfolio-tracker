import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { convert } from "../../src/features/portfolio/calculations";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors, radii, spacing, typography } from "../../src/theme";
import type { Account, AccountType, CashHolding, Currency } from "../../src/types/portfolio";
import { formatMoney } from "../../src/utils/format";

type AccountDraft = {
  name: string;
  owner: string;
  broker: string;
  type: AccountType;
  baseCurrency: Currency;
};

const emptyDraft: AccountDraft = {
  name: "",
  owner: "",
  broker: "",
  type: "BROKER",
  baseCurrency: "INR",
};

const nowIso = () => new Date().toISOString();
const createAccountId = () => `acc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const createCashId = () => `cash-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export default function AccountsScreen() {
  const holdings = usePortfolioStore((state) => state.holdings);
  const cashHoldings = usePortfolioStore((state) => state.cashHoldings);
  const accounts = usePortfolioStore((state) => state.accounts);
  const fxRates = usePortfolioStore((state) => state.fxRates);
  const addAccount = usePortfolioStore((state) => state.addAccount);
  const updateAccount = usePortfolioStore((state) => state.updateAccount);
  const removeAccount = usePortfolioStore((state) => state.removeAccount);
  const addCashHolding = usePortfolioStore((state) => state.addCashHolding);
  const updateCashHolding = usePortfolioStore((state) => state.updateCashHolding);
  const removeCashHolding = usePortfolioStore((state) => state.removeCashHolding);

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [savingsInitialBalance, setSavingsInitialBalance] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  // cash inline-edit: key = cashHolding.id, value = draft string
  const [cashEditValues, setCashEditValues] = useState<Record<string, string>>({});
  // tracks which cash rows are in edit mode
  const [cashEditActive, setCashEditActive] = useState<Record<string, boolean>>({});

  const cashByAccount = useMemo(() => {
    const map = new Map<string, CashHolding[]>();
    for (const cash of cashHoldings) {
      const list = map.get(cash.accountId) ?? [];
      list.push(cash);
      map.set(cash.accountId, list);
    }
    return map;
  }, [cashHoldings]);

  const accountMetrics = useMemo(() => {
    const map = new Map<string, { currentValue: number; investedValue: number }>();
    const accountCurrency = new Map<string, Currency>();

    for (const account of accounts) {
      map.set(account.id, { currentValue: 0, investedValue: 0 });
      accountCurrency.set(account.id, account.baseCurrency);
    }

    for (const holding of holdings) {
      const metric = map.get(holding.accountId);
      if (!metric) {
        continue;
      }
      const toCurrency = accountCurrency.get(holding.accountId);
      if (!toCurrency) {
        continue;
      }

      metric.currentValue += convert(holding.quantity * holding.marketPrice, holding.currency, toCurrency, fxRates);
      metric.investedValue += convert(holding.quantity * holding.averagePrice, holding.currency, toCurrency, fxRates);
    }

    for (const cashHolding of cashHoldings) {
      const metric = map.get(cashHolding.accountId);
      if (!metric) {
        continue;
      }
      const toCurrency = accountCurrency.get(cashHolding.accountId);
      if (!toCurrency) {
        continue;
      }

      const convertedCash = convert(cashHolding.balance, cashHolding.currency, toCurrency, fxRates);
      metric.currentValue += convertedCash;
      metric.investedValue += convertedCash;
    }

    return map;
  }, [accounts, holdings, cashHoldings, fxRates]);

  const startEditCash = (cash: CashHolding) => {
    setCashEditValues((prev) => ({ ...prev, [cash.id]: String(cash.balance) }));
    setCashEditActive((prev) => ({ ...prev, [cash.id]: true }));
  };

  const commitEditCash = (cash: CashHolding) => {
    const raw = cashEditValues[cash.id] ?? "";
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      updateCashHolding(cash.id, { balance: parsed, updatedAt: nowIso() });
    }
    setCashEditActive((prev) => ({ ...prev, [cash.id]: false }));
  };

  const addCashForAccount = (accountId: string, currency: Currency) => {
    // prevent duplicate currency per account
    const existing = cashByAccount.get(accountId) ?? [];
    if (existing.some((c) => c.currency === currency)) return;
    addCashHolding({ id: createCashId(), accountId, currency, balance: 0, updatedAt: nowIso() });
  };

  const openAddModal = () => {
    setEditingAccountId(null);
    setDraft(emptyDraft);
    setSavingsInitialBalance("");
    setIsFormVisible(true);
  };

  const openEditModal = (account: Account) => {
    setEditingAccountId(account.id);
    setDraft({
      name: account.name,
      owner: account.owner,
      broker: account.broker,
      type: account.type,
      baseCurrency: account.baseCurrency,
    });
    setSavingsInitialBalance("");
    setIsFormVisible(true);
  };

  const closeFormModal = () => {
    setIsFormVisible(false);
    setEditingAccountId(null);
    setDraft(emptyDraft);
    setSavingsInitialBalance("");
  };

  const submitForm = () => {
    const trimmedName = draft.name.trim();
    const trimmedOwner = draft.owner.trim();
    const trimmedBroker = draft.broker.trim();
    const isSavings = draft.type === "SAVINGS";

    if (!trimmedName || !trimmedOwner) return;
    if (!isSavings && !trimmedBroker) return;

    if (editingAccountId) {
      updateAccount(editingAccountId, {
        name: trimmedName,
        owner: trimmedOwner,
        broker: trimmedBroker,
        type: draft.type,
        baseCurrency: draft.baseCurrency,
        updatedAt: nowIso(),
      });
    } else {
      const accountId = createAccountId();
      addAccount({
        id: accountId,
        name: trimmedName,
        owner: trimmedOwner,
        broker: trimmedBroker,
        type: draft.type,
        baseCurrency: draft.baseCurrency,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      if (isSavings) {
        const initialBalance = parseFloat(savingsInitialBalance);
        addCashHolding({
          id: createCashId(),
          accountId,
          currency: draft.baseCurrency,
          balance: Number.isFinite(initialBalance) && initialBalance >= 0 ? initialBalance : 0,
          updatedAt: nowIso(),
        });
      }
    }

    closeFormModal();
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    removeAccount(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Accounts</Text>
        <Pressable style={styles.addBtn} onPress={openAddModal}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.listWrap}>
          {accounts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No accounts yet</Text>
              <Text style={styles.emptyBody}>Your portfolio is empty because there is no account to place holdings or cash in.</Text>
              <Text style={styles.emptyBody}>Add your first account to get started.</Text>
              <Pressable style={styles.emptyPrimaryBtn} onPress={openAddModal}>
                <Text style={styles.emptyPrimaryBtnText}>Add Account</Text>
              </Pressable>
            </View>
          ) : null}

          {accounts.map((account) => {
            const metrics = accountMetrics.get(account.id);
            const cash = cashByAccount.get(account.id) ?? [];

            return (
              <View key={account.id} style={styles.card}>
                {/* Account header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountMeta}>
                      {account.broker ? `${account.broker} · ` : ""}
                      {account.owner}
                    </Text>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <Text style={styles.metricSmallLabel}>Current</Text>
                    <Text style={styles.metricSmallValue}>
                      {formatMoney(metrics?.currentValue ?? 0, account.baseCurrency)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.investedText}>Invested {formatMoney(metrics?.investedValue ?? 0, account.baseCurrency)}</Text>

                {/* ── Cash balances ─────────────────────────────── */}
                {cash.length > 0 ? (
                  <View style={styles.cashSection}>
                    <Text style={styles.sectionLabel}>Cash</Text>
                    {cash.map((c) => {
                      const isEditing = Boolean(cashEditActive[c.id]);
                      return (
                        <View key={c.id} style={styles.cashRow}>
                          <Text style={styles.cashCurrency}>{c.currency}</Text>
                          <View style={styles.cashRight}>
                            {isEditing ? (
                              <TextInput
                                value={cashEditValues[c.id] ?? ""}
                                onChangeText={(v) => setCashEditValues((prev) => ({ ...prev, [c.id]: v }))
                                }
                                onBlur={() => commitEditCash(c)}
                                onSubmitEditing={() => commitEditCash(c)}
                                keyboardType="decimal-pad"
                                autoFocus
                                style={styles.cashInput}
                              />
                            ) : (
                              <Pressable onPress={() => startEditCash(c)}>
                                <Text style={styles.cashValue}>{formatMoney(c.balance, c.currency)}</Text>
                              </Pressable>
                            )}
                            <Pressable onPress={() => removeCashHolding(c.id)}>
                              <Text style={styles.deleteX}>x</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* Add cash buttons */}
                <View style={styles.cashAddRow}>
                  {(["INR", "USD"] as Currency[]).map((currency) => {
                    const alreadyHas = (cashByAccount.get(account.id) ?? []).some((c) => c.currency === currency);
                    if (alreadyHas) return null;
                    return (
                      <Pressable key={currency} style={styles.cashAddBtn} onPress={() => addCashForAccount(account.id, currency)}>
                        <Text style={styles.cashAddText}>+ {currency} cash</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Account actions */}
                <View style={styles.actionsRow}>
                  <Pressable style={styles.editBtn} onPress={() => openEditModal(account)}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.deleteBtn} onPress={() => setDeleteTarget(account)}>
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={isFormVisible} transparent animationType="fade" onRequestClose={closeFormModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingAccountId ? "Edit Account" : "Add Account"}</Text>

            <TextInput
              value={draft.name}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
              placeholder="Account name"
              placeholderTextColor={colors.muted}
              style={styles.modalInput}
            />
            <TextInput
              value={draft.owner}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, owner: value }))}
              placeholder="Owner"
              placeholderTextColor={colors.muted}
              style={styles.modalInputCompact}
            />

            <Text style={styles.modalLabel}>Type</Text>
            <View style={styles.pillRow}>
              {(["BROKER", "SAVINGS"] as AccountType[]).map((type) => {
                const active = draft.type === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setDraft((prev) => ({ ...prev, type }))}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{type}</Text>
                  </Pressable>
                );
              })}
            </View>

            {draft.type === "BROKER" && (
              <TextInput
                value={draft.broker}
                onChangeText={(value) => setDraft((prev) => ({ ...prev, broker: value }))}
                placeholder="Broker"
                placeholderTextColor={colors.muted}
                style={styles.modalInputCompact}
              />
            )}

            <Text style={styles.modalLabel}>Currency</Text>
            <View style={styles.pillRow}>
              {(["INR", "USD"] as Currency[]).map((currency) => {
                const active = draft.baseCurrency === currency;
                return (
                  <Pressable
                    key={currency}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setDraft((prev) => ({ ...prev, baseCurrency: currency }))}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{currency}</Text>
                  </Pressable>
                );
              })}
            </View>

            {draft.type === "SAVINGS" && !editingAccountId && (
              <>
                <Text style={styles.modalLabel}>Initial Balance</Text>
                <TextInput
                  value={savingsInitialBalance}
                  onChangeText={setSavingsInitialBalance}
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  style={styles.modalInputCompact}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={closeFormModal}>
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={submitForm}>
                <Text style={styles.primaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(deleteTarget)} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete account?</Text>
            <Text style={styles.modalDangerText}>This removes {deleteTarget?.name} and all linked holdings and cash balances permanently.</Text>
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
  listWrap: {
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  emptyCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  emptyBody: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  emptyPrimaryBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyPrimaryBtnText: {
    color: colors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cardHeaderLeft: {
    flex: 1,
    paddingRight: spacing.md,
  },
  cardHeaderRight: {
    alignItems: "flex-end",
  },
  accountName: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  accountMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typography.caption,
  },
  metricSmallLabel: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  metricSmallValue: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  investedText: {
    marginTop: 4,
    color: colors.muted,
    fontSize: typography.caption,
  },
  cashSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#1E2128",
    paddingTop: spacing.md,
  },
  sectionLabel: {
    marginBottom: spacing.xs,
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cashRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cashCurrency: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  cashRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  cashValue: {
    color: colors.text,
    fontSize: typography.body,
  },
  cashInput: {
    minWidth: 100,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
    color: colors.text,
    textAlign: "right",
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  deleteX: {
    color: colors.negative,
    fontSize: typography.caption,
  },
  cashAddRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    gap: spacing.sm,
  },
  cashAddBtn: {
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  cashAddText: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  actionsRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    gap: spacing.sm,
  },
  editBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#252932",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  editBtnText: {
    color: colors.text,
    fontSize: typography.caption,
  },
  deleteBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#2D1E1E",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  deleteBtnText: {
    color: colors.negative,
    fontSize: typography.caption,
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
  modalLabel: {
    marginTop: spacing.lg,
    color: colors.muted,
    fontSize: typography.caption,
  },
  pillRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    gap: spacing.xs,
  },
  pill: {
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pillActive: {
    backgroundColor: colors.accent,
  },
  pillText: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  pillTextActive: {
    color: colors.bg,
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
