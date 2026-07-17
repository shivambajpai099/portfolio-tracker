import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AddHoldingModal } from "../../src/components/AddHoldingModal";
import { ImportHoldingsModal } from "../../src/components/ImportHoldingsModal";
import { ImportTransactionsModal } from "../../src/components/ImportTransactionsModal";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { TickerImage } from "../../src/components/TickerImage";
import { Sparkline } from "../../src/components/Sparkline";
import { holdingCost, holdingMarketValue } from "../../src/features/portfolio/calculations";
import { fetchLivePrices, fetchSparklineData } from "../../src/services/yahooFinanceService";
import { toINR, toUSD } from "../../src/features/portfolio/selectors";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors as defaultColors, radii, spacing, typography, useTheme } from "../../src/theme";
import { accountSupportsHoldings, type Currency, type Holding } from "../../src/types/portfolio";
import type { Transaction } from "../../src/types/transaction";
import type { LivePriceQuote } from "../../src/types/marketData";
import { formatMoney } from "../../src/utils/format";

// Ticker color palette (shared with Overview screen)
const TICKER_PALETTE = [
  "#67E8F9",
  "#6366F1",
  "#F59E0B",
  "#22C55E",
  "#EC4899",
  "#3B82F6",
  "#A78BFA",
  "#F97316",
  "#14B8A6",
  "#E879F9",
];

/**
 * Deterministic color assignment based on ticker symbol hash.
 * Ensures consistent colors across renders and reorderings.
 */
