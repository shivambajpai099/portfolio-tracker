import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ImportHoldingsModal } from "../../src/components/ImportHoldingsModal";
import { ImportTransactionsModal } from "../../src/components/ImportTransactionsModal";
import { TourTarget } from "../../src/components/OnboardingTourProvider";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { calcPortfolioTotals, convert } from "../../src/features/portfolio/calculations";
import { selectAllHoldings } from "../../src/features/portfolio/selectors";
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

export function AccountsSection() {
  const { colors } = useTheme();
  const manualHoldings = usePortfolioStore((state) => state.holdings);
  const cashHoldings = usePortfolioStore((state) => state.cashHoldings);
  const accounts = usePortfolioStore((state) => state.accounts);
  const transactions = usePortfolioStore((state) => state.transactions);
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
  const marketPrices = usePortfolioStore((state) => state.marketPrices);
  const setAccountTransactions = usePortfolioStore((state) => state.setAccountTransactions);
  const updateMarketPrices = usePortfolioStore((state) => state.updateMarketPrices);

  // Convert marketPrices record to Map for selectAllHoldings
  const priceMap = useMemo(() => new Map(Object.entries(marketPrices)), [marketPrices]);

  // Combine manual holdings + derived holdings from transaction-sourced accounts
  const holdings = useMemo(
    () => selectAllHoldings(manualHoldings, transactions, accounts, priceMap),
    [manualHoldings, transactions, accounts, priceMap]
  );

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [savingsInitialBalance, setSavingsInitialBalance] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleteCashTarget, setDeleteCashTarget] = useState<CashHolding | null>(null);
  const [menuOpenForAccount, setMenuOpenForAccount] = useState<string | null>(null);
  const [menuOpenForCash, setMenuOpenForCash] = useState<string | null>(null);
  const [importForAccountId, setImportForAccountId] = useState<string | null>(null);
  const [importMenuForAccountId, setImportMenuForAccountId] = useState<string | null>(null);
  const [isImportTransactionsVisible, setIsImportTransactionsVisible] = useState(false);
  const [importTransactionsAccountId, setImportTransactionsAccountId] = useState<string | null>(null);

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
    for (const [_id, metric] of map) {
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
    <>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Accounts</Text>
        <TourTarget tourKey="accounts-add">
          <Pressable style={[styles.addBtn, { backgroundColor: colors.accent }]} onPress={openAddModal}>
            <Text style={[styles.addBtnText, { color: colors.bg }]}>Add</Text>
          </Pressable>
        </TourTarget>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={false}>
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
              <Pressable style={[styles.emptyPrimaryBtn, { backgroundColor: colors.accent }]} onPress={() => setIsFormVisible(true)}>
                <Text style={[styles.emptyPrimaryBtnText, { color: colors.bg }]}>Add your first account</Text>
              </Pressable>
            </View>
          ) : null}

          {accounts.map((account) => {
            const metrics = accountMetrics.get(account.id);
            const cash = cashByAccount.get(account.id) ?? [];
            const isBroker = accountSupportsHoldings(account.type);
            const isMenuOpen = menuOpenForAccount === account.id;
            const lastUpdatedLabel = getLastUpdatedLabel(account);
            const gainLoss = metrics?.gainLoss ?? 0;
            const gainLossPct = metrics?.gainLossPct ?? 0;

            return (
              <View key={account.id} style={[styles.card, { backgroundColor: colors.surface }]}>
                {/* Account header with values */}
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
                  
                  {/* Two-column values matching Holdings row style */}
                  <View style={styles.valuesColumns}>
                    <View style={styles.valueColumn}>
                      <Text style={[styles.valueColumnLabel, { color: colors.muted }]}>Invested</Text>
                      <Text style={[styles.valueColumnAmount, { color: colors.text }]}>
                        {formatMoney(metrics?.investedValue ?? 0, account.baseCurrency)}
                      </Text>
                    </View>
                    <View style={styles.valueColumnRight}>
                      <Text style={[styles.valueColumnLabel, { color: colors.muted }]}>Current</Text>
                      <Text style={[styles.valueColumnAmount, { color: colors.text }]}>
                        {formatMoney(metrics?.currentValue ?? 0, account.baseCurrency)}
                      </Text>
                      <Text style={[
                        styles.gainLossUnder,
                        { color: gainLoss >= 0 ? colors.positive : colors.negative },
                      ]}>
                        {gainLoss >= 0 ? "+" : ""}{gainLossPct.toFixed(2)}%
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
                      const isCashMenuOpen = menuOpenForCash === c.id;
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
                            
                            {/* Kebab menu for cash row */}
                            <View style={styles.cashMenuContainer}>
                              <Pressable 
                                style={styles.cashMenuBtn}
                                onPress={() => setMenuOpenForCash(isCashMenuOpen ? null : c.id)}
                              >
                                <Text style={[styles.cashMenuIcon, { color: colors.muted }]}>⋮</Text>
                              </Pressable>
                              
                              {isCashMenuOpen && (
                                <View style={[styles.cashMenu, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                                  <Pressable 
                                    style={styles.menuItem} 
                                    onPress={() => {
                                      setMenuOpenForCash(null);
                                      startEditCash(c);
                                    }}
                                  >
                                    <Text style={[styles.menuItemText, { color: colors.text }]}>Edit</Text>
                                  </Pressable>
                                  <Pressable 
                                    style={styles.menuItem} 
                                    onPress={() => {
                                      setMenuOpenForCash(null);
                                      setDeleteCashTarget(c);
                                    }}
                                  >
                                    <Text style={[styles.menuItemTextDanger, { color: colors.negative }]}>Remove</Text>
                                  </Pressable>
                                </View>
                              )}
                            </View>
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
                    
                    {/* Import button for broker accounts - opens menu */}
                    {isBroker && (
                      <Pressable 
                        style={[styles.importBtn, { backgroundColor: colors.accent }]}
                        onPress={() => setImportMenuForAccountId(account.id)}
                      >
                        <Text style={[styles.importBtnText, { color: colors.bg }]}>Import ▾</Text>
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
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalIconBadge}>
                  <Text style={styles.modalIconEmoji}>🏦</Text>
                </View>
                <Text style={styles.modalTitle}>{editingAccountId ? "Edit Account" : "Add Account"}</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={closeFormModal}>
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.modalFieldLabel}>Account Name</Text>
            <TextInput
              value={draft.name}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
              placeholder="e.g. US-Core, India-Growth"
              placeholderTextColor="#8A94A3"
              style={styles.modalFieldInput}
            />
            
            <Text style={styles.modalFieldLabel}>Owner</Text>
            <TextInput
              value={draft.owner}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, owner: value }))}
              placeholder="e.g. John Doe"
              placeholderTextColor="#8A94A3"
              style={styles.modalFieldInput}
            />

            {/* Two-column row for Type and Currency */}
            <View style={styles.modalTwoColumnRow}>
              <View style={styles.modalColumnHalf}>
                <Text style={styles.modalFieldLabel}>Type</Text>
                <View style={styles.modalSegmentedWrap}>
                  <SegmentedControl
                    options={[
                      { value: "BROKER", label: "Broker" },
                      { value: "SAVINGS", label: "Savings" },
                    ]}
                    value={draft.type}
                    onChange={(type) => setDraft((prev) => ({ ...prev, type: type as AccountType }))}
                  />
                </View>
              </View>
              <View style={styles.modalColumnHalf}>
                <Text style={styles.modalFieldLabel}>Currency</Text>
                <View style={styles.modalSegmentedWrap}>
                  <SegmentedControl
                    options={[
                      { value: "INR", label: "INR" },
                      { value: "USD", label: "USD" },
                    ]}
                    value={draft.baseCurrency}
                    onChange={(currency) => setDraft((prev) => ({ ...prev, baseCurrency: currency as Currency }))}
                  />
                </View>
              </View>
            </View>

            {draft.type === "BROKER" && (
              <>
                <Text style={styles.modalFieldLabel}>Broker</Text>
                <TextInput
                  value={draft.broker}
                  onChangeText={(value) => setDraft((prev) => ({ ...prev, broker: value }))}
                  placeholder="e.g. INDMoney, Groww, Zerodha"
                  placeholderTextColor="#8A94A3"
                  style={styles.modalFieldInput}
                />
              </>
            )}

            {draft.type === "SAVINGS" && !editingAccountId && (
              <>
                <Text style={styles.modalFieldLabel}>Initial Balance</Text>
                <TextInput
                  value={savingsInitialBalance}
                  onChangeText={setSavingsInitialBalance}
                  placeholder="0.00"
                  placeholderTextColor="#8A94A3"
                  keyboardType="decimal-pad"
                  style={styles.modalFieldInput}
                />
              </>
            )}

            {/* Save button */}
            {(() => {
              const trimmedName = draft.name.trim();
              const trimmedOwner = draft.owner.trim();
              const trimmedBroker = draft.broker.trim();
              const isSavings = draft.type === "SAVINGS";
              const canSave = trimmedName && trimmedOwner && (isSavings || trimmedBroker);
              
              // Compute helper message
              let helperMessage: string | null = null;
              if (!canSave) {
                if (!trimmedName) helperMessage = "Enter an account name to continue";
                else if (!trimmedOwner) helperMessage = "Enter an owner name to continue";
                else if (!isSavings && !trimmedBroker) helperMessage = "Enter a broker name to continue";
              }
              
              return (
                <>
                  <Pressable
                    style={[styles.modalSaveBtn, !canSave && styles.modalSaveBtnDisabled]}
                    onPress={submitForm}
                    disabled={!canSave}
                  >
                    <Text style={[styles.modalSaveText, !canSave && styles.modalSaveTextDisabled]}>
                      Save Account
                    </Text>
                  </Pressable>
                  {helperMessage && (
                    <Text style={styles.modalDisabledHelper}>{helperMessage}</Text>
                  )}
                </>
              );
            })()}
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

      {/* Import Transactions Modal */}
      <ImportTransactionsModal
        visible={isImportTransactionsVisible}
        accounts={brokerAccounts}
        onClose={() => {
          setIsImportTransactionsVisible(false);
          setImportTransactionsAccountId(null);
        }}
        onComplete={(result) => {
          console.log(`Imported ${result.transactionCount} transactions, ${result.derivedHoldingCount} derived holdings to ${result.accountName}`);
        }}
        setAccountTransactions={setAccountTransactions}
        updateAccount={updateAccount}
        updateMarketPrices={updateMarketPrices}
        preSelectedAccountId={importTransactionsAccountId ?? undefined}
      />

      {/* Import Menu Modal */}
      <Modal visible={Boolean(importMenuForAccountId)} transparent animationType="fade" onRequestClose={() => setImportMenuForAccountId(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setImportMenuForAccountId(null)}>
          <View style={styles.importMenuCard}>
            <Text style={styles.importMenuTitle}>Import Data</Text>
            <Pressable
              style={styles.importMenuItem}
              onPress={() => {
                const accountId = importMenuForAccountId;
                setImportMenuForAccountId(null);
                setImportForAccountId(accountId);
              }}
            >
              <Text style={styles.importMenuItemTitle}>Import Holdings</Text>
              <Text style={styles.importMenuItemDesc}>Import current holdings snapshot from your broker</Text>
            </Pressable>
            <Pressable
              style={styles.importMenuItem}
              onPress={() => {
                const accountId = importMenuForAccountId;
                setImportMenuForAccountId(null);
                setImportTransactionsAccountId(accountId);
                setIsImportTransactionsVisible(true);
              }}
            >
              <Text style={styles.importMenuItemTitle}>Import Transactions</Text>
              <Text style={styles.importMenuItemDesc}>Import buy/sell history to derive holdings with FIFO cost basis</Text>
            </Pressable>
            <Pressable style={styles.importMenuCancel} onPress={() => setImportMenuForAccountId(null)}>
              <Text style={styles.importMenuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function AccountsScreen() {
  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <AccountsSection />
      </ScrollView>
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
    gap: spacing.md,
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 100,
  },
  valuesColumns: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  valueColumn: {
    alignItems: "flex-end",
  },
  valueColumnRight: {
    alignItems: "flex-end",
  },
  valueColumnLabel: {
    fontSize: typography.micro,
    marginBottom: 2,
  },
  valueColumnAmount: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    fontVariant: ["tabular-nums"],
  },
  gainLossUnder: {
    fontSize: typography.micro,
    marginTop: 2,
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
  cashMenuContainer: {
    position: "relative",
  },
  cashMenuBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cashMenuIcon: {
    fontSize: 16,
    fontWeight: typography.weightSemibold,
  },
  cashMenu: {
    position: "absolute",
    top: 24,
    right: 0,
    minWidth: 80,
    borderRadius: radii.md,
    borderWidth: 1,
    zIndex: 100,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
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
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
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
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  modalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  modalIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#16323A",
    alignItems: "center",
    justifyContent: "center",
  },
  modalIconEmoji: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F2F4F8",
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#1A1F26",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: {
    color: "#8A94A3",
    fontSize: 14,
  },
  modalFieldLabel: {
    marginTop: spacing.lg,
    marginBottom: 6,
    color: "#8A94A3",
    fontSize: 12,
  },
  modalFieldInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262B33",
    backgroundColor: "#0E1116",
    color: "#F2F4F8",
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
  },
  modalTwoColumnRow: {
    flexDirection: "row",
    gap: 14,
  },
  modalColumnHalf: {
    flex: 1,
  },
  modalSegmentedWrap: {
    marginTop: 0,
  },
  modalSaveBtn: {
    marginTop: spacing.xxl,
    borderRadius: 10,
    backgroundColor: "#5FD4EB",
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    alignSelf: "flex-end",
  },
  modalSaveBtnDisabled: {
    backgroundColor: "#1A1F26",
    borderWidth: 1,
    borderColor: "#262B33",
  },
  modalSaveText: {
    color: "#0B0C10",
    fontSize: 14,
    fontWeight: "600",
  },
  modalSaveTextDisabled: {
    color: "#5A6472",
  },
  modalDisabledHelper: {
    marginTop: spacing.sm,
    color: "#8A94A3",
    fontSize: 11,
    textAlign: "right",
  },
  // Legacy modal styles for delete confirmations
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
  controlRow: {
    marginTop: spacing.sm,
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
  // Import menu styles
  importMenuCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: radii.xl,
    backgroundColor: defaultColors.surface,
    padding: spacing.lg,
  },
  importMenuTitle: {
    color: defaultColors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.md,
  },
  importMenuItem: {
    backgroundColor: defaultColors.bg,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  importMenuItemTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.xs,
  },
  importMenuItemDesc: {
    color: defaultColors.muted,
    fontSize: typography.caption,
  },
  importMenuCancel: {
    marginTop: spacing.sm,
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  importMenuCancelText: {
    color: defaultColors.muted,
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
});
