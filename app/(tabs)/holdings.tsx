import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AddHoldingModal } from "../../src/components/AddHoldingModal";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { holdingCost, holdingMarketValue } from "../../src/features/portfolio/calculations";
import { fetchLivePrices } from "../../src/services/yahooFinanceService";
import { toINR, toUSD } from "../../src/features/portfolio/selectors";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors, radii, spacing, typography } from "../../src/theme";
import { accountSupportsHoldings, type Currency, type Holding } from "../../src/types/portfolio";
import type { LivePriceQuote } from "../../src/types/marketData";
import { formatMoney } from "../../src/utils/format";

type SortKey = "allocation_desc" | "gain_desc" | "alpha_asc" | "value_desc";
type PerfFilter = "ALL" | "GAIN" | "LOSS";
type CurrencyFilter = "ALL" | Currency;
type GroupByKey = "stock" | "account" | "country" | "asset_type";

type DisplayGroup = {
  id: string;
  title: string;
  subtitle: string;
  investedValue: number;
  currentValue: number;
  gainLoss: number;
  gainLossPct: number;
  allocationPct: number;
  netWorthPct: number;
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

const normalizeIndiaTicker = (symbol: string): string => symbol.trim().toUpperCase().replace(/\.(NS|BO)$/i, "");

const isIndiaHolding = (holding: Holding): boolean => {
  const sym = holding.symbol.toUpperCase();
  return holding.currency === "INR" || sym.endsWith(".NS") || sym.endsWith(".BO");
};

export default function HoldingsScreen() {
  const router = useRouter();
  const settings = usePortfolioStore((state) => state.settings);
  const updateSettings = usePortfolioStore((state) => state.updateSettings);
  const accounts = usePortfolioStore((state) => state.accounts);
  const fxRates = usePortfolioStore((state) => state.fxRates);
  const holdings = usePortfolioStore((state) => state.holdings);
  const cashHoldings = usePortfolioStore((state) => state.cashHoldings);
  const addHolding = usePortfolioStore((state) => state.addHolding);
  const updateHolding = usePortfolioStore((state) => state.updateHolding);
  const removeHolding = usePortfolioStore((state) => state.removeHolding);

  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value_desc");
  const [groupBy, setGroupBy] = useState<GroupByKey>("stock");
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("ALL");
  const [perfFilter, setPerfFilter] = useState<PerfFilter>("ALL");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isAddVisible, setIsAddVisible] = useState(false);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [lastPricesRefreshedAt, setLastPricesRefreshedAt] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Holding | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holding | null>(null);
    const [editDraft, setEditDraft] = useState<EditDraft>({
    accountId: "",
    quantity: "",
    averagePrice: "",
    marketPrice: "",
    });

    const brokerAccounts = useMemo(
    () => accounts.filter((account) => accountSupportsHoldings(account.type)),
    [accounts]
    );

  const accountById = useMemo(() => {
    const map = new Map<string, (typeof accounts)[0]>();
    for (const account of accounts) map.set(account.id, account);
    return map;
  }, [accounts]);

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(account.id, `${account.name} (${account.owner})`);
    }
    return map;
  }, [accounts]);

  const toRC = (value: number, currency: Currency): number =>
    settings.reportingCurrency === "INR"
      ? toINR(value, currency, fxRates)
      : toUSD(value, currency, fxRates);

  const formatRelativeTime = (iso: string): string => {
    const diffMs = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) {
      return "just now";
    }

    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const refreshAllMarketPrices = async () => {
    if (isRefreshingPrices || holdings.length === 0) {
      return;
    }

    setIsRefreshingPrices(true);
    try {
      const requestSymbols = new Set<string>();
      for (const holding of holdings) {
        const symbol = holding.symbol.trim().toUpperCase();
        requestSymbols.add(symbol);

        if (isIndiaHolding(holding) && !symbol.endsWith(".NS") && !symbol.endsWith(".BO")) {
          requestSymbols.add(`${symbol}.NS`);
        }
      }

      const uniqueSymbols = [...requestSymbols];
      const result = await fetchLivePrices(uniqueSymbols);
      const quoteMap = new Map<string, LivePriceQuote>();
      if (result.ok && result.data) {
        for (const quote of result.data) {
          const exact = quote.symbol.toUpperCase();
          quoteMap.set(exact, quote);
          quoteMap.set(normalizeIndiaTicker(exact), quote);
        }
      }

      for (const holding of holdings) {
        const key = holding.symbol.toUpperCase();
        const quote = quoteMap.get(key) ?? quoteMap.get(normalizeIndiaTicker(key));
        if (!quote) {
          continue;
        }

        updateHolding(holding.id, {
          marketPrice: quote.price,
          updatedAt: nowIso(),
        });
      }

      setLastPricesRefreshedAt(result.fetchedAt ?? nowIso());
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  const totalCashRC = useMemo(
    () => cashHoldings.reduce((sum, c) => sum + toRC(c.balance, c.currency), 0),
    [cashHoldings, settings.reportingCurrency, fxRates.USDINR]
  );

  // Returns the group identity for a holding based on the active groupBy key.
  const getGroupMeta = (holding: Holding): { id: string; title: string; subtitle: string } => {
    const symbol = holding.symbol.toUpperCase();
    const india = isIndiaHolding(holding);
    switch (groupBy) {
      case "account": {
        const acct = accountById.get(holding.accountId);
        return {
          id: holding.accountId,
          title: acct?.name ?? holding.accountId,
          subtitle: acct ? `${acct.broker} · ${acct.owner}` : "",
        };
      }
      case "country":
        return india
          ? { id: "india", title: "India", subtitle: "" }
          : { id: "us", title: "United States", subtitle: "" };
      case "asset_type":
        return india
          ? { id: "india_equity", title: "Indian Equities", subtitle: "INR-denominated stocks" }
          : { id: "intl_equity", title: "International Equities", subtitle: "USD-denominated stocks" };
      case "stock":
      default:
        return { id: symbol, title: symbol, subtitle: holding.companyName };
    }
  };

  const displayGroups = useMemo<DisplayGroup[]>(() => {
    const grouped = new Map<string, DisplayGroup>();

    for (const holding of holdings) {
      const { id, title, subtitle } = getGroupMeta(holding);
      const invested = toRC(holdingCost(holding), holding.currency);
      const current = toRC(holdingMarketValue(holding), holding.currency);
      const accountLabel = accountNameById.get(holding.accountId) ?? holding.accountId;

      const existing = grouped.get(id);
      if (!existing) {
        grouped.set(id, {
          id,
          title,
          subtitle,
          investedValue: invested,
          currentValue: current,
          gainLoss: current - invested,
          gainLossPct: 0,
          allocationPct: 0,
          netWorthPct: 0,
          linkedAccountsLabel: [accountLabel],
          currencies: [holding.currency],
          lots: [holding],
        });
        continue;
      }

      existing.investedValue += invested;
      existing.currentValue += current;
      existing.gainLoss = existing.currentValue - existing.investedValue;
      if (!existing.linkedAccountsLabel.includes(accountLabel)) {
        existing.linkedAccountsLabel.push(accountLabel);
      }
      if (!existing.currencies.includes(holding.currency)) {
        existing.currencies.push(holding.currency);
      }
      existing.lots.push(holding);
    }

    const values = [...grouped.values()];

    const totalCurrentHoldings = values.reduce((sum, g) => sum + g.currentValue, 0);
    const netWorthTotal = totalCurrentHoldings + totalCashRC;
    const totalBasis = values.reduce(
      (sum, g) => sum + (settings.allocationBasis === "INVESTED_VALUE" ? g.investedValue : g.currentValue),
      0
    );
    const allocationDenom = totalBasis + (settings.allocationIncludeCash ? totalCashRC : 0);

    for (const item of values) {
      item.gainLossPct = item.investedValue > 0 ? (item.gainLoss / item.investedValue) * 100 : 0;
      const basisValue = settings.allocationBasis === "INVESTED_VALUE" ? item.investedValue : item.currentValue;
      item.allocationPct = allocationDenom > 0 ? (basisValue / allocationDenom) * 100 : 0;
      item.netWorthPct = netWorthTotal > 0 ? (item.currentValue / netWorthTotal) * 100 : 0;
    }

    return values;
  }, [holdings, accounts, accountNameById, groupBy, settings.reportingCurrency, settings.allocationBasis, settings.allocationIncludeCash, fxRates.USDINR, totalCashRC]);

  const visibleGroups = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return displayGroups
      .filter((group) => {
        const matchesQuery =
          query.length === 0 ||
          group.title.toLowerCase().includes(query) ||
          group.subtitle.toLowerCase().includes(query) ||
          group.linkedAccountsLabel.join(" ").toLowerCase().includes(query) ||
          group.lots.some((l) => l.symbol.toLowerCase().includes(query) || l.companyName.toLowerCase().includes(query));
        const matchesCurrency = currencyFilter === "ALL" || group.currencies.includes(currencyFilter);
        const matchesPerf =
          perfFilter === "ALL" ||
          (perfFilter === "GAIN" && group.gainLoss >= 0) ||
          (perfFilter === "LOSS" && group.gainLoss < 0);
        return matchesQuery && matchesCurrency && matchesPerf;
      })
      .sort((a, b) => {
        if (sortKey === "alpha_asc") return a.title.localeCompare(b.title);
        if (sortKey === "allocation_desc") return b.allocationPct - a.allocationPct;
        if (sortKey === "gain_desc") return b.gainLoss - a.gainLoss;
        return b.currentValue - a.currentValue; // value_desc
      });
  }, [displayGroups, searchText, currencyFilter, perfFilter, sortKey]);

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
    if (!editTarget) return;
    const quantity = parseNumber(editDraft.quantity);
    const averagePrice = parseNumber(editDraft.averagePrice);
    const marketPrice = parseNumber(editDraft.marketPrice);
    const validAccount = brokerAccounts.some((account) => account.id === editDraft.accountId);
    if (!validAccount || quantity <= 0 || averagePrice <= 0 || marketPrice <= 0) return;
    updateHolding(editTarget.id, { accountId: editDraft.accountId, quantity, averagePrice, marketPrice, updatedAt: nowIso() });
    setEditTarget(null);
    };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    removeHolding(deleteTarget.id);
    setDeleteTarget(null);
  };

  const toggleGroup = (id: string) =>
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  const clearFilters = () => {
    setSearchText("");
    setCurrencyFilter("ALL");
    setPerfFilter("ALL");
    setSortKey("value_desc");
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Holdings</Text>
        <View style={styles.headerActions}>
          <Pressable style={[styles.refreshBtn, isRefreshingPrices && styles.refreshBtnDisabled]} onPress={refreshAllMarketPrices} disabled={isRefreshingPrices || holdings.length === 0}>
            <Text style={styles.refreshBtnText}>{isRefreshingPrices ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => setIsAddVisible(true)}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>
      {lastPricesRefreshedAt ? (
        <Text style={styles.refreshMeta}>Prices refreshed {formatRelativeTime(lastPricesRefreshedAt)}</Text>
      ) : null}

      {/* Search */}
      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search ticker, company or account"
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
      />

      {/* Group-by chips */}
      <View style={styles.chipWrap}>
        {([
          ["stock", "Stock"],
          ["account", "Account"],
          ["country", "Country"],
          ["asset_type", "Type"],
        ] as const).map(([key, label]) => {
          const active = groupBy === key;
          return (
            <Pressable
              key={key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => { setGroupBy(key); setExpandedGroups({}); }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Allocation basis / cash inclusion filters */}
      <View style={styles.chipWrap}>
        {([
          ["CURRENT_VALUE", "Current %"],
          ["INVESTED_VALUE", "Invested %"],
        ] as const).map(([basis, label]) => {
          const active = settings.allocationBasis === basis;
          return (
            <Pressable
              key={basis}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => updateSettings({ allocationBasis: basis })}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}

        {([
          [true, "Include Cash"],
          [false, "Exclude Cash"],
        ] as const).map(([include, label]) => {
          const active = settings.allocationIncludeCash === include;
          return (
            <Pressable
              key={label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => updateSettings({ allocationIncludeCash: include })}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Sort + filter chips */}
      <View style={styles.chipWrap}>
        {([
          ["value_desc", "Value"],
          ["allocation_desc", "Alloc"],
          ["gain_desc", "Gain"],
          ["alpha_asc", "A–Z"],
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
          {holdings.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{brokerAccounts.length === 0 ? "No broker account yet" : "No holdings yet"}</Text>
              {brokerAccounts.length === 0 ? (
                <>
                  <Text style={styles.emptyText}>Holdings are missing because you do not have a broker account linked yet.</Text>
                  <Text style={styles.emptyText}>Create a broker account first, then come back here to add your first holding.</Text>
                  <Pressable style={styles.emptyPrimaryBtn} onPress={() => router.push("/(tabs)/accounts" as never)}>
                    <Text style={styles.emptyPrimaryBtnText}>Add Broker Account</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.emptyText}>Your holdings list is empty because no investments have been added yet.</Text>
                  <Text style={styles.emptyText}>Add your first holding to start tracking performance and allocation.</Text>
                  <Pressable style={styles.emptyPrimaryBtn} onPress={() => setIsAddVisible(true)}>
                    <Text style={styles.emptyPrimaryBtnText}>Add Holding</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}

          {holdings.length > 0 ? visibleGroups.map((group) => {
            const isExpanded = Boolean(expandedGroups[group.id]);
            const gainPositive = group.gainLoss >= 0;

            return (
              <View key={group.id} style={styles.groupCard}>
                <Pressable onPress={() => toggleGroup(group.id)}>
                  {/* Title row */}
                  <View style={styles.groupTitleRow}>
                    <View style={styles.groupTitleWrap}>
                      <Text style={styles.groupSymbol}>{group.title}</Text>
                      {group.subtitle ? <Text style={styles.groupName}>{group.subtitle}</Text> : null}
                    </View>
                    <View style={styles.allocationBlock}>
                      <Text style={styles.groupAllocation}>{group.allocationPct.toFixed(1)}%</Text>
                      <Text style={styles.allocationContext}>
                        {settings.allocationBasis === "INVESTED_VALUE" ? "invested" : "current"}
                        {settings.allocationIncludeCash ? "" : " · excl. cash"}
                      </Text>
                    </View>
                  </View>


                  {/* Metrics row */}
                  <View style={styles.metricRow}>
                    <View>
                      <Text style={styles.metricLabel}>Invested</Text>
                      <Text style={styles.metricValue}>{formatMoney(group.investedValue, settings.reportingCurrency)}</Text>
                    </View>
                    <View style={styles.metricCenter}>
                      <View style={styles.metricLabelRow}>
                        <Text style={styles.metricLabel}>Current</Text>
                        <Text style={styles.netWorthBadge}>{group.netWorthPct.toFixed(1)}% of net worth</Text>
                      </View>
                      <Text style={styles.metricValue}>{formatMoney(group.currentValue, settings.reportingCurrency)}</Text>
                    </View>
                    <View style={styles.metricRight}>
                      <Text style={styles.metricLabel}>Gain / Loss</Text>
                      <Text style={[styles.metricValue, gainPositive ? styles.positiveText : styles.negativeText]}>
                        {gainPositive ? "+" : ""}{formatMoney(group.gainLoss, settings.reportingCurrency)}
                      </Text>
                      <Text style={[styles.gainLossPct, gainPositive ? styles.positiveText : styles.negativeText]}>
                        {gainPositive ? "+" : ""}{group.gainLossPct.toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                </Pressable>

                {/* Account chips — only in stock view */}
                {groupBy === "stock" ? (
                  <View style={styles.accountChipWrap}>
                    {group.linkedAccountsLabel.map((label) => (
                      <Text key={`${group.id}-${label}`} style={styles.accountChip}>{label}</Text>
                    ))}
                  </View>
                ) : null}

                {/* Expanded lots */}
                {isExpanded ? (
                  <View style={styles.expandedWrap}>
                    {group.lots.map((lot) => {
                      const lotCurrent = toRC(holdingMarketValue(lot), lot.currency);
                      const lotInvested = toRC(holdingCost(lot), lot.currency);
                      const lotGain = lotCurrent - lotInvested;
                      const lotGainPositive = lotGain >= 0;
                      return (
                        <View key={lot.id} style={styles.lotRow}>
                          <View style={styles.lotInfo}>
                            {groupBy !== "stock" ? (
                              <Text style={styles.lotSymbol}>{lot.symbol} · {lot.companyName}</Text>
                            ) : null}
                            <Text style={styles.lotAccount}>{accountNameById.get(lot.accountId) ?? lot.accountId}</Text>
                            <Text style={styles.lotMeta}>
                              {lot.quantity} shares · avg {formatMoney(lot.averagePrice, lot.currency)}
                              {"  "}
                              · cur {formatMoney(lot.marketPrice, lot.currency)}
                              {"  "}
                              <Text style={[lotGainPositive ? styles.positiveText : styles.negativeText]}>
                                {lotGainPositive ? "+" : ""}{formatMoney(lotGain, settings.reportingCurrency)}
                              </Text>
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
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          }) : null}

          {holdings.length > 0 && visibleGroups.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No results for these filters</Text>
              <Text style={styles.emptyText}>Your holdings are still there, but current filters hide them.</Text>
              <Text style={styles.emptyText}>Clear filters to view everything again.</Text>
              <Pressable style={styles.emptyPrimaryBtn} onPress={clearFilters}>
                <Text style={styles.emptyPrimaryBtnText}>Clear Filters</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <AddHoldingModal
        visible={isAddVisible}
        accounts={brokerAccounts}
        onClose={() => setIsAddVisible(false)}
        onCreate={(input) => {
          addHolding({
            id: createHoldingId(),
            accountId: input.accountId,
            symbol: input.symbol,
            companyName: input.companyName,
            quantity: input.quantity,
            averagePrice: input.averagePrice,
            marketPrice: input.marketPrice,
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
              {brokerAccounts.map((account) => {
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  refreshMeta: {
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
    color: colors.muted,
    fontSize: typography.caption,
  },
  headerTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  refreshBtn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.muted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  refreshBtnDisabled: {
    opacity: 0.6,
  },
  refreshBtnText: {
    color: colors.muted,
    fontSize: typography.body,
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
  allocationBlock: {
    alignItems: "flex-end",
  },
  groupAllocation: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  allocationContext: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typography.micro,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  metricCenter: {
    alignItems: "center",
  },
  metricLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: typography.micro,
  },
  netWorthBadge: {
    color: colors.muted,
    fontSize: typography.micro,
    opacity: 0.7,
  },
  metricValue: {
    marginTop: 2,
    color: colors.text,
    fontSize: typography.body,
  },
  metricRight: {
    alignItems: "flex-end",
  },
  gainLossPct: {
    fontSize: typography.micro,
    marginTop: 1,
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
  lotSymbol: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
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
  emptyCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  emptyText: {
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
