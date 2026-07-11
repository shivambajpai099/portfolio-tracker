import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ImportHoldingsModal } from "../../src/components/ImportHoldingsModal";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { calcPortfolioTotals, convert } from "../../src/features/portfolio/calculations";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors as defaultColors, radii, spacing, typography, useTheme } from "../../src/theme";
import { accountSupportsHoldings, type Account, type AccountType, type CashHolding, type Currency } from "../../src/types/portfolio";
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

/** Format a date for display (e.g., "2026-06-09") */
const formatDate = (isoString: string | undefined): string | null => {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    return date.toISOString().split("T")[0];
  } catch {
    return null;
  }
};

export default function AccountsScreen() {
  const { colors } = useTheme();
  const holdings = usePortfolioStore((state) => state.holdings);
  const cashHoldings = usePortfolioStore((state) => state.cashHoldings);
  const accounts = usePortfolioStore((state) => state.accounts);
  const fxRates = usePortfolioStore((state) => state.fxRates);
  const settings = usePortfolioStore((state) => state.settings);
  const addAccount = usePortfolioStore((state) => state.addAccount);
  const updateAccount = usePortfolioStore((state) => state.updateAccount);
  const removeAccount = usePortfolioStore((state) => state.removeAccount);
  const addCashHolding = usePortfolioStore((state) => state.addCashHolding);
  const updateCashHolding = usePortfolioStore((state) => state.updateCashHolding);
  const removeCashHolding = usePortfolioStore((state) => state.removeCashHolding);
  const addHolding = usePortfolioStore((state) => state.addHolding);
  const updateHolding = usePortfolioStore((state) => state.updateHolding);

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [savingsInitialBalance, setSavingsInitialBalance] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleteCashTarget, setDeleteCashTarget] = useState<CashHolding | null>(null);
  const [menuOpenForAccount, setMenuOpenForAccount] = useState<string | null>(null);
  const [importForAccountId, setImportForAccountId] = useState<string | null>(null);

  // cash inline-edit: key = cashHolding.id, value = draft string
  const [cashEditValues, setCashEditValues] = useState<Record<string, string>>({});
  // tracks which cash rows are in edit mode
  const [cashEditActive, setCashEditActive] = useState<Record<string, boolean>>({});

  const rc = settings.reportingCurrency;

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
    const map = new Map<string, { currentValue: number; investedValue: number; gainLoss: number; gainLossPct: number }>();
    const accountCurrency = new Map<string, Currency>();

    for (const account of accounts) {
      map.set(account.id, { currentValue: 0, investedValue: 0, gainLoss: 0, gainLossPct: 0 });
      accountCurrency.set(account.id, account.baseCurrency);
    }

    for (const holding of holdings) {
      const metric = map.get(holding.accountId);
      if (!metric) continue;
      const toCurrency = accountCurrency.get(holding.accountId);
      if (!toCurrency) continue;

      const currentVal = convert(holding.quantity * holding.marketPrice, holding.currency, toCurrency, fxRates);
      const investedVal = convert(holding.quantity * holding.averagePrice, holding.currency, toCurrency, fxRates);
      metric.currentValue += currentVal;
      metric.investedValue += investedVal;
    }

    for (const cashHolding of cashHoldings) {
      const metric = map.get(cashHolding.accountId);
      if (!metric) continue;
      const toCurrency = accountCurrency.get(cashHolding.accountId);
      if (!toCurrency) continue;

      const convertedCash = convert(cashHolding.balance, cashHolding.currency, toCurrency, fxRates);
      metric.currentValue += convertedCash;
      metric.investedValue += convertedCash;
    }

    // Calculate gain/loss for each account
    for (const [id, metric] of map) {
      metric.gainLoss = metric.currentValue - metric.investedValue;
      metric.gainLossPct = metric.investedValue === 0 ? 0 : (metric.gainLoss / metric.investedValue) * 100;
    }

    return map;
  }, [accounts, holdings, cashHoldings, fxRates]);

  // Calculate portfolio totals (same calculation as Overview)
  const portfolioTotals = useMemo(
    () => calcPortfolioTotals(holdings, cashHoldings, fxRates, rc),
    [holdings, cashHoldings, fxRates, rc]
  );

  // Calculate accounts total in reporting currency for reconciliation check
  const accountsTotalInRC = useMemo(() => {
    let currentValue = 0;
    let investedValue = 0;
    for (const account of accounts) {
      const metrics = accountMetrics.get(account.id);
      if (!metrics) continue;
      currentValue += convert(metrics.currentValue, account.baseCurrency, rc, fxRates);
      investedValue += convert(metrics.investedValue, account.baseCurrency, rc, fxRates);
    }
    return { currentValue, investedValue };
  }, [accounts, accountMetrics, rc, fxRates]);

  // Check if there's a mismatch (> 1 unit difference accounts for rounding)
  const hasMismatch = Math.abs(accountsTotalInRC.currentValue - portfolioTotals.currentValue) > 1 ||
                      Math.abs(accountsTotalInRC.investedValue - portfolioTotals.investedValue) > 1;

  const brokerAccounts = useMemo(
    () => accounts.filter((account) => accountSupportsHoldings(account.type)),
    [accounts]
  );

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
    setMenuOpenForAccount(null);
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

  const confirmDeleteAccount = () => {
    if (!deleteTarget) return;
    removeAccount(deleteTarget.id);
    setDeleteTarget(null);
  };

  const confirmDeleteCash = () => {
    if (!deleteCashTarget) return;
    removeCashHolding(deleteCashTarget.id);
    setDeleteCashTarget(null);
  };

  const openDeleteAccountModal = (account: Account) => {
    setMenuOpenForAccount(null);
    setDeleteTarget(account);
  };

  const openImportForAccount = (accountId: string) => {
    setMenuOpenForAccount(null);
    setImportForAccountId(accountId);
  };

  const getLastUpdatedLabel = (account: Account): string => {
    if (account.lastImportedAt) {
      const date = formatDate(account.lastImportedAt);
      const source = account.lastImportSource || "import";
      return `Last updated: ${date} via ${source}`;
    }
    if (account.updatedAt) {
      const date = formatDate(account.updatedAt);
      return `Last updated: ${date} (manual)`;
    }
    return "";
  };

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Accounts</Text>
        <Pressable style={[styles.addBtn, { backgroundColor: colors.accent }]} onPress={openAddModal}>
          <Text style={[styles.addBtnText, { color: colors.bg }]}>Add</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.listWrap}>
          {/* Summary Total Block */}
          {accounts.length > 0 && (
            <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>Total Across All Accounts</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{formatMoney(portfolioTotals.currentValue, rc)}</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryStatLabel, { color: colors.muted }]}>Invested</Text>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{formatMoney(portfolioTotals.investedValue, rc)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryStatLabel, { color: colors.muted }]}>Gain/Loss</Text>
                <Text style={[
                  styles.summaryGainValue,
                  { color: portfolioTotals.gainLoss >= 0 ? colors.positive : colors.negative },
                ]}>
                  {portfolioTotals.gainLoss >= 0 ? "+" : ""}
                  {formatMoney(portfolioTotals.gainLoss, rc)}
                </Text>
                <View style={[
                  styles.gainBadge,
                  { backgroundColor: portfolioTotals.gainLoss >= 0 ? `${colors.positive}22` : `${colors.negative}22` },
                ]}>
                  <Text style={[
                    styles.gainBadgeText,
                    { color: portfolioTotals.gainLoss >= 0 ? colors.positive : colors.negative },
                  ]}>
                    {portfolioTotals.gainLossPct >= 0 ? "+" : ""}
                    {portfolioTotals.gainLossPct.toFixed(2)}%
                  </Text>
                </View>
              </View>
              {hasMismatch && (
                <View style={[styles.warningBanner, { backgroundColor: `${colors.warning}22` }]}>
                  <Text style={[styles.warningText, { color: colors.warning }]}>
                    ⚠️ Accounts total doesn't match Overview — data may be out of sync
                  </Text>
                </View>
              )}
            </View>
          )}

          {accounts.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No accounts yet</Text>
              <Text style={[styles.emptyBody, { color: colors.muted }]}>Your portfolio is empty because there is no account to place holdings or cash in.</Text>
              <Text style={[styles.emptyBody, { color: colors.muted }]}>Add your first account to get started.</Text>
              <Pressable style={[styles.emptyPrimaryBtn, { backgroundColor: colors.accent }]} onPress={openAddModal}>
                <Text style={[styles.emptyPrimaryBtnText, { color: colors.bg }]}>Add Account</Text>
              </Pressable>
            </View>
          ) : null}

          {accounts.map((account) => {
            const metrics = accountMetrics.get(account.id);
            const cash = cashByAccount.get(account.id) ?? [];
            const isBroker = accountSupportsHoldings(account.type);
            const isMenuOpen = menuOpenForAccount === account.id;
            const lastUpdatedLabel = getLastUpdatedLabel(account);

            return (
              <View key={account.id} style={[styles.card, { backgroundColor: colors.surface }]}>
                {/* Account header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={[styles.accountName, { color: colors.text }]}>{account.name}</Text>
                    <Text style={[styles.accountMeta, { color: colors.muted }]}>
                      {account.broker ? `${account.broker} · ` : ""}
                      {account.owner}
                    </Text>
                    {lastUpdatedLabel ? (
                      <Text style={[styles.lastUpdatedText, { color: colors.muted }]}>{lastUpdatedLabel}</Text>
                    ) : null}
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <Text style={[styles.metricSmallLabel, { color: colors.muted }]}>Current</Text>
                    <Text style={[styles.metricSmallValue, { color: colors.text }]}>
                      {formatMoney(metrics?.currentValue ?? 0, account.baseCurrency)}
                    </Text>
                  </View>
                </View>

                {/* Invested and Gain/Loss row */}
                <View style={styles.metricsRow}>
                  <Text style={[styles.investedText, { color: colors.muted }]}>
                    Invested {formatMoney(metrics?.investedValue ?? 0, account.baseCurrency)}
                  </Text>
                  <View style={styles.gainLossRow}>
                    <Text style={[
                      styles.gainLossText,
                      { color: (metrics?.gainLoss ?? 0) >= 0 ? colors.positive : colors.negative },
                    ]}>
                      {(metrics?.gainLoss ?? 0) >= 0 ? "+" : ""}
                      {formatMoney(metrics?.gainLoss ?? 0, account.baseCurrency)}
                    </Text>
                    <View style={[
                      styles.gainBadgeSmall,
                      { backgroundColor: (metrics?.gainLoss ?? 0) >= 0 ? `${colors.positive}22` : `${colors.negative}22` },
                    ]}>
                      <Text style={[
                        styles.gainBadgeTextSmall,
                        { color: (metrics?.gainLoss ?? 0) >= 0 ? colors.positive : colors.negative },
                      ]}>
                        {(metrics?.gainLossPct ?? 0) >= 0 ? "+" : ""}
                        {(metrics?.gainLossPct ?? 0).toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ── Cash balances ─────────────────────────────── */}
                {cash.length > 0 ? (
                  <View style={styles.cashSection}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>Cash</Text>
                    {cash.map((c) => {
                      const isEditing = Boolean(cashEditActive[c.id]);
                      return (
                        <View key={c.id} style={styles.cashRow}>
                          <Text style={[styles.cashCurrency, { color: colors.muted }]}>{c.currency}</Text>
                          <View style={styles.cashRight}>
                            {isEditing ? (
                              <TextInput
                                value={cashEditValues[c.id] ?? ""}
                                onChangeText={(v) => setCashEditValues((prev) => ({ ...prev, [c.id]: v }))}
                                onBlur={() => commitEditCash(c)}
                                onSubmitEditing={() => commitEditCash(c)}
                                keyboardType="decimal-pad"
                                autoFocus
                                style={[styles.cashInput, { backgroundColor: colors.bg, color: colors.text }]}
                              />
                            ) : (
                              <Pressable onPress={() => startEditCash(c)}>
                                <Text style={[styles.cashValue, { color: colors.text }]}>{formatMoney(c.balance, c.currency)}</Text>
                              </Pressable>
                            )}
                            <Pressable 
                              style={styles.cashRemoveBtn}
                              onPress={() => setDeleteCashTarget(c)}
                            >
                              <Text style={[styles.cashRemoveText, { color: colors.negative }]}>Remove</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* Add cash buttons + actions */}
                <View style={styles.actionsContainer}>
                  {/* Primary actions row */}
                  <View style={styles.primaryActionsRow}>
                    {/* Add cash buttons */}
                    {(["INR", "USD"] as Currency[]).map((currency) => {
                      const alreadyHas = (cashByAccount.get(account.id) ?? []).some((c) => c.currency === currency);
                      if (alreadyHas) return null;
                      return (
                        <Pressable 
                          key={currency} 
                          style={[styles.cashAddBtn, { backgroundColor: colors.bg }]} 
                          onPress={() => addCashForAccount(account.id, currency)}
                        >
                          <Text style={[styles.cashAddText, { color: colors.muted }]}>+ {currency} cash</Text>
                        </Pressable>
                      );
                    })}
                    
                    {/* Import Holdings button for broker accounts */}
                    {isBroker && (
                      <Pressable 
                        style={[styles.importBtn, { backgroundColor: colors.accent }]}
                        onPress={() => openImportForAccount(account.id)}
                      >
                        <Text style={[styles.importBtnText, { color: colors.bg }]}>Import Holdings</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Overflow menu */}
                  <View style={styles.overflowContainer}>
                    <Pressable 
                      style={styles.overflowBtn} 
                      onPress={() => setMenuOpenForAccount(isMenuOpen ? null : account.id)}
                    >
                      <Text style={[styles.overflowIcon, { color: colors.muted }]}>⋮</Text>
                    </Pressable>
                    
                    {isMenuOpen && (
                      <View style={[styles.overflowMenu, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                        <Pressable 
                          style={styles.menuItem} 
                          onPress={() => openEditModal(account)}
                        >
                          <Text style={[styles.menuItemText, { color: colors.text }]}>Edit</Text>
                        </Pressable>
                        <Pressable 
                          style={styles.menuItem} 
                          onPress={() => openDeleteAccountModal(account)}
                        >
                          <Text style={[styles.menuItemTextDanger, { color: colors.negative }]}>Delete</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Add/Edit Account Modal */}
      <Modal visible={isFormVisible} transparent animationType="fade" onRequestClose={closeFormModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editingAccountId ? "Edit Account" : "Add Account"}</Text>

            <TextInput
              value={draft.name}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
              placeholder="Account name"
              placeholderTextColor={colors.muted}
              style={[styles.modalInput, { backgroundColor: colors.bg, color: colors.text }]}
            />
            <TextInput
              value={draft.owner}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, owner: value }))}
              placeholder="Owner"
              placeholderTextColor={colors.muted}
              style={[styles.modalInputCompact, { backgroundColor: colors.bg, color: colors.text }]}
            />

            <Text style={[styles.modalLabel, { color: colors.muted }]}>Type</Text>
            <View style={styles.pillRow}>
              {(["BROKER", "SAVINGS"] as AccountType[]).map((type) => {
                const active = draft.type === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.pill, { backgroundColor: active ? colors.accent : colors.bg }]}
                    onPress={() => setDraft((prev) => ({ ...prev, type }))}
                  >
                    <Text style={[styles.pillText, { color: active ? colors.bg : colors.muted }]}>{type}</Text>
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
                style={[styles.modalInputCompact, { backgroundColor: colors.bg, color: colors.text }]}
              />
            )}

            <Text style={[styles.modalLabel, { color: colors.muted }]}>Currency</Text>
            <View style={styles.pillRow}>
              {(["INR", "USD"] as Currency[]).map((currency) => {
                const active = draft.baseCurrency === currency;
                return (
                  <Pressable
                    key={currency}
                    style={[styles.pill, { backgroundColor: active ? colors.accent : colors.bg }]}
                    onPress={() => setDraft((prev) => ({ ...prev, baseCurrency: currency }))}
                  >
                    <Text style={[styles.pillText, { color: active ? colors.bg : colors.muted }]}>{currency}</Text>
                  </Pressable>
                );
              })}
            </View>

            {draft.type === "SAVINGS" && !editingAccountId && (
              <>
                <Text style={[styles.modalLabel, { color: colors.muted }]}>Initial Balance</Text>
                <TextInput
                  value={savingsInitialBalance}
                  onChangeText={setSavingsInitialBalance}
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  style={[styles.modalInputCompact, { backgroundColor: colors.bg, color: colors.text }]}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={closeFormModal}>
                <Text style={{ color: colors.muted }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={submitForm}>
                <Text style={[styles.primaryText, { color: colors.text }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal visible={Boolean(deleteTarget)} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Delete account?</Text>
            <Text style={[styles.modalDangerText, { color: colors.muted }]}>
              Are you sure? This removes {deleteTarget?.name} and its holdings mapping permanently.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setDeleteTarget(null)}>
                <Text style={{ color: colors.muted }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.dangerBtn, { backgroundColor: colors.negative }]} onPress={confirmDeleteAccount}>
                <Text style={[styles.primaryText, { color: colors.text }]}>Confirm Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Cash Confirmation Modal */}
      <Modal visible={Boolean(deleteCashTarget)} transparent animationType="fade" onRequestClose={() => setDeleteCashTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Remove cash balance?</Text>
            <Text style={[styles.modalDangerText, { color: colors.muted }]}>
              Are you sure? This removes the {deleteCashTarget?.currency} cash entry of {deleteCashTarget ? formatMoney(deleteCashTarget.balance, deleteCashTarget.currency) : ""} from this account.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setDeleteCashTarget(null)}>
                <Text style={{ color: colors.muted }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.dangerBtn, { backgroundColor: colors.negative }]} onPress={confirmDeleteCash}>
                <Text style={[styles.primaryText, { color: colors.text }]}>Confirm Remove</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import Holdings Modal */}
      <ImportHoldingsModal
        visible={Boolean(importForAccountId)}
        accounts={brokerAccounts}
        existingHoldings={holdings}
        onClose={() => setImportForAccountId(null)}
        onComplete={(result) => {
          console.log(`Imported ${result.addedCount} new, ${result.updatedCount} updated to ${result.accountName}`);
          setImportForAccountId(null);
        }}
        addHolding={addHolding}
        updateHolding={updateHolding}
        updateAccount={updateAccount}
        preSelectedAccountId={importForAccountId ?? undefined}
      />
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
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  addBtn: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  addBtnText: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  listWrap: {
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  // Summary card styles
  summaryCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    fontSize: typography.caption,
  },
  summaryValue: {
    marginTop: spacing.xs,
    fontSize: 28,
    fontWeight: typography.weightSemibold,
    lineHeight: 32,
  },
  summaryRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  summaryStatLabel: {
    width: 70,
    fontSize: typography.caption,
  },
  summaryStatValue: {
    fontSize: typography.body,
  },
  summaryGainValue: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  gainBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    marginLeft: spacing.xs,
  },
  gainBadgePositive: {
    backgroundColor: `${defaultColors.positive}22`,
  },
  gainBadgeNegative: {
    backgroundColor: `${defaultColors.negative}22`,
  },
  gainBadgeText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  positiveText: {
    color: defaultColors.positive,
  },
  negativeText: {
    color: defaultColors.negative,
  },
  warningBanner: {
    marginTop: spacing.md,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  warningText: {
    fontSize: typography.caption,
  },
  // Empty state
  emptyCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  emptyBody: {
    marginTop: spacing.xs,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  emptyPrimaryBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyPrimaryBtnText: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  // Account card
  card: {
    borderRadius: radii.lg,
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
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  accountMeta: {
    marginTop: 2,
    fontSize: typography.caption,
  },
  lastUpdatedText: {
    marginTop: 4,
    fontSize: typography.micro,
    fontStyle: "italic",
  },
  metricSmallLabel: {
    fontSize: typography.caption,
  },
  metricSmallValue: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  metricsRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  investedText: {
    fontSize: typography.caption,
  },
  gainLossRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  gainLossText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  gainBadgeSmall: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  gainBadgeTextSmall: {
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  // Cash section
  cashSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: defaultColors.border,
    paddingTop: spacing.md,
  },
  sectionLabel: {
    marginBottom: spacing.xs,
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
    fontSize: typography.body,
  },
  cashInput: {
    minWidth: 100,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: defaultColors.accent,
    textAlign: "right",
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  cashRemoveBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cashRemoveText: {
    fontSize: typography.micro,
  },
  // Actions container
  actionsContainer: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  primaryActionsRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  cashAddBtn: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  cashAddText: {
    fontSize: typography.caption,
  },
  importBtn: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  importBtnText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  // Overflow menu
  overflowContainer: {
    position: "relative",
  },
  overflowBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  overflowIcon: {
    fontSize: 20,
    fontWeight: typography.weightSemibold,
  },
  overflowMenu: {
    position: "absolute",
    top: 28,
    right: 0,
    minWidth: 100,
    borderRadius: radii.md,
    borderWidth: 1,
    zIndex: 100,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  menuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuItemText: {
    fontSize: typography.caption,
  },
  menuItemTextDanger: {
    fontSize: typography.caption,
  },
  // Modal styles
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
    padding: spacing.xl,
  },
  modalTitle: {
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  modalInput: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalInputCompact: {
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalLabel: {
    marginTop: spacing.lg,
    fontSize: typography.caption,
  },
  pillRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    gap: spacing.xs,
  },
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pillText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
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
  primaryBtn: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  dangerBtn: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  primaryText: {
    fontWeight: typography.weightSemibold,
  },
  modalDangerText: {
    marginTop: spacing.sm,
    fontSize: typography.body,
  },
});