const getTickerColor = (symbol: string): string => {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % TICKER_PALETTE.length;
  return TICKER_PALETTE[index];
};

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
  const { colors } = useTheme();
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
  const updateAccount = usePortfolioStore((state) => state.updateAccount);
  const setAccountTransactions = usePortfolioStore((state) => state.setAccountTransactions);
  const transactions = usePortfolioStore((state) => state.transactions);

  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value_desc");
  const [groupBy, setGroupBy] = useState<GroupByKey>("stock");
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("ALL");
  const [perfFilter, setPerfFilter] = useState<PerfFilter>("ALL");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedTab, setExpandedTab] = useState<Record<string, "accounts" | "transactions">>({});
  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [isAddVisible, setIsAddVisible] = useState(false);
  const [isImportVisible, setIsImportVisible] = useState(false);
  const [isImportMenuVisible, setIsImportMenuVisible] = useState(false);
  const [isImportTransactionsVisible, setIsImportTransactionsVisible] = useState(false);
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
      
      // Force refresh to bypass cache when user explicitly clicks refresh
      const result = await fetchLivePrices(uniqueSymbols, undefined, true);
      
      const quoteMap = new Map<string, LivePriceQuote>();
      
      // Use data if available, even if result.ok is false (cached data case)
      const quotes = result.data ?? [];
      for (const quote of quotes) {
        const exact = quote.symbol.toUpperCase();
        quoteMap.set(exact, quote);
        // Also map without suffix for flexible matching
        const normalized = normalizeIndiaTicker(exact);
        quoteMap.set(normalized, quote);
      }

      for (const holding of holdings) {
        const key = holding.symbol.toUpperCase();
        const normalizedKey = normalizeIndiaTicker(key);
        
        // Try exact match, then normalized (without suffix), then with .NS/.BO suffix
        const quote = quoteMap.get(key) 
          ?? quoteMap.get(normalizedKey)
          ?? quoteMap.get(`${normalizedKey}.NS`)
          ?? quoteMap.get(`${normalizedKey}.BO`);
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

  const toggleGroup = (id: string, symbol: string) => {
    const isCurrentlyExpanded = expandedGroups[id];
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
    
    // Set default tab to accounts when expanding
    if (!isCurrentlyExpanded) {
      setExpandedTab((prev) => ({ ...prev, [id]: "accounts" }));
      
      // Fetch sparkline data if not already cached
      if (!sparklineData[symbol]) {
        fetchSparklineData(symbol).then((result) => {
          if (result.ok && result.data) {
            setSparklineData((prev) => ({ ...prev, [symbol]: result.data }));
          }
        });
      }
    }
  };

  const getTickerTransactions = (symbol: string): Transaction[] => {
    const normalizedSymbol = normalizeIndiaTicker(symbol);
    return transactions
      .filter((tx) => normalizeIndiaTicker(tx.symbol) === normalizedSymbol)
      .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
  };

  // Memoize visible symbol list for sparkline fetching
  const visibleSymbols = useMemo(
    () => visibleGroups.slice(0, 10).map((g) => g.title),
    [visibleGroups]
  );

  // Fetch sparklines for visible holdings on mount
  useEffect(() => {
    visibleSymbols.forEach((symbol) => {
      if (!sparklineData[symbol]) {
        fetchSparklineData(symbol).then((result) => {
          if (result.ok && result.data) {
            setSparklineData((prev) => ({ ...prev, [symbol]: result.data }));
          }
        });
      }
    });
  }, [visibleSymbols]);

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
          <Pressable style={styles.importBtn} onPress={() => setIsImportMenuVisible(true)}>
            <Text style={styles.importBtnText}>Import ▾</Text>
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

      {/* Primary sort control + Filters button */}
      <View style={styles.controlRow}>
        <View style={styles.sortRow}>
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
        </View>
        <Pressable style={styles.filtersBtn} onPress={() => setShowFilters(true)}>
          <Text style={styles.filtersBtnText}>Filters</Text>
        </Pressable>
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
            const currentTab = expandedTab[group.id] ?? "accounts";
            const gainPositive = group.gainLoss >= 0;
            const tickerColor = getTickerColor(group.title);
            const displayValue = settings.allocationBasis === "INVESTED_VALUE" ? group.investedValue : group.currentValue;
            const sparkline = sparklineData[group.title] ?? [];
            const tickerTransactions = isExpanded && currentTab === "transactions" ? getTickerTransactions(group.title) : [];
            const accountCount = group.linkedAccountsLabel.length;

            return (
              <View key={group.id}>
                {/* Main row */}
                <View style={[styles.holdingRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.holdingLeft}>
                    <TickerImage symbol={group.title} size={28} fallbackColor={tickerColor} />
                    <View style={styles.holdingInfo}>
                      <View style={styles.holdingTickerRow}>
                        <Text style={[styles.holdingTicker, { color: colors.text }]}>{group.title}</Text>
                        <View style={[styles.allocationBadge, { backgroundColor: `${tickerColor}22` }]}>
                          <Text style={[styles.allocationBadgeText, { color: tickerColor }]}>
                            {group.allocationPct.toFixed(1)}%
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.holdingName, { color: colors.muted }]} numberOfLines={1} ellipsizeMode="tail">
                        {group.subtitle || group.title}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Sparkline */}
                  {sparkline.length >= 2 && (
                    <View style={styles.sparklineWrap}>
                      <Sparkline data={sparkline} width={48} height={20} />
                    </View>
                  )}
                  
                  <View style={styles.holdingRight}>
                    <Text style={[styles.holdingValue, { color: colors.text }]}>
                      {formatMoney(displayValue, settings.reportingCurrency)}
                    </Text>
                    <Text style={[styles.holdingGain, { color: gainPositive ? colors.positive : colors.negative }]}>
                      {gainPositive ? "+" : ""}{group.gainLossPct.toFixed(2)}% · {gainPositive ? "+" : ""}{formatMoney(group.gainLoss, settings.reportingCurrency)}
                    </Text>
                  </View>
                </View>

                {/* Account count chip + Details toggle — only in stock view */}
                {groupBy === "stock" && accountCount > 0 ? (
                  <View style={[styles.accountChipRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.accountCountChip, { backgroundColor: colors.surface, color: colors.muted }]}>
                      {accountCount} account{accountCount > 1 ? "s" : ""}
                    </Text>
                    <Pressable onPress={() => toggleGroup(group.id, group.title)} style={styles.detailsBtn}>
                      <Text style={[styles.detailsBtnText, { color: colors.accent }]}>
                        {isExpanded ? "Hide" : "Details"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {/* Expanded view with tabs */}
                {isExpanded ? (
                  <View style={[styles.expandedWrap, { borderBottomColor: colors.border }]}>
                    {/* Tab bar */}
                    <View style={styles.tabBar}>
                      <Pressable
                        onPress={() => setExpandedTab((prev) => ({ ...prev, [group.id]: "accounts" }))}
                        style={[styles.tab, currentTab === "accounts" && styles.tabActive]}
                      >
                        <Text style={[styles.tabText, currentTab === "accounts" && { color: colors.accent }]}>
                          Accounts
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setExpandedTab((prev) => ({ ...prev, [group.id]: "transactions" }))}
                        style={[styles.tab, currentTab === "transactions" && styles.tabActive]}
                      >
                        <Text style={[styles.tabText, currentTab === "transactions" && { color: colors.accent }]}>
                          Transactions
                        </Text>
                      </Pressable>
                    </View>

                    {/* Accounts tab content */}
                    {currentTab === "accounts" && (
                      <View style={styles.tabContent}>
                        {group.lots.map((lot) => {
                          const lotCurrent = toRC(holdingMarketValue(lot), lot.currency);
                          const lotInvested = toRC(holdingCost(lot), lot.currency);
                          const lotGain = lotCurrent - lotInvested;
                          const lotGainPositive = lotGain >= 0;
                          return (
                            <View key={lot.id} style={styles.lotRow}>
                              <View style={styles.lotInfo}>
                                {groupBy !== "stock" ? (
                                  <Text style={[styles.lotSymbol, { color: colors.text }]}>{lot.symbol} · {lot.companyName}</Text>
                                ) : null}
                                <Text style={[styles.lotAccount, { color: colors.text }]}>{accountNameById.get(lot.accountId) ?? lot.accountId}</Text>
                                <Text style={[styles.lotMeta, { color: colors.muted }]}>
                                  {lot.quantity} shares · avg {formatMoney(lot.averagePrice, lot.currency)}
                                  {"  "}· cur {formatMoney(lot.marketPrice, lot.currency)}
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
                    )}

                    {/* Transactions tab content */}
                    {currentTab === "transactions" && (
                      <View style={styles.tabContent}>
                        {tickerTransactions.length === 0 ? (
                          <Text style={[styles.noTransactionsText, { color: colors.muted }]}>
                            No transaction history for {group.title}
                          </Text>
                        ) : (
                          tickerTransactions.map((tx) => (
                            <View key={tx.id} style={styles.transactionRow}>
                              <View style={styles.transactionLeft}>
                                <View style={[
                                  styles.transactionTypeBadge,
                                  { backgroundColor: tx.type === "BUY" ? `${colors.positive}22` : `${colors.negative}22` }
                                ]}>
                                  <Text style={[
                                    styles.transactionTypeText,
                                    { color: tx.type === "BUY" ? colors.positive : colors.negative }
                                  ]}>
                                    {tx.type}
                                  </Text>
                                </View>
                                <View style={styles.transactionInfo}>
                                  <Text style={[styles.transactionDate, { color: colors.text }]}>
                                    {new Date(tx.transactionDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                                  </Text>
                                  <Text style={[styles.transactionMeta, { color: colors.muted }]}>
                                    {tx.quantity} @ {formatMoney(tx.pricePerShare, tx.currency)}
                                  </Text>
                                </View>
                              </View>
                              <Text style={[styles.transactionAmount, { color: colors.text }]}>
                                {formatMoney(tx.quantity * tx.pricePerShare, tx.currency)}
                              </Text>
                            </View>
                          ))
                        )}
                      </View>
                    )}
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

      <ImportHoldingsModal
        visible={isImportVisible}
        accounts={brokerAccounts}
        existingHoldings={holdings}
        onClose={() => setIsImportVisible(false)}
        onComplete={(result) => {
          console.log(`Imported ${result.addedCount} new, ${result.updatedCount} updated to ${result.accountName}`);
        }}
        addHolding={addHolding}
        updateHolding={updateHolding}
        updateAccount={updateAccount}
      />

      <ImportTransactionsModal
        visible={isImportTransactionsVisible}
        accounts={brokerAccounts}
        onClose={() => setIsImportTransactionsVisible(false)}
        onComplete={(result) => {
          console.log(`Imported ${result.transactionCount} transactions, ${result.derivedHoldingCount} derived holdings to ${result.accountName}`);
        }}
        setAccountTransactions={setAccountTransactions}
        updateAccount={updateAccount}
      />

      {/* Import Menu Modal */}
      <Modal visible={isImportMenuVisible} transparent animationType="fade" onRequestClose={() => setIsImportMenuVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsImportMenuVisible(false)}>
          <View style={styles.importMenuCard}>
            <Text style={styles.importMenuTitle}>Import Data</Text>
            <Pressable
              style={styles.importMenuItem}
              onPress={() => {
                setIsImportMenuVisible(false);
                setIsImportVisible(true);
              }}
            >
              <Text style={styles.importMenuItemTitle}>Import Holdings</Text>
              <Text style={styles.importMenuItemDesc}>Import current holdings snapshot from your broker</Text>
            </Pressable>
            <Pressable
              style={styles.importMenuItem}
              onPress={() => {
                setIsImportMenuVisible(false);
                setIsImportTransactionsVisible(true);
              }}
            >
              <Text style={styles.importMenuItemTitle}>Import Transactions</Text>
              <Text style={styles.importMenuItemDesc}>Import buy/sell history to derive holdings with FIFO cost basis</Text>
            </Pressable>
            <Pressable style={styles.importMenuCancel} onPress={() => setIsImportMenuVisible(false)}>
              <Text style={styles.importMenuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

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

      {/* Filters Modal */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Filters</Text>

            {/* Group-by options */}
            <Text style={styles.modalLabel}>Group by</Text>
            <View style={styles.modalPillRow}>
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
                    style={[styles.modalPill, active && styles.modalPillActive]}
                    onPress={() => { setGroupBy(key); setExpandedGroups({}); }}
                  >
                    <Text style={[styles.modalPillText, active && styles.modalPillTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Allocation basis / cash inclusion */}
            <Text style={styles.modalLabel}>Allocation settings</Text>
            <View style={styles.modalPillRow}>
              {([
                ["CURRENT_VALUE", "Current %"],
                ["INVESTED_VALUE", "Invested %"],
              ] as const).map(([basis, label]) => {
                const active = settings.allocationBasis === basis;
                return (
                  <Pressable
                    key={basis}
                    style={[styles.modalPill, active && styles.modalPillActive]}
                    onPress={() => updateSettings({ allocationBasis: basis })}
                  >
                    <Text style={[styles.modalPillText, active && styles.modalPillTextActive]}>{label}</Text>
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
                    style={[styles.modalPill, active && styles.modalPillActive]}
                    onPress={() => updateSettings({ allocationIncludeCash: include })}
                  >
                    <Text style={[styles.modalPillText, active && styles.modalPillTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Sort + filter options */}
            <Text style={styles.modalLabel}>Sort & Filter</Text>
            <View style={styles.modalPillRow}>
              {([
                ["value_desc", "Value"],
                ["allocation_desc", "Alloc"],
                ["gain_desc", "Gain"],
                ["alpha_asc", "A–Z"],
              ] as const).map(([key, label]) => {
                const active = sortKey === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.modalPill, active && styles.modalPillActive]}
                    onPress={() => setSortKey(key)}
                  >
                    <Text style={[styles.modalPillText, active && styles.modalPillTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}

              {(["ALL", "INR", "USD"] as CurrencyFilter[]).map((value) => {
                const active = currencyFilter === value;
                return (
                  <Pressable
                    key={value}
                    style={[styles.modalPill, active && styles.modalPillActive]}
                    onPress={() => setCurrencyFilter(value)}
                  >
                    <Text style={[styles.modalPillText, active && styles.modalPillTextActive]}>{value}</Text>
                  </Pressable>
                );
              })}

              {(["ALL", "GAIN", "LOSS"] as PerfFilter[]).map((value) => {
                const active = perfFilter === value;
                return (
                  <Pressable
                    key={value}
                    style={[styles.modalPill, active && styles.modalPillActive]}
                    onPress={() => setPerfFilter(value)}
                  >
                    <Text style={[styles.modalPillText, active && styles.modalPillTextActive]}>{value}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setShowFilters(false)}>
                <Text style={styles.ghostText}>Close</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={clearFilters}>
                <Text style={styles.primaryText}>Clear All</Text>
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
    color: defaultColors.muted,
    fontSize: typography.caption,
  },
  headerTitle: {
    color: defaultColors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  refreshBtn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: defaultColors.muted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  refreshBtnDisabled: {
    opacity: 0.6,
  },
  refreshBtnText: {
    color: defaultColors.muted,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  addBtn: {
    borderRadius: radii.pill,
    backgroundColor: defaultColors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  addBtnText: {
    color: defaultColors.bg,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  importBtn: {
    borderRadius: radii.pill,
    backgroundColor: defaultColors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  importBtnText: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
  searchInput: {
    marginBottom: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: defaultColors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: defaultColors.text,
    fontSize: typography.body,
  },
  controlRow: {
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sortRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
  },
  filtersBtn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: defaultColors.muted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  filtersBtnText: {
    color: defaultColors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
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
    backgroundColor: defaultColors.surface,
  },
  chipActive: {
    backgroundColor: defaultColors.accent,
  },
  chipText: {
    color: defaultColors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  chipTextActive: {
    color: defaultColors.bg,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: spacing.xs,
    backgroundColor: defaultColors.border,
  },
  listWrap: {
    marginTop: spacing.lg,
    gap: 0,
    paddingBottom: spacing.xxxl,
  },
  // Holdings list rows (matches Overview screen style)
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  holdingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  holdingInfo: {
    flex: 1,
  },
  holdingTickerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  holdingTicker: {
    fontSize: typography.body,
    fontWeight: typography.weightBold,
  },
  allocationBadge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  allocationBadgeText: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  holdingName: {
    fontSize: typography.micro,
    marginTop: 1,
  },
  sparklineWrap: {
    marginHorizontal: spacing.sm,
  },
  holdingRight: {
    alignItems: "flex-end",
  },
  holdingValue: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    fontVariant: ["tabular-nums"],
  },
  holdingGain: {
    fontSize: typography.micro,
    marginTop: 1,
  },
  accountChipRow: {
    paddingVertical: spacing.sm,
    paddingLeft: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  accountCountChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    fontSize: typography.micro,
    overflow: "hidden",
  },
  detailsBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  detailsBtnText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  expandedWrap: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBar: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: defaultColors.border,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: defaultColors.accent,
    marginBottom: -StyleSheet.hairlineWidth,
  },
  tabText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
    color: defaultColors.muted,
  },
  tabContent: {
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
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  lotAccount: {
    fontSize: typography.caption,
  },
  lotMeta: {
    marginTop: 2,
    fontSize: typography.micro,
  },
  lotActions: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  editText: {
    color: defaultColors.accent,
    fontSize: typography.caption,
  },
  deleteText: {
    color: defaultColors.negative,
    fontSize: typography.caption,
  },
  noTransactionsText: {
    fontSize: typography.caption,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  transactionTypeBadge: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    minWidth: 36,
    alignItems: "center",
  },
  transactionTypeText: {
    fontSize: typography.micro,
    fontWeight: typography.weightSemibold,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDate: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  transactionMeta: {
    fontSize: typography.micro,
    marginTop: 1,
  },
  transactionAmount: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
    fontVariant: ["tabular-nums"],
  },
  emptyWrap: {
    marginTop: spacing.xxxl,
    alignItems: "center",
  },
  emptyCard: {
    borderRadius: radii.xl,
    backgroundColor: defaultColors.surface,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  emptyText: {
    marginTop: spacing.xs,
    color: defaultColors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  emptyPrimaryBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    borderRadius: radii.lg,
    backgroundColor: defaultColors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyPrimaryBtnText: {
    color: defaultColors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  positiveText: {
    color: defaultColors.positive,
  },
  negativeText: {
    color: defaultColors.negative,
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
    backgroundColor: defaultColors.surface,
    padding: spacing.xl,
  },
  modalTitle: {
    color: defaultColors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  modalSubTitle: {
    marginTop: 2,
    color: defaultColors.muted,
    fontSize: typography.body,
  },
  modalLabel: {
    marginTop: spacing.xl,
    color: defaultColors.muted,
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
    backgroundColor: defaultColors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  modalPillActive: {
    backgroundColor: defaultColors.accent,
  },
  modalPillText: {
    color: defaultColors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  modalPillTextActive: {
    color: defaultColors.bg,
  },
  modalInput: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: defaultColors.bg,
    color: defaultColors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalInputCompact: {
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: defaultColors.bg,
    color: defaultColors.text,
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
    color: defaultColors.muted,
  },
  primaryBtn: {
    borderRadius: radii.lg,
    backgroundColor: defaultColors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  dangerBtn: {
    borderRadius: radii.lg,
    backgroundColor: defaultColors.negative,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  primaryText: {
    color: defaultColors.text,
    fontWeight: typography.weightSemibold,
  },
  modalDangerText: {
    marginTop: spacing.sm,
    color: defaultColors.muted,
    fontSize: typography.body,
  },
  importMenuCard: {
    width: "100%",
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
