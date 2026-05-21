import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { formatMoney } from "../../src/utils/format";
import type { Account, AccountType, CashHolding, Currency } from "../../src/types/portfolio";

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
  type: "brokerage",
  baseCurrency: "INR",
};

const nowIso = () => new Date().toISOString();
const createAccountId = () => `acc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const createCashId = () => `cash-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export default function AccountsScreen() {
  const holdings = usePortfolioStore((state) => state.holdings);
  const cashHoldings = usePortfolioStore((state) => state.cashHoldings);
  const accounts = usePortfolioStore((state) => state.accounts);
  const addAccount = usePortfolioStore((state) => state.addAccount);
  const updateAccount = usePortfolioStore((state) => state.updateAccount);
  const removeAccount = usePortfolioStore((state) => state.removeAccount);
  const addCashHolding = usePortfolioStore((state) => state.addCashHolding);
  const updateCashHolding = usePortfolioStore((state) => state.updateCashHolding);
  const removeCashHolding = usePortfolioStore((state) => state.removeCashHolding);

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
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

    for (const account of accounts) {
      map.set(account.id, { currentValue: 0, investedValue: 0 });
    }

    for (const holding of holdings) {
      const metric = map.get(holding.accountId);
      if (!metric) {
        continue;
      }

      metric.currentValue += holding.quantity * holding.marketPrice;
      metric.investedValue += holding.quantity * holding.averagePrice;
    }

    for (const cashHolding of cashHoldings) {
      const metric = map.get(cashHolding.accountId);
      if (!metric) {
        continue;
      }

      metric.currentValue += cashHolding.balance;
      metric.investedValue += cashHolding.balance;
    }

    return map;
  }, [accounts, holdings, cashHoldings]);

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
    setIsFormVisible(true);
  };

  const closeFormModal = () => {
    setIsFormVisible(false);
    setEditingAccountId(null);
    setDraft(emptyDraft);
  };

  const submitForm = () => {
    const trimmedName = draft.name.trim();
    const trimmedOwner = draft.owner.trim();
    const trimmedBroker = draft.broker.trim();
    if (!trimmedName || !trimmedOwner || !trimmedBroker) {
      return;
    }

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
      addAccount({
        id: createAccountId(),
        name: trimmedName,
        owner: trimmedOwner,
        broker: trimmedBroker,
        type: draft.type,
        baseCurrency: draft.baseCurrency,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
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
      <View className="mb-5 flex-row items-center justify-between">
        <Text className="text-2xl font-semibold text-text">Accounts</Text>
        <Pressable className="rounded-full bg-accent px-4 py-1.5" onPress={openAddModal}>
          <Text className="text-sm font-semibold text-bg">Add</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="gap-4 pb-10">
          {accounts.map((account) => {
            const metrics = accountMetrics.get(account.id);
            const cash = cashByAccount.get(account.id) ?? [];

            return (
              <View key={account.id} className="rounded-xl bg-surface p-4">
                {/* Account header */}
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-semibold text-text">{account.name}</Text>
                    <Text className="mt-0.5 text-xs text-muted">{account.broker} · {account.owner}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xs text-muted">Current</Text>
                    <Text className="text-sm font-semibold text-text">
                      {formatMoney(metrics?.currentValue ?? 0, account.baseCurrency)}
                    </Text>
                  </View>
                </View>

                <View className="mt-1 self-start">
                  <Text className="text-xs text-muted">
                    Invested {formatMoney(metrics?.investedValue ?? 0, account.baseCurrency)}
                  </Text>
                </View>

                {/* ── Cash balances ─────────────────────────────── */}
                {cash.length > 0 ? (
                  <View className="mt-4 gap-2 border-t border-[#1E2128] pt-3">
                    <Text className="mb-1 text-xs font-medium text-muted uppercase tracking-widest">Cash</Text>
                    {cash.map((c) => {
                      const isEditing = Boolean(cashEditActive[c.id]);
                      return (
                        <View key={c.id} className="flex-row items-center justify-between">
                          <Text className="text-xs text-muted">{c.currency}</Text>
                          <View className="flex-1 flex-row items-center justify-end gap-2">
                            {isEditing ? (
                              <TextInput
                                value={cashEditValues[c.id] ?? ""}
                                onChangeText={(v) =>
                                  setCashEditValues((prev) => ({ ...prev, [c.id]: v }))
                                }
                                onBlur={() => commitEditCash(c)}
                                onSubmitEditing={() => commitEditCash(c)}
                                keyboardType="decimal-pad"
                                autoFocus
                                className="min-w-[100px] rounded-lg border border-accent bg-bg px-3 py-1.5 text-right text-sm text-text"
                              />
                            ) : (
                              <Pressable onPress={() => startEditCash(c)}>
                                <Text className="text-sm text-text">{formatMoney(c.balance, c.currency)}</Text>
                              </Pressable>
                            )}
                            <Pressable onPress={() => removeCashHolding(c.id)}>
                              <Text className="text-xs text-negative">✕</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* Add cash buttons */}
                <View className="mt-3 flex-row gap-2">
                  {(["INR", "USD"] as Currency[]).map((currency) => {
                    const alreadyHas = (cashByAccount.get(account.id) ?? []).some(
                      (c) => c.currency === currency
                    );
                    if (alreadyHas) return null;
                    return (
                      <Pressable
                        key={currency}
                        className="rounded-lg bg-bg px-3 py-1.5"
                        onPress={() => addCashForAccount(account.id, currency)}
                      >
                        <Text className="text-xs text-muted">+ {currency} cash</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Account actions */}
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    className="rounded-lg border border-[#252932] px-3 py-1.5"
                    onPress={() => openEditModal(account)}
                  >
                    <Text className="text-xs text-text">Edit</Text>
                  </Pressable>
                  <Pressable
                    className="rounded-lg border border-[#2D1E1E] px-3 py-1.5"
                    onPress={() => setDeleteTarget(account)}
                  >
                    <Text className="text-xs text-negative">Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={isFormVisible} transparent animationType="fade" onRequestClose={closeFormModal}>
        <View className="flex-1 items-center justify-center bg-black/70 px-5">
          <View className="w-full rounded-2xl bg-surface p-5">
            <Text className="text-lg font-semibold text-text">
              {editingAccountId ? "Edit Account" : "Add Account"}
            </Text>

            <TextInput
              value={draft.name}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
              placeholder="Account name"
              placeholderTextColor="#8B909A"
              className="mt-4 rounded-xl bg-bg px-4 py-3 text-text"
            />
            <TextInput
              value={draft.broker}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, broker: value }))}
              placeholder="Broker"
              placeholderTextColor="#8B909A"
              className="mt-2 rounded-xl bg-bg px-4 py-3 text-text"
            />
            <TextInput
              value={draft.owner}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, owner: value }))}
              placeholder="Owner"
              placeholderTextColor="#8B909A"
              className="mt-2 rounded-xl bg-bg px-4 py-3 text-text"
            />

            <Text className="mt-5 text-xs text-muted">Type</Text>
            <View className="mt-2 flex-row gap-1.5">
              {(["brokerage", "retirement", "family"] as AccountType[]).map((type) => (
                <Pressable
                  key={type}
                  className={`rounded-full px-3 py-1 ${draft.type === type ? "bg-accent" : "bg-bg"}`}
                  onPress={() => setDraft((prev) => ({ ...prev, type }))}
                >
                  <Text className={`text-xs font-medium ${draft.type === type ? "text-bg" : "text-muted"}`}>{type}</Text>
                </Pressable>
              ))}
            </View>

            <Text className="mt-4 text-xs text-muted">Currency</Text>
            <View className="mt-2 flex-row gap-1.5">
              {(["INR", "USD"] as Currency[]).map((currency) => (
                <Pressable
                  key={currency}
                  className={`rounded-full px-3 py-1 ${draft.baseCurrency === currency ? "bg-accent" : "bg-bg"}`}
                  onPress={() => setDraft((prev) => ({ ...prev, baseCurrency: currency }))}
                >
                  <Text className={`text-xs font-medium ${draft.baseCurrency === currency ? "text-bg" : "text-muted"}`}>
                    {currency}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="mt-6 flex-row justify-end gap-3">
              <Pressable className="px-4 py-2" onPress={closeFormModal}>
                <Text className="text-muted">Cancel</Text>
              </Pressable>
              <Pressable className="rounded-xl bg-accent px-5 py-2.5" onPress={submitForm}>
                <Text className="font-semibold text-bg">Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(deleteTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-5">
          <View className="w-full rounded-2xl bg-surface p-5">
            <Text className="text-lg font-semibold text-text">Delete account?</Text>
            <Text className="mt-1.5 text-sm text-muted">
              This removes{" "}
              <Text className="text-text">{deleteTarget?.name}</Text>
              {" "}and all linked holdings and cash balances permanently.
            </Text>
            <View className="mt-6 flex-row justify-end gap-3">
              <Pressable className="px-4 py-2" onPress={() => setDeleteTarget(null)}>
                <Text className="text-muted">Cancel</Text>
              </Pressable>
              <Pressable className="rounded-xl bg-negative px-5 py-2.5" onPress={confirmDelete}>
                <Text className="font-semibold text-text">Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

