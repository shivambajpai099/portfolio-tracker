import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { AddHoldingModal } from "../../src/components/AddHoldingModal";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { toINR, toUSD } from "../../src/features/portfolio/selectors";
import { usePortfolioStore } from "../../src/store/portfolioStore";
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
      return toINR(value, currency, fxRates.USDINR);
    }
    return toUSD(value, currency, fxRates.USDINR);
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
      <View className="mb-5 flex-row items-center justify-between">
        <Text className="text-2xl font-semibold text-text">Holdings</Text>
        <Pressable className="rounded-full bg-accent px-4 py-1.5" onPress={() => setIsAddVisible(true)}>
          <Text className="text-sm font-semibold text-bg">Add</Text>
        </Pressable>
      </View>

      {/* Search */}
      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search ticker, company or account"
        placeholderTextColor="#8B909A"
        className="mb-4 rounded-xl bg-surface px-4 py-3 text-sm text-text"
      />

      {/* Sort chips */}
      <View className="mb-2 flex-row flex-wrap gap-1.5">
        {([
          ["current_desc", "Value"],
          ["allocation_desc", "Alloc"],
          ["gain_desc", "Gain"],
          ["ticker_asc", "A–Z"],
        ] as const).map(([key, label]) => (
          <Pressable
            key={key}
            className={`rounded-full px-3 py-1 ${sortKey === key ? "bg-accent" : "bg-surface"}`}
            onPress={() => setSortKey(key)}
          >
            <Text className={`text-xs font-medium ${sortKey === key ? "text-bg" : "text-muted"}`}>{label}</Text>
          </Pressable>
        ))}
        <View className="w-px self-stretch bg-[#252932] mx-0.5" />
        {(["ALL", "INR", "USD"] as CurrencyFilter[]).map((value) => (
          <Pressable
            key={value}
            className={`rounded-full px-3 py-1 ${currencyFilter === value ? "bg-accent" : "bg-surface"}`}
            onPress={() => setCurrencyFilter(value)}
          >
            <Text className={`text-xs font-medium ${currencyFilter === value ? "text-bg" : "text-muted"}`}>{value}</Text>
          </Pressable>
        ))}
        {(["ALL", "GAIN", "LOSS"] as PerfFilter[]).map((value) => (
          <Pressable
            key={value}
            className={`rounded-full px-3 py-1 ${perfFilter === value ? "bg-accent" : "bg-surface"}`}
            onPress={() => setPerfFilter(value)}
          >
            <Text className={`text-xs font-medium ${perfFilter === value ? "text-bg" : "text-muted"}`}>{value}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="mt-4 gap-4 pb-10">
          {visibleGroups.map((group) => {
            const isExpanded = Boolean(expandedSymbols[group.symbol]);

            return (
              <View key={group.symbol} className="rounded-2xl bg-surface p-4">
                <Pressable
                  onPress={() =>
                    setExpandedSymbols((prev) => ({ ...prev, [group.symbol]: !prev[group.symbol] }))
                  }
                >
                  {/* Symbol + allocation % */}
                  <View className="mb-3 flex-row items-start justify-between">
                    <View className="flex-1 pr-4">
                      <Text className="text-base font-semibold text-text">{group.symbol}</Text>
                      <Text className="mt-0.5 text-xs text-muted">{group.companyName}</Text>
                    </View>
                    <Text className="text-base font-semibold text-text">{group.allocationPct.toFixed(1)}%</Text>
                  </View>

                  {/* Allocation bar */}
                  <View className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-bg">
                    <View style={{ width: `${group.allocationPct}%`, backgroundColor: "#67E8F9", height: "100%" }} />
                  </View>

                  {/* Metrics row */}
                  <View className="flex-row justify-between">
                    <View>
                      <Text className="text-[10px] text-muted">Current</Text>
                      <Text className="mt-0.5 text-sm text-text">{formatMoney(group.currentValue, settings.reportingCurrency)}</Text>
                    </View>
                    <View className="items-center">
                      <Text className="text-[10px] text-muted">Invested</Text>
                      <Text className="mt-0.5 text-sm text-text">{formatMoney(group.investedValue, settings.reportingCurrency)}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[10px] text-muted">Gain/Loss</Text>
                      <Text className={`mt-0.5 text-sm font-medium ${group.gainLoss >= 0 ? "text-positive" : "text-negative"}`}>
                        {formatMoney(group.gainLoss, settings.reportingCurrency)}
                      </Text>
                    </View>
                  </View>
                </Pressable>

                {/* Account chips */}
                <View className="mt-3 flex-row flex-wrap gap-1.5">
                  {group.linkedAccountsLabel.map((label) => (
                    <Text key={`${group.symbol}-${label}`} className="rounded-full bg-bg px-2.5 py-0.5 text-[10px] text-muted">
                      {label}
                    </Text>
                  ))}
                </View>

                {/* Expanded lots */}
                {isExpanded ? (
                  <View className="mt-4 gap-2 border-t border-[#1E2128] pt-3">
                    {group.lots.map((lot) => (
                      <View key={lot.id} className="flex-row items-center justify-between py-1">
                        <View className="flex-1 pr-4">
                          <Text className="text-xs text-text">{accountNameById.get(lot.accountId) ?? lot.accountId}</Text>
                          <Text className="mt-0.5 text-[10px] text-muted">
                            {lot.quantity} shares · avg {formatMoney(lot.averagePrice, lot.currency)}
                          </Text>
                        </View>
                        <View className="flex-row gap-4">
                          <Pressable onPress={() => openEdit(lot)}>
                            <Text className="text-xs text-accent">Edit</Text>
                          </Pressable>
                          <Pressable onPress={() => setDeleteTarget(lot)}>
                            <Text className="text-xs text-negative">Delete</Text>
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
            <View className="mt-8 items-center">
              <Text className="text-sm text-muted">No holdings match current filters.</Text>
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
        <View className="flex-1 items-center justify-center bg-black/70 px-5">
          <View className="w-full rounded-2xl bg-surface p-5">
            <Text className="text-lg font-semibold text-text">Edit Holding</Text>
            <Text className="mt-0.5 text-sm text-muted">{editTarget?.symbol} · {editTarget?.companyName}</Text>

            <Text className="mt-5 text-xs text-muted">Account</Text>
            <View className="mt-2 flex-row flex-wrap gap-1.5">
              {accounts.map((account) => (
                <Pressable
                  key={account.id}
                  className={`rounded-full px-3 py-1 ${editDraft.accountId === account.id ? "bg-accent" : "bg-bg"}`}
                  onPress={() => setEditDraft((prev) => ({ ...prev, accountId: account.id }))}
                >
                  <Text className={`text-xs font-medium ${editDraft.accountId === account.id ? "text-bg" : "text-text"}`}>
                    {account.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={editDraft.quantity}
              onChangeText={(value) => setEditDraft((prev) => ({ ...prev, quantity: value }))}
              placeholder="Quantity"
              placeholderTextColor="#8B909A"
              keyboardType="decimal-pad"
              className="mt-4 rounded-xl bg-bg px-4 py-3 text-text"
            />
            <TextInput
              value={editDraft.averagePrice}
              onChangeText={(value) => setEditDraft((prev) => ({ ...prev, averagePrice: value }))}
              placeholder="Average buy price"
              placeholderTextColor="#8B909A"
              keyboardType="decimal-pad"
              className="mt-2 rounded-xl bg-bg px-4 py-3 text-text"
            />
            <TextInput
              value={editDraft.marketPrice}
              onChangeText={(value) => setEditDraft((prev) => ({ ...prev, marketPrice: value }))}
              placeholder="Current market price"
              placeholderTextColor="#8B909A"
              keyboardType="decimal-pad"
              className="mt-2 rounded-xl bg-bg px-4 py-3 text-text"
            />

            <View className="mt-6 flex-row justify-end gap-3">
              <Pressable className="px-4 py-2" onPress={() => setEditTarget(null)}>
                <Text className="text-muted">Cancel</Text>
              </Pressable>
              <Pressable className="rounded-xl bg-accent px-5 py-2.5" onPress={submitEdit}>
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
            <Text className="text-lg font-semibold text-text">Delete holding?</Text>
            <Text className="mt-1.5 text-sm text-muted">
              This removes <Text className="text-text">{deleteTarget?.symbol}</Text> permanently.
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

