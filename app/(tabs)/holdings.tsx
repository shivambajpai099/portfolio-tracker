import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { AddHoldingModal } from "../../src/components/AddHoldingModal";
import { AddAccountModal, type AddAccountInput } from "../../src/components/AddAccountModal";
import { ImportTransactionsModal } from "../../src/components/ImportTransactionsModal";
import { TourTarget } from "../../src/components/OnboardingTourProvider";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { TickerImage } from "../../src/components/TickerImage";
import { HoldingAvatar } from "../../src/components/HoldingAvatar";
import { HoldingPerformanceChart } from "../../src/components/HoldingPerformanceChart";
import { calcHoldingPerformanceHistory, holdingCost, holdingMarketValue } from "../../src/features/portfolio/calculations";
import { selectAllHoldings } from "../../src/features/portfolio/selectors";
import { fetchLivePrices, resolveSymbolByIsin } from "../../src/services/yahooFinanceService";
import { toINR, toUSD } from "../../src/features/portfolio/selectors";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors as defaultColors, radii, spacing, typography, useTheme } from "../../src/theme";
import { spec } from "../../src/theme/specTokens";
import { accountSupportsHoldings, type Currency, type Holding, type TrimHistoryEntry } from "../../src/types/portfolio";
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

type SortColumn = "holding" | "invested" | "current" | "alloc";
type SortDirection = "desc" | "asc";
type GroupByKey = "stock" | "account";
type MarketFilter = "ALL" | "INDIA" | "US";

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
const DEFAULT_TRIM_CEILING_PCT = 7;
const DEFAULT_TRIM_TRIGGER_PCT = 20;
const DEFAULT_TRIM_SLICE_PCT = 12;
const TRIM_CEILING_MIN = 1;
const TRIM_CEILING_MAX = 100;
const TRIM_TRIGGER_MIN = 1;
const TRIM_TRIGGER_MAX = 200;
const TRIM_SLICE_MIN = 1;
const TRIM_SLICE_MAX = 100;

type TrimAlertInput = {
  shares: number;
  costBasisPrice: number;
  currentPrice: number;
  currentAllocPct: number;
  ceilingPct?: number;
  lastTrimPrice?: number | null;
  trimTriggerPct?: number;
  trimSlicePct?: number;
};

type TrimAlertResult = {
  shouldTrim: boolean;
  suggestedShares: number;
  gainSinceReference: number;
  isOverCeiling: boolean;
};

type TrimSettingsDraft = {
  ceilingPct: string;
  trimTriggerPct: string;
  trimSlicePct: string;
};

type TrimMarkDraft = {
  sharesTrimmed: string;
  price: string;
  date: string;
};

const resolveTrimSettings = (
  holding: Pick<Holding, "ceilingPct" | "trimTriggerPct" | "trimSlicePct"> | undefined
): { ceilingPct: number; trimTriggerPct: number; trimSlicePct: number } => ({
  ceilingPct: holding?.ceilingPct ?? DEFAULT_TRIM_CEILING_PCT,
  trimTriggerPct: holding?.trimTriggerPct ?? DEFAULT_TRIM_TRIGGER_PCT,
  trimSlicePct: holding?.trimSlicePct ?? DEFAULT_TRIM_SLICE_PCT,
});

const calcTrimAlert = (holding: TrimAlertInput): TrimAlertResult => {
  const referencePrice = holding.lastTrimPrice ?? holding.costBasisPrice;
  const validReferencePrice = referencePrice > 0 ? referencePrice : holding.currentPrice;
  const gainSinceReference = validReferencePrice > 0 ? (holding.currentPrice - validReferencePrice) / validReferencePrice : 0;
  const ceilingPct = holding.ceilingPct ?? DEFAULT_TRIM_CEILING_PCT;
  const trimTriggerPct = holding.trimTriggerPct ?? DEFAULT_TRIM_TRIGGER_PCT;
  const trimSlicePct = holding.trimSlicePct ?? DEFAULT_TRIM_SLICE_PCT;
  const isOverCeiling = holding.currentAllocPct > ceilingPct;
  const shouldTrim = isOverCeiling && gainSinceReference >= trimTriggerPct / 100;
  const suggestedShares = Math.round(holding.shares * (trimSlicePct / 100));
  return { shouldTrim, suggestedShares, gainSinceReference, isOverCeiling };
};

const toDateInputValue = (isoOrDate: string): string => {
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
};

const parseDateInput = (value: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return null;
  }
  const normalized = `${value.trim()}T00:00:00.000Z`;
  return Number.isNaN(new Date(normalized).getTime()) ? null : normalized;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const TrimStatusCard = ({
  alertInput,
  allocationPct,
  ceilingPct,
  trimTriggerPct,
}: {
  alertInput: TrimAlertInput;
  allocationPct: number;
  ceilingPct: number;
  trimTriggerPct: number;
}) => {
  const trimAlert = calcTrimAlert(alertInput);
  const stateColor = trimAlert.shouldTrim ? defaultColors.negative : trimAlert.isOverCeiling ? "#D39A3E" : defaultColors.muted;
  const gainSinceReferencePct = trimAlert.gainSinceReference * 100;
  const remainingGainPct = Math.max(0, trimTriggerPct - gainSinceReferencePct);
  const allocationScaleMax = Math.max(allocationPct, ceilingPct, 1);
  const allocationFillPct = clamp((allocationPct / allocationScaleMax) * 100, 0, 100);
  const gainProgressPct = trimTriggerPct > 0 ? clamp((gainSinceReferencePct / trimTriggerPct) * 100, 0, 100) : 0;
  const verdict = !trimAlert.isOverCeiling
    ? "Within target allocation — no trim suggested"
    : trimAlert.shouldTrim
      ? `Trim suggested: ~${trimAlert.suggestedShares.toLocaleString()} shares`
      : `Over ceiling — waiting for +${remainingGainPct.toFixed(1)}% more gain to trigger`;

  return (
    <View style={styles.trimStatusWrap}>
      <Text style={[styles.trimVerdictText, { color: stateColor }]}>{verdict}</Text>
      <View style={[styles.trimStatusDetails, !trimAlert.isOverCeiling && styles.trimStatusDetailsMuted]}>
        <Text style={[styles.trimProgressLabel, { color: stateColor }]}>
        {allocationPct.toFixed(1)}% / {ceilingPct.toFixed(1)}% ceiling
        </Text>
        <View style={styles.trimProgressTrack}>
          <View style={[styles.trimProgressFill, { width: `${allocationFillPct}%`, backgroundColor: stateColor }]} />
        </View>
        {trimAlert.shouldTrim ? (
          <Text style={[styles.trimProgressSubLabel, { color: stateColor }]}>
            {gainSinceReferencePct >= 0 ? "+" : ""}
            {gainSinceReferencePct.toFixed(1)}% since reference
          </Text>
        ) : (
          <>
            <Text style={[styles.trimProgressSubLabel, { color: stateColor }]}>
              {gainSinceReferencePct >= 0 ? "+" : ""}
              {gainSinceReferencePct.toFixed(1)}% of +{trimTriggerPct.toFixed(1)}% trigger gain
            </Text>
            <View style={[styles.trimProgressTrack, styles.trimProgressTrackThin]}>
              <View style={[styles.trimProgressFill, { width: `${gainProgressPct}%`, backgroundColor: stateColor }]} />
            </View>
          </>
        )}
      </View>
    </View>
  );
};

/**
 * Full-precision currency formatting for the mobile row — always 2 decimals,
 * no compact/rounded notation. Indian digit grouping for INR (₹2,57,339.79),
 * Western grouping for USD ($257,339.79).
 */
const formatMoneyFull = (value: number, currency: Currency): string => {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
const createHoldingId = () => `h-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const createAccountId = () => `acc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const createCashId = () => `cash-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const parseNumber = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const normalizeIndiaTicker = (symbol: string): string => symbol.trim().toUpperCase().replace(/\.(NS|BO)$/i, "");

const isIndiaHolding = (holding: Holding): boolean => {
  const sym = holding.symbol.toUpperCase();
  return holding.currency === "INR" || sym.endsWith(".NS") || sym.endsWith(".BO");
};

export function HoldingsSection() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  // On narrow viewports the three value columns don't comfortably fit, so the
  // secondary Invested figure (header + per-row value) is hidden. Current + Alloc stay.
  const hideInvested = viewportWidth < 480;
  // Below this width we swap the column table for a single stacked-column row list.
  const isMobile = viewportWidth < 768;
  const settings = usePortfolioStore((state) => state.settings);
  const trimBySymbol = usePortfolioStore((state) => state.trimBySymbol);
  const accounts = usePortfolioStore((state) => state.accounts);
  const fxRates = usePortfolioStore((state) => state.fxRates);
  const manualHoldings = usePortfolioStore((state) => state.holdings);
  const cashHoldings = usePortfolioStore((state) => state.cashHoldings);
  const addHolding = usePortfolioStore((state) => state.addHolding);
  const updateHolding = usePortfolioStore((state) => state.updateHolding);
  const removeHolding = usePortfolioStore((state) => state.removeHolding);
  const updateAccount = usePortfolioStore((state) => state.updateAccount);
  const recordTrimEvent = usePortfolioStore((state) => state.recordTrimEvent);
  const addAccount = usePortfolioStore((state) => state.addAccount);
  const addCashHolding = usePortfolioStore((state) => state.addCashHolding);
  const setAccountTransactions = usePortfolioStore((state) => state.setAccountTransactions);
  const transactions = usePortfolioStore((state) => state.transactions);
  const marketPrices = usePortfolioStore((state) => state.marketPrices);
  const updateMarketPrices = usePortfolioStore((state) => state.updateMarketPrices);

  // Convert marketPrices record to Map for selectAllHoldings
  const priceMap = useMemo(() => new Map(Object.entries(marketPrices)), [marketPrices]);

  // Combine manual holdings + derived holdings from transaction-sourced accounts
  const holdings = useMemo(
    () => selectAllHoldings(manualHoldings, transactions, accounts, priceMap),
    [manualHoldings, transactions, accounts, priceMap]
  );

  const [searchText, setSearchText] = useState("");
  // Default to highest allocation first so the largest positions surface at top.
  const [sortColumn, setSortColumn] = useState<SortColumn | null>("alloc");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [groupBy, setGroupBy] = useState<GroupByKey>("stock");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("ALL");
  const [showCash, setShowCash] = useState(false);
  const [cashInfoVisible, setCashInfoVisible] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedTab, setExpandedTab] = useState<Record<string, "accounts" | "transactions" | "info" | "trim">>({});
  const [isAddVisible, setIsAddVisible] = useState(false);
  const [isAddMenuVisible, setIsAddMenuVisible] = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const addBtnRef = useRef<View>(null);
  const [isAddAccountVisible, setIsAddAccountVisible] = useState(false);
  const [pendingImportAccountId, setPendingImportAccountId] = useState<string | null>(null);
  const [isImportTransactionsVisible, setIsImportTransactionsVisible] = useState(false);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [lastPricesRefreshedAt, setLastPricesRefreshedAt] = useState<string | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [hoveredHeader, setHoveredHeader] = useState<SortColumn | null>(null);
  const [collapsedAccounts, setCollapsedAccounts] = useState<Record<string, boolean>>({});
  const [trimSettingsDrafts, setTrimSettingsDrafts] = useState<Record<string, TrimSettingsDraft>>({});
  const [trimSettingsErrors, setTrimSettingsErrors] = useState<Record<string, string>>({});
  const [trimMarkDrafts, setTrimMarkDrafts] = useState<Record<string, TrimMarkDraft>>({});
  const [trimMarkErrors, setTrimMarkErrors] = useState<Record<string, string>>({});
  const [openTrimMarkForm, setOpenTrimMarkForm] = useState<Record<string, boolean>>({});

  // Subtle continuous spin for the refresh icon while a refresh is in-flight.
  const spinValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isRefreshingPrices) {
      const loop = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
        })
      );
      loop.start();
      return () => {
        loop.stop();
        spinValue.setValue(0);
      };
    }
    spinValue.setValue(0);
  }, [isRefreshingPrices, spinValue]);
  const spin = spinValue.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
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
        const alreadySuffixed = symbol.endsWith(".NS") || symbol.endsWith(".BO");

        if (isIndiaHolding(holding) && !alreadySuffixed) {
          // Indian tickers frequently collide with a same-symbol US listing
          // (e.g. bare "TATAPOWER"/"MMTC"). Fetching the bare symbol would
          // return the US quote in USD. Request ONLY the exchange-suffixed
          // variants so we always get the Indian price (or none at all —
          // never the wrong US one).
          requestSymbols.add(`${symbol}.NS`);
          requestSymbols.add(`${symbol}.BO`);
        } else {
          requestSymbols.add(symbol);
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

      // Build a record of all fetched prices for transaction-derived holdings
      const fetchedPrices: Record<string, number> = {};

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

        // Store the price for this symbol (for transaction-derived holdings)
        fetchedPrices[key] = quote.price;
        // Also store normalized key for flexible matching
        if (normalizedKey !== key) {
          fetchedPrices[normalizedKey] = quote.price;
        }

        // Update manual holdings directly
        const quoteName = quote.companyName?.trim();
        const currentNameIsTicker =
          !holding.companyName ||
          normalizeIndiaTicker(holding.companyName) === normalizedKey;
        updateHolding(holding.id, {
          marketPrice: quote.price,
          // Backfill a real company name when the holding only has the ticker.
          ...(quoteName && quoteName.toUpperCase() !== key && currentNameIsTicker
            ? { companyName: quoteName }
            : {}),
          updatedAt: nowIso(),
        });
      }

      // ISIN fallback: for INR holdings whose ticker didn't resolve (e.g. an
      // NSE symbol rename), resolve the current symbol from the permanent ISIN
      // and fetch that. Requires the market-data proxy (no-op otherwise).
      const isinTargets = holdings.filter((holding) => {
        if (!isIndiaHolding(holding) || !holding.isin) return false;
        const key = holding.symbol.toUpperCase();
        return fetchedPrices[key] === undefined && fetchedPrices[normalizeIndiaTicker(key)] === undefined;
      });

      if (isinTargets.length > 0) {
        await Promise.all(
          isinTargets.map(async (holding) => {
            try {
              const resolvedSymbol = await resolveSymbolByIsin(holding.isin as string);
              if (!resolvedSymbol) return;
              const priceResult = await fetchLivePrices([resolvedSymbol], undefined, true);
              const quote = (priceResult.data ?? [])[0];
              if (!quote) return;

              const key = holding.symbol.toUpperCase();
              const normalizedKey = normalizeIndiaTicker(key);
              fetchedPrices[key] = quote.price;
              if (normalizedKey !== key) {
                fetchedPrices[normalizedKey] = quote.price;
              }
              updateHolding(holding.id, { marketPrice: quote.price, updatedAt: nowIso() });
            } catch {
              // Ignore — leave this holding on its last-known / cost-basis price.
            }
          })
        );
      }

      // Update the centralized market prices in store (for transaction-derived holdings)
      if (Object.keys(fetchedPrices).length > 0) {
        updateMarketPrices(fetchedPrices);
      }
      
      setLastPricesRefreshedAt(result.fetchedAt ?? nowIso());
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  // Apply the Holdings-level market filter (India / US / all).
  const marketHoldings = useMemo(() => {
    if (marketFilter === "ALL") return holdings;
    return holdings.filter((h) => (marketFilter === "INDIA" ? isIndiaHolding(h) : !isIndiaHolding(h)));
  }, [holdings, marketFilter]);

  const marketCashHoldings = useMemo(() => {
    if (marketFilter === "ALL") return cashHoldings;
    return cashHoldings.filter((c) => (marketFilter === "INDIA" ? c.currency === "INR" : c.currency === "USD"));
  }, [cashHoldings, marketFilter]);

  const totalCashRC = useMemo(
    () => marketCashHoldings.reduce((sum, c) => sum + toRC(c.balance, c.currency), 0),
    [marketCashHoldings, settings.reportingCurrency, fxRates.USDINR]
  );

  // Global allocation denominator + net-worth total so every row's allocation %
  // is computed against the whole (filtered) portfolio regardless of grouping.
  // Cash is included when the "Include cash" toggle is on.
  const allocationContext = useMemo(() => {
    let totalCurrent = 0;
    let totalInvested = 0;
    for (const holding of marketHoldings) {
      totalCurrent += toRC(holdingMarketValue(holding), holding.currency);
      totalInvested += toRC(holdingCost(holding), holding.currency);
    }
    const cashRC = showCash ? totalCashRC : 0;
    const totalBasis = settings.allocationBasis === "INVESTED_VALUE" ? totalInvested : totalCurrent;
    return {
      allocationDenom: totalBasis + cashRC,
      netWorthTotal: totalCurrent + totalCashRC,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketHoldings, showCash, totalCashRC, settings.allocationBasis, settings.reportingCurrency, fxRates.USDINR]);

  // Build display rows grouped by symbol from a subset of holdings. Holdings
  // remain the primary rows; when the subset is a single account this yields
  // that account's holdings, when it's everything it merges lots per symbol.
  const buildSymbolRows = (subset: Holding[], idPrefix: string): DisplayGroup[] => {
    const { allocationDenom, netWorthTotal } = allocationContext;
    const grouped = new Map<string, DisplayGroup>();

    for (const holding of subset) {
      const symbol = holding.symbol.toUpperCase();
      const invested = toRC(holdingCost(holding), holding.currency);
      const current = toRC(holdingMarketValue(holding), holding.currency);
      const accountLabel = accountNameById.get(holding.accountId) ?? holding.accountId;
      const key = `${idPrefix}${symbol}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          id: key,
          title: symbol,
          subtitle: holding.companyName,
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
      if (!existing.linkedAccountsLabel.includes(accountLabel)) existing.linkedAccountsLabel.push(accountLabel);
      if (!existing.currencies.includes(holding.currency)) existing.currencies.push(holding.currency);
      existing.lots.push(holding);
    }

    const values = [...grouped.values()];
    for (const item of values) {
      item.gainLossPct = item.investedValue > 0 ? (item.gainLoss / item.investedValue) * 100 : 0;
      const basisValue = settings.allocationBasis === "INVESTED_VALUE" ? item.investedValue : item.currentValue;
      item.allocationPct = allocationDenom > 0 ? (basisValue / allocationDenom) * 100 : 0;
      item.netWorthPct = netWorthTotal > 0 ? (item.currentValue / netWorthTotal) * 100 : 0;
    }
    return values;
  };

  // Search (ticker/company only) + sort applied to a set of rows.
  const filterAndSortRows = (rows: DisplayGroup[]): DisplayGroup[] => {
    const query = searchText.trim().toLowerCase();
    const filtered = rows.filter((group) =>
      query.length === 0 ||
      group.lots.some((l) => l.symbol.toLowerCase().includes(query) || l.companyName.toLowerCase().includes(query))
    );

    if (!sortColumn) return filtered; // default order

    const ascCompare = (a: DisplayGroup, b: DisplayGroup): number => {
      switch (sortColumn) {
        case "holding":
          return a.title.localeCompare(b.title);
        case "invested":
          return a.investedValue - b.investedValue;
        case "current":
          return a.currentValue - b.currentValue;
        case "alloc":
          return a.allocationPct - b.allocationPct;
        default:
          return 0;
      }
    };

    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => dir * ascCompare(a, b));
  };

  // Cycle a column through desc → asc → off (default order).
  const handleSort = (column: SortColumn) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("desc");
    } else if (sortDirection === "desc") {
      setSortDirection("asc");
    } else {
      setSortColumn(null);
      setSortDirection("desc");
    }
  };

  // Flat (ungrouped) list of holding rows.
  const flatRows = useMemo(
    () => filterAndSortRows(buildSymbolRows(marketHoldings, "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketHoldings, allocationContext, searchText, sortColumn, sortDirection, settings.allocationBasis, settings.reportingCurrency, fxRates.USDINR]
  );

  // Per-account sections: account header + that account's holding rows (+ cash).
  const accountSections = useMemo(() => {
    const byAccount = new Map<string, Holding[]>();
    for (const holding of marketHoldings) {
      const arr = byAccount.get(holding.accountId) ?? [];
      arr.push(holding);
      byAccount.set(holding.accountId, arr);
    }
    const sections: {
      account: (typeof accounts)[number];
      rows: DisplayGroup[];
      cashRC: number;
      investedTotal: number;
      currentTotal: number;
      allocTotal: number;
    }[] = [];
    for (const account of accounts) {
      const accHoldings = byAccount.get(account.id);
      const rows = accHoldings ? filterAndSortRows(buildSymbolRows(accHoldings, `${account.id}:`)) : [];
      const cashRC = showCash
        ? marketCashHoldings.filter((c) => c.accountId === account.id).reduce((sum, c) => sum + toRC(c.balance, c.currency), 0)
        : 0;
      if (rows.length === 0 && cashRC <= 0) continue;
      const investedTotal = rows.reduce((sum, r) => sum + r.investedValue, 0);
      const currentTotal = rows.reduce((sum, r) => sum + r.currentValue, 0) + cashRC;
      const allocTotal = rows.reduce((sum, r) => sum + r.allocationPct, 0)
        + (allocationContext.allocationDenom > 0 ? (cashRC / allocationContext.allocationDenom) * 100 : 0);
      sections.push({ account, rows, cashRC, investedTotal, currentTotal, allocTotal });
    }
    return sections;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketHoldings, accounts, marketCashHoldings, showCash, allocationContext, searchText, sortColumn, sortDirection, settings.allocationBasis, settings.reportingCurrency, fxRates.USDINR]);

  // Whether any rows are visible after filtering (drives the empty state).
  const hasVisibleRows =
    groupBy === "account"
      ? accountSections.length > 0
      : flatRows.length > 0 || (showCash && totalCashRC > 0);

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

  const toggleGroup = (id: string) => {
    const isCurrentlyExpanded = expandedGroups[id];
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
    
    // Set default tab to accounts when expanding
    if (!isCurrentlyExpanded) {
      setExpandedTab((prev) => ({ ...prev, [id]: "accounts" }));
    }
  };

  const getTickerTransactions = (symbol: string): Transaction[] => {
    const normalizedSymbol = normalizeIndiaTicker(symbol);
    return transactions
      .filter((tx) => normalizeIndiaTicker(tx.symbol) === normalizedSymbol)
      .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
  };

  const clearFilters = () => {
    setSearchText("");
    setSortColumn(null);
    setSortDirection("desc");
  };

  const setTrimDraftField = (groupId: string, key: keyof TrimSettingsDraft, value: string) => {
    setTrimSettingsDrafts((prev) => ({
      ...prev,
      [groupId]: {
        ...(prev[groupId] ?? {
          ceilingPct: String(DEFAULT_TRIM_CEILING_PCT),
          trimTriggerPct: String(DEFAULT_TRIM_TRIGGER_PCT),
          trimSlicePct: String(DEFAULT_TRIM_SLICE_PCT),
        }),
        [key]: value,
      },
    }));
  };

  const nudgeTrimSetting = (
    groupId: string,
    key: keyof TrimSettingsDraft,
    fallback: number,
    min: number,
    max: number,
    delta: number
  ) => {
    const currentRaw = trimSettingsDrafts[groupId]?.[key] ?? String(fallback);
    const current = parseNumber(currentRaw);
    const base = Number.isFinite(current) ? current : fallback;
    const next = clamp(base + delta, min, max);
    setTrimDraftField(groupId, key, String(next));
    setTrimSettingsErrors((prev) => ({ ...prev, [groupId]: "" }));
  };

  const saveTrimSettings = (group: DisplayGroup) => {
    const draft = trimSettingsDrafts[group.id];
    if (!draft) return;
    const ceilingPct = parseNumber(draft.ceilingPct);
    const trimTriggerPct = parseNumber(draft.trimTriggerPct);
    const trimSlicePct = parseNumber(draft.trimSlicePct);
    if (!Number.isFinite(ceilingPct) || !Number.isFinite(trimTriggerPct) || !Number.isFinite(trimSlicePct)) {
      setTrimSettingsErrors((prev) => ({ ...prev, [group.id]: "Enter valid numbers for all three settings." }));
      return;
    }
    if (ceilingPct < TRIM_CEILING_MIN || ceilingPct > TRIM_CEILING_MAX) {
      setTrimSettingsErrors((prev) => ({
        ...prev,
        [group.id]: `Ceiling must be between ${TRIM_CEILING_MIN} and ${TRIM_CEILING_MAX}.`,
      }));
      return;
    }
    if (trimTriggerPct < TRIM_TRIGGER_MIN || trimTriggerPct > TRIM_TRIGGER_MAX) {
      setTrimSettingsErrors((prev) => ({
        ...prev,
        [group.id]: `Trigger must be between ${TRIM_TRIGGER_MIN} and ${TRIM_TRIGGER_MAX}.`,
      }));
      return;
    }
    if (trimSlicePct < TRIM_SLICE_MIN || trimSlicePct > TRIM_SLICE_MAX) {
      setTrimSettingsErrors((prev) => ({
        ...prev,
        [group.id]: `Slice must be between ${TRIM_SLICE_MIN} and ${TRIM_SLICE_MAX}.`,
      }));
      return;
    }
    const updatedAt = nowIso();
    for (const lot of group.lots) {
      updateHolding(lot.id, { ceilingPct, trimTriggerPct, trimSlicePct, updatedAt });
    }
    setTrimSettingsErrors((prev) => ({ ...prev, [group.id]: "" }));
    setTrimSettingsDrafts((prev) => ({
      ...prev,
      [group.id]: {
        ceilingPct: String(ceilingPct),
        trimTriggerPct: String(trimTriggerPct),
        trimSlicePct: String(trimSlicePct),
      },
    }));
  };

  const openMarkTrimForm = (group: DisplayGroup, defaultPrice: number) => {
    setTrimMarkDrafts((prev) => ({
      ...prev,
      [group.id]: prev[group.id] ?? {
        sharesTrimmed: "",
        price: defaultPrice > 0 ? String(defaultPrice) : "",
        date: toDateInputValue(nowIso()),
      },
    }));
    setTrimMarkErrors((prev) => ({ ...prev, [group.id]: "" }));
    setOpenTrimMarkForm((prev) => ({ ...prev, [group.id]: true }));
  };

  const submitTrimMark = (group: DisplayGroup) => {
    const draft = trimMarkDrafts[group.id];
    if (!draft) return;
    const sharesTrimmed = parseNumber(draft.sharesTrimmed);
    const price = parseNumber(draft.price);
    const parsedDate = parseDateInput(draft.date);
    const totalShares = group.lots.reduce((sum, lot) => sum + lot.quantity, 0);
    if (!Number.isFinite(sharesTrimmed) || sharesTrimmed <= 0) {
      setTrimMarkErrors((prev) => ({ ...prev, [group.id]: "Enter a valid shares sold value." }));
      return;
    }
    if (sharesTrimmed > totalShares) {
      setTrimMarkErrors((prev) => ({
        ...prev,
        [group.id]: `Shares sold cannot exceed current holding shares (${totalShares.toLocaleString(undefined, { maximumFractionDigits: 4 })}).`,
      }));
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setTrimMarkErrors((prev) => ({ ...prev, [group.id]: "Enter a valid trim price." }));
      return;
    }
    if (!parsedDate) {
      setTrimMarkErrors((prev) => ({ ...prev, [group.id]: "Use date format YYYY-MM-DD." }));
      return;
    }
    const trimEvent: TrimHistoryEntry = { date: parsedDate, price, sharesTrimmed };
    recordTrimEvent(group.title, trimEvent);
    setTrimMarkErrors((prev) => ({ ...prev, [group.id]: "" }));
    setOpenTrimMarkForm((prev) => ({ ...prev, [group.id]: false }));
    setTrimMarkDrafts((prev) => ({
      ...prev,
      [group.id]: {
        ...(prev[group.id] ?? { sharesTrimmed: "", price: String(price), date: toDateInputValue(parsedDate) }),
        sharesTrimmed: "",
      },
    }));
  };

  // Open the Add / Import dropdowns anchored just below their buttons.
  const openAddMenu = () => {
    addBtnRef.current?.measureInWindow((x, y, width, height) => {
      setAddMenuAnchor({ top: y + height + 6, right: Math.max(spacing.md, viewportWidth - (x + width)) });
      setIsAddMenuVisible(true);
    });
  };

  const handleCreateAccount = (input: AddAccountInput) => {
    const timestamp = nowIso();
    const accountId = createAccountId();
    addAccount({
      id: accountId,
      name: input.name,
      owner: input.owner,
      broker: input.broker,
      type: input.type,
      baseCurrency: input.baseCurrency,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (input.type === "SAVINGS") {
      addCashHolding({
        id: createCashId(),
        accountId,
        currency: input.baseCurrency,
        balance: input.savingsInitialBalance ?? 0,
        updatedAt: timestamp,
      });
    }

    setIsAddAccountVisible(false);

    // For brokerage-style accounts, immediately offer to import data into the
    // account that was just created (preselected in the import flow).
    if (accountSupportsHoldings(input.type)) {
      setPendingImportAccountId(accountId);
      setIsImportTransactionsVisible(true);
    }
  };

  // Renders a single holding row (with expand/collapse + tabs).
  const renderHoldingRow = (group: DisplayGroup, indent = false) => {
    const isExpanded = Boolean(expandedGroups[group.id]);
    const currentTab = expandedTab[group.id] ?? "accounts";
    const gainPositive = group.gainLoss >= 0;
    const tickerColor = getTickerColor(group.title);
    const tickerTransactions =
      isExpanded && (currentTab === "transactions" || currentTab === "info") ? getTickerTransactions(group.title) : [];
    const primaryLot = group.lots[0];
    const trimSettingsSource =
      group.lots.find(
        (lot) =>
          typeof lot.ceilingPct === "number" ||
          typeof lot.trimTriggerPct === "number" ||
          typeof lot.trimSlicePct === "number"
      ) ?? primaryLot;
    const trimSettings = resolveTrimSettings(trimSettingsSource);
    const trimSymbolKey = normalizeIndiaTicker(group.title);
    const trimState = trimBySymbol[trimSymbolKey] ?? { lastTrimPrice: null, history: [] };
    const totalShares = group.lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const totalCostNative = group.lots.reduce((sum, lot) => sum + lot.quantity * lot.averagePrice, 0);
    const weightedAvgCost = totalShares > 0 ? totalCostNative / totalShares : 0;
    const weightedMarketPrice =
      totalShares > 0 ? group.lots.reduce((sum, lot) => sum + lot.quantity * lot.marketPrice, 0) / totalShares : 0;
    const trimAlertInput: TrimAlertInput = {
      shares: totalShares,
      costBasisPrice: weightedAvgCost,
      currentPrice: weightedMarketPrice,
      currentAllocPct: group.allocationPct,
      ceilingPct: trimSettings.ceilingPct,
      lastTrimPrice: trimState.lastTrimPrice,
      trimTriggerPct: trimSettings.trimTriggerPct,
      trimSlicePct: trimSettings.trimSlicePct,
    };
    const trimSettingsDraft = trimSettingsDrafts[group.id] ?? {
      ceilingPct: String(trimSettings.ceilingPct),
      trimTriggerPct: String(trimSettings.trimTriggerPct),
      trimSlicePct: String(trimSettings.trimSlicePct),
    };
    const trimMarkDraft = trimMarkDrafts[group.id] ?? {
      sharesTrimmed: "",
      price: weightedMarketPrice > 0 ? String(weightedMarketPrice) : "",
      date: toDateInputValue(nowIso()),
    };
    const trimSettingsError = trimSettingsErrors[group.id];
    const trimMarkError = trimMarkErrors[group.id];
    const trimHistory = trimState.history;

    return (
      <View key={group.id}>
        {/* Main row - tappable to expand/collapse */}
        {isMobile ? (
          <Pressable
            onPress={() => toggleGroup(group.id)}
            style={({ pressed }) => [
              styles.mobileRow,
              indent && styles.colHoldingIndent,
              { borderBottomColor: colors.border },
              (isExpanded || pressed) && { backgroundColor: colors.surface },
            ]}
          >
            <HoldingAvatar symbol={group.title} fallbackColor={tickerColor} size={40} />
            <View style={styles.mobileIdentity}>
              <Text style={[styles.mobileTicker, { color: colors.text }]} numberOfLines={1}>
                {group.title}
              </Text>
              {group.subtitle && normalizeIndiaTicker(group.subtitle) !== normalizeIndiaTicker(group.title) ? (
                <Text style={[styles.mobileName, { color: colors.muted }]} numberOfLines={1} ellipsizeMode="tail">
                  {group.subtitle}
                </Text>
              ) : null}
            </View>
            <View style={styles.mobileValueStack}>
              <Text style={[styles.mobileAlloc, { color: colors.muted }]}>
                {group.allocationPct.toFixed(1)}% alloc
              </Text>
              <Text style={[styles.mobileCurrent, { color: colors.text }]}>
                {formatMoneyFull(group.currentValue, settings.reportingCurrency)}
              </Text>
              <Text style={styles.mobileInvestedLine}>
                <Text style={{ color: colors.muted }}>
                  {formatMoneyFull(group.investedValue, settings.reportingCurrency)} inv{" · "}
                </Text>
                <Text style={[styles.mobileGainPct, { color: gainPositive ? colors.positive : colors.negative }]}>
                  {gainPositive ? "+" : ""}{group.gainLossPct.toFixed(2)}%
                </Text>
              </Text>
            </View>
          </Pressable>
        ) : (
        <Pressable
          onPress={() => toggleGroup(group.id)}
          onHoverIn={() => setHoveredRowId(group.id)}
          onHoverOut={() => setHoveredRowId((prev) => (prev === group.id ? null : prev))}
          style={[
            styles.gridRow,
            styles.rowInteractive,
            (isExpanded || hoveredRowId === group.id) && { backgroundColor: colors.surface },
            !isExpanded && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <View style={[styles.colHolding, indent && styles.colHoldingIndent]}>
            <TickerImage symbol={group.title} size={28} fallbackColor={tickerColor} />
            <View style={styles.holdingInfo}>
              <View style={styles.holdingTickerRow}>
                <Text style={[styles.holdingTicker, { color: colors.text }]}>{group.title}</Text>
              </View>
              {/* Company name below the ticker — hidden when it's absent or just
                  repeats the ticker (e.g. derived holdings without a real name). */}
              {group.subtitle && normalizeIndiaTicker(group.subtitle) !== normalizeIndiaTicker(group.title) ? (
                <Text style={[styles.holdingName, { color: colors.muted }]} numberOfLines={1} ellipsizeMode="tail">
                  {group.subtitle}
                </Text>
              ) : null}
            </View>
            {/* Expand/collapse chevron (revealed on hover or when expanded) */}
            <Text style={[styles.rowChevron, { color: colors.muted }, (isExpanded || hoveredRowId === group.id) ? styles.rowChevronVisible : null]}>
              {isExpanded ? "▴" : "▾"}
            </Text>
          </View>

          {!hideInvested ? (
            <View style={styles.cellInvested}>
              <Text style={styles.valueInvested}>
                {formatMoney(group.investedValue, settings.reportingCurrency)}
              </Text>
            </View>
          ) : null}

          <View style={styles.cellCurrent}>
            <Text style={styles.valueCurrent}>
              {formatMoney(group.currentValue, settings.reportingCurrency)}
            </Text>
            <Text style={[styles.valueGain, { color: gainPositive ? colors.positive : colors.negative }]}>
              {gainPositive ? "+" : ""}{formatMoney(group.gainLoss, settings.reportingCurrency)} ({gainPositive ? "+" : ""}{group.gainLossPct.toFixed(2)}%)
            </Text>
          </View>

          <View style={styles.cellAlloc}>
            <Text style={[styles.valueAlloc, { color: colors.text }]}>
              {group.allocationPct.toFixed(1)}%
            </Text>
          </View>
        </Pressable>
        )}

        {/* Expanded view with tabs */}
        {isExpanded ? (
          <View style={[styles.expandedWrap, { borderBottomColor: colors.border }]}>
            <View style={styles.tabBar}>
              <Pressable
                onPress={() => setExpandedTab((prev) => ({ ...prev, [group.id]: "accounts" }))}
                style={[styles.tab, currentTab === "accounts" && styles.tabActive]}
              >
                <Text style={[styles.tabText, currentTab === "accounts" && { color: colors.accent }]}>Accounts</Text>
              </Pressable>
              <Pressable
                onPress={() => setExpandedTab((prev) => ({ ...prev, [group.id]: "transactions" }))}
                style={[styles.tab, currentTab === "transactions" && styles.tabActive]}
              >
                <Text style={[styles.tabText, currentTab === "transactions" && { color: colors.accent }]}>Transactions</Text>
              </Pressable>
              <Pressable
                onPress={() => setExpandedTab((prev) => ({ ...prev, [group.id]: "info" }))}
                style={[styles.tab, currentTab === "info" && styles.tabActive]}
              >
                <Text style={[styles.tabText, currentTab === "info" && { color: colors.accent }]}>Info</Text>
              </Pressable>
              <Pressable
                onPress={() => setExpandedTab((prev) => ({ ...prev, [group.id]: "trim" }))}
                style={[styles.tab, currentTab === "trim" && styles.tabActive]}
              >
                <Text style={[styles.tabText, currentTab === "trim" && { color: colors.accent }]}>Trim</Text>
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

            {/* Info tab content — four stat blocks + performance chart */}
            {currentTab === "info" && (
              <View style={styles.infoTabWrap}>
                {(() => {
                  const firstHolding = group.lots[0];
                  const holdingCurrency = firstHolding?.currency ?? settings.reportingCurrency;
                  const totalShares = group.lots.reduce((sum, lot) => sum + lot.quantity, 0);
                  const totalCostNative = group.lots.reduce((sum, lot) => sum + lot.quantity * lot.averagePrice, 0);
                  const avgCost = totalShares > 0 ? totalCostNative / totalShares : 0;
                  const marketPrice = firstHolding?.marketPrice ?? 0;
                  const returnPositive = group.gainLoss >= 0;
                  const gainSign = returnPositive ? "+" : "";
                  const gainColor = returnPositive ? colors.positive : colors.negative;

                  const performancePoints = calcHoldingPerformanceHistory(
                    tickerTransactions.map((tx) => ({
                      transactionDate: tx.transactionDate,
                      type: tx.type,
                      quantity: tx.quantity,
                      pricePerShare: tx.pricePerShare,
                    })),
                    marketPrice,
                    group.title,
                    holdingCurrency
                  ).points;

                  // Extend the series to "today" using the latest market
                  // value — but only when there is real transaction history.
                  // For holdings without transactions the series is empty and
                  // we intentionally leave it so, otherwise a lone synthetic
                  // point (where market value equals cost) makes the invested
                  // and current lines converge into a single point.
                  if (performancePoints.length > 0) {
                    const todayIso = new Date().toISOString().split("T")[0] + "T00:00:00.000Z";
                    const todayDateOnly = todayIso.split("T")[0];
                    const todayCurrentValue = totalShares * marketPrice;
                    const lastPoint = performancePoints[performancePoints.length - 1];
                    if (lastPoint.date.split("T")[0] === todayDateOnly) {
                      // Refresh the existing today point with the latest values.
                      lastPoint.invested = totalCostNative;
                      lastPoint.current = todayCurrentValue;
                    } else {
                      performancePoints.push({
                        date: todayIso,
                        invested: totalCostNative,
                        current: todayCurrentValue,
                      });
                    }
                  }

                  return (
                    <>
                      {/* Four-block stat row */}
                      <View style={styles.statGrid}>
                        <View style={styles.statBlock}>
                          <Text style={styles.statBlockLabel}>Shares</Text>
                          <Text style={styles.statBlockValue}>
                            {totalShares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </Text>
                        </View>
                        <View style={styles.statBlock}>
                          <Text style={styles.statBlockLabel}>Avg price</Text>
                          <Text style={styles.statBlockValue}>{formatMoney(avgCost, holdingCurrency)}</Text>
                        </View>
                        <View style={styles.statBlock}>
                          <Text style={styles.statBlockLabel}>Market price</Text>
                          <Text style={styles.statBlockValue}>{formatMoney(marketPrice, holdingCurrency)}</Text>
                        </View>
                        <View style={styles.statBlock}>
                          <Text style={styles.statBlockLabel}>Gain / Loss</Text>
                          <Text style={[styles.statBlockValue, { color: gainColor }]}>
                            {gainSign}{formatMoney(group.gainLoss, settings.reportingCurrency)}
                          </Text>
                          <Text style={[styles.statBlockSub, { color: gainColor }]}>
                            {gainSign}{group.gainLossPct.toFixed(2)}%
                          </Text>
                        </View>
                      </View>

                      {/* Performance chart card */}
                      <View style={styles.chartCard}>
                        <Text style={styles.perfLabel}>PERFORMANCE</Text>
                        <HoldingPerformanceChart
                          data={performancePoints}
                          currency={holdingCurrency}
                          sharesHeld={totalShares}
                          avgCost={avgCost}
                          currentPrice={marketPrice}
                        />
                      </View>
                    </>
                  );
                })()}
              </View>
            )}

            {currentTab === "trim" && (
              <View style={styles.trimTabWrap}>
                <TrimStatusCard
                  alertInput={trimAlertInput}
                  allocationPct={group.allocationPct}
                  ceilingPct={trimSettings.ceilingPct}
                  trimTriggerPct={trimSettings.trimTriggerPct}
                />

                <View style={styles.trimSettingsCard}>
                  <Text style={[styles.trimSectionTitle, { color: colors.text }]}>Trim settings for {group.title}</Text>
                  <View style={styles.trimSettingsList}>
                    <View style={styles.trimSettingRow}>
                      <Text style={[styles.trimSettingLabel, { color: colors.muted }]}>Ceiling %</Text>
                      <View style={styles.trimStepperRow}>
                        <Pressable
                          style={styles.trimStepperBtn}
                          onPress={() =>
                            nudgeTrimSetting(
                              group.id,
                              "ceilingPct",
                              trimSettings.ceilingPct,
                              TRIM_CEILING_MIN,
                              TRIM_CEILING_MAX,
                              -1
                            )
                          }
                        >
                          <Text style={[styles.trimStepperBtnText, { color: colors.text }]}>-</Text>
                        </Pressable>
                        <TextInput
                          value={trimSettingsDraft.ceilingPct}
                          onChangeText={(value) => {
                            setTrimDraftField(group.id, "ceilingPct", value);
                            setTrimSettingsErrors((prev) => ({ ...prev, [group.id]: "" }));
                          }}
                          keyboardType="decimal-pad"
                          style={[styles.trimInput, styles.trimStepperInput]}
                          placeholderTextColor={colors.muted}
                        />
                        <Pressable
                          style={styles.trimStepperBtn}
                          onPress={() =>
                            nudgeTrimSetting(
                              group.id,
                              "ceilingPct",
                              trimSettings.ceilingPct,
                              TRIM_CEILING_MIN,
                              TRIM_CEILING_MAX,
                              1
                            )
                          }
                        >
                          <Text style={[styles.trimStepperBtnText, { color: colors.text }]}>+</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.trimSettingRow}>
                      <Text style={[styles.trimSettingLabel, { color: colors.muted }]}>Trigger gain %</Text>
                      <View style={styles.trimStepperRow}>
                        <Pressable
                          style={styles.trimStepperBtn}
                          onPress={() =>
                            nudgeTrimSetting(
                              group.id,
                              "trimTriggerPct",
                              trimSettings.trimTriggerPct,
                              TRIM_TRIGGER_MIN,
                              TRIM_TRIGGER_MAX,
                              -1
                            )
                          }
                        >
                          <Text style={[styles.trimStepperBtnText, { color: colors.text }]}>-</Text>
                        </Pressable>
                        <TextInput
                          value={trimSettingsDraft.trimTriggerPct}
                          onChangeText={(value) => {
                            setTrimDraftField(group.id, "trimTriggerPct", value);
                            setTrimSettingsErrors((prev) => ({ ...prev, [group.id]: "" }));
                          }}
                          keyboardType="decimal-pad"
                          style={[styles.trimInput, styles.trimStepperInput]}
                          placeholderTextColor={colors.muted}
                        />
                        <Pressable
                          style={styles.trimStepperBtn}
                          onPress={() =>
                            nudgeTrimSetting(
                              group.id,
                              "trimTriggerPct",
                              trimSettings.trimTriggerPct,
                              TRIM_TRIGGER_MIN,
                              TRIM_TRIGGER_MAX,
                              1
                            )
                          }
                        >
                          <Text style={[styles.trimStepperBtnText, { color: colors.text }]}>+</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.trimSettingRow}>
                      <Text style={[styles.trimSettingLabel, { color: colors.muted }]}>Trim slice %</Text>
                      <View style={styles.trimStepperRow}>
                        <Pressable
                          style={styles.trimStepperBtn}
                          onPress={() =>
                            nudgeTrimSetting(
                              group.id,
                              "trimSlicePct",
                              trimSettings.trimSlicePct,
                              TRIM_SLICE_MIN,
                              TRIM_SLICE_MAX,
                              -1
                            )
                          }
                        >
                          <Text style={[styles.trimStepperBtnText, { color: colors.text }]}>-</Text>
                        </Pressable>
                        <TextInput
                          value={trimSettingsDraft.trimSlicePct}
                          onChangeText={(value) => {
                            setTrimDraftField(group.id, "trimSlicePct", value);
                            setTrimSettingsErrors((prev) => ({ ...prev, [group.id]: "" }));
                          }}
                          keyboardType="decimal-pad"
                          style={[styles.trimInput, styles.trimStepperInput]}
                          placeholderTextColor={colors.muted}
                        />
                        <Pressable
                          style={styles.trimStepperBtn}
                          onPress={() =>
                            nudgeTrimSetting(
                              group.id,
                              "trimSlicePct",
                              trimSettings.trimSlicePct,
                              TRIM_SLICE_MIN,
                              TRIM_SLICE_MAX,
                              1
                            )
                          }
                        >
                          <Text style={[styles.trimStepperBtnText, { color: colors.text }]}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  {trimSettingsError ? (
                    <Text style={[styles.trimHintText, { color: colors.negative }]}>{trimSettingsError}</Text>
                  ) : null}

                  <Pressable style={styles.trimPrimaryBtn} onPress={() => saveTrimSettings(group)}>
                    <Text style={styles.trimPrimaryBtnText}>Save settings</Text>
                  </Pressable>
                  <View style={styles.trimSectionDivider} />
                  <Text style={[styles.trimSectionTitle, { color: colors.text }]}>Mark as trimmed</Text>
                  <Pressable
                    style={styles.trimPrimaryBtn}
                    onPress={() => {
                      if (openTrimMarkForm[group.id]) {
                        setOpenTrimMarkForm((prev) => ({ ...prev, [group.id]: false }));
                        return;
                      }
                      openMarkTrimForm(group, weightedMarketPrice);
                    }}
                  >
                    <Text style={styles.trimPrimaryBtnText}>{openTrimMarkForm[group.id] ? "Hide form" : "Mark as trimmed"}</Text>
                  </Pressable>

                  {openTrimMarkForm[group.id] ? (
                    <View style={styles.trimMarkFormWrap}>
                      <Text style={[styles.trimInputLabel, { color: colors.muted }]}>Shares sold</Text>
                      <TextInput
                        value={trimMarkDraft.sharesTrimmed}
                        onChangeText={(value) => {
                          setTrimMarkDrafts((prev) => ({
                            ...prev,
                            [group.id]: { ...trimMarkDraft, sharesTrimmed: value },
                          }));
                          setTrimMarkErrors((prev) => ({ ...prev, [group.id]: "" }));
                        }}
                        keyboardType="decimal-pad"
                        style={styles.trimInput}
                        placeholderTextColor={colors.muted}
                      />
                      <Text style={[styles.trimHintText, { color: colors.muted }]}>
                        Available: {totalShares.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                      </Text>
                      <Text style={[styles.trimInputLabel, { color: colors.muted }]}>Price</Text>
                      <TextInput
                        value={trimMarkDraft.price}
                        onChangeText={(value) => {
                          setTrimMarkDrafts((prev) => ({
                            ...prev,
                            [group.id]: { ...trimMarkDraft, price: value },
                          }));
                          setTrimMarkErrors((prev) => ({ ...prev, [group.id]: "" }));
                        }}
                        keyboardType="decimal-pad"
                        style={styles.trimInput}
                        placeholderTextColor={colors.muted}
                      />
                      <Text style={[styles.trimInputLabel, { color: colors.muted }]}>Date (YYYY-MM-DD)</Text>
                      <TextInput
                        value={trimMarkDraft.date}
                        onChangeText={(value) => {
                          setTrimMarkDrafts((prev) => ({
                            ...prev,
                            [group.id]: { ...trimMarkDraft, date: value },
                          }));
                          setTrimMarkErrors((prev) => ({ ...prev, [group.id]: "" }));
                        }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.trimInput}
                        placeholderTextColor={colors.muted}
                      />
                      {trimMarkError ? (
                        <Text style={[styles.trimHintText, { color: colors.negative }]}>{trimMarkError}</Text>
                      ) : null}
                      <View style={styles.trimInlineActions}>
                        <Pressable
                          style={styles.trimGhostBtn}
                          onPress={() => {
                            setTrimMarkErrors((prev) => ({ ...prev, [group.id]: "" }));
                            setOpenTrimMarkForm((prev) => ({ ...prev, [group.id]: false }));
                          }}
                        >
                          <Text style={[styles.trimGhostBtnText, { color: colors.muted }]}>Cancel</Text>
                        </Pressable>
                        <Pressable style={styles.trimPrimaryBtn} onPress={() => submitTrimMark(group)}>
                          <Text style={styles.trimPrimaryBtnText}>Save trim</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>

                <View style={styles.trimSettingsCard}>
                  <Text style={[styles.trimSectionTitle, { color: colors.text }]}>Trim history</Text>
                  {trimHistory.length === 0 ? (
                    <Text style={[styles.trimHintText, { color: colors.muted }]}>No trims recorded yet.</Text>
                  ) : (
                    <View style={styles.trimHistoryTable}>
                      <View style={styles.trimHistoryHeaderRow}>
                        <Text style={[styles.trimHistoryHeaderCell, { color: colors.muted }]}>Date</Text>
                        <Text style={[styles.trimHistoryHeaderCell, styles.trimHistoryCellRight, { color: colors.muted }]}>Price</Text>
                        <Text style={[styles.trimHistoryHeaderCell, styles.trimHistoryCellRight, { color: colors.muted }]}>Shares</Text>
                        <Text style={[styles.trimHistoryHeaderCell, styles.trimHistoryCellRight, { color: colors.muted }]}>Realized</Text>
                      </View>
                      {[...trimHistory]
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((event, idx) => {
                          const realizedGain = (event.price - weightedAvgCost) * event.sharesTrimmed;
                          return (
                            <View key={`${event.date}-${event.price}-${event.sharesTrimmed}-${idx}`} style={styles.trimHistoryDataRow}>
                              <Text style={[styles.trimHistoryCell, { color: colors.text }]}>
                                {new Date(event.date).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </Text>
                              <Text style={[styles.trimHistoryCell, styles.trimHistoryCellRight, { color: colors.text }]}>
                                {formatMoney(event.price, primaryLot?.currency ?? settings.reportingCurrency)}
                              </Text>
                              <Text style={[styles.trimHistoryCell, styles.trimHistoryCellRight, { color: colors.text }]}>
                                {event.sharesTrimmed.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              </Text>
                              <Text
                                style={[
                                  styles.trimHistoryCell,
                                  styles.trimHistoryCellRight,
                                  { color: realizedGain >= 0 ? colors.positive : colors.negative },
                                ]}
                              >
                                {realizedGain >= 0 ? "+" : ""}
                                {formatMoney(realizedGain, primaryLot?.currency ?? settings.reportingCurrency)}
                              </Text>
                            </View>
                          );
                        })}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  // Renders a non-expandable synthetic Cash row.
  const renderCashRow = (id: string, amountRC: number, indent = false) => {
    const allocPct =
      allocationContext.allocationDenom > 0 ? (amountRC / allocationContext.allocationDenom) * 100 : 0;
    return (
      <View key={id} style={[styles.gridRow, styles.cashRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={[styles.colHolding, indent && styles.colHoldingIndent]}>
          <View style={[styles.cashBadge, { backgroundColor: `${colors.muted}22` }]}>
            <Text style={[styles.cashBadgeText, { color: colors.muted }]}>$</Text>
          </View>
          <View style={styles.holdingInfo}>
            <Text style={[styles.holdingTicker, { color: colors.muted }]}>Cash</Text>
            <Text style={[styles.holdingName, { color: colors.muted }]}>Uninvested balance</Text>
          </View>
        </View>
        {!hideInvested ? (
          <View style={styles.cellInvested}>
            <Text style={styles.valueInvested}>—</Text>
          </View>
        ) : null}
        <View style={styles.cellCurrent}>
          <Text style={[styles.valueCurrent, { color: colors.muted }]}>
            {formatMoney(amountRC, settings.reportingCurrency)}
          </Text>
        </View>
        <View style={styles.cellAlloc}>
          <Text style={[styles.valueAlloc, { color: colors.muted }]}>{allocPct.toFixed(1)}%</Text>
        </View>
      </View>
    );
  };

  // Renders a clickable, sortable column header cell.
  const renderSortHeader = (
    column: SortColumn,
    label: string,
    cellStyle: object,
    textAlign: "left" | "right"
  ) => {
    const active = sortColumn === column;
    const hovered = hoveredHeader === column;
    const arrow = active ? (sortDirection === "desc" ? " ↓" : " ↑") : " ↕";
    const textColor = active ? colors.accent : hovered ? "#8A94A3" : "#5A6472";
    return (
      <Pressable
        style={[cellStyle, styles.sortHeaderCell]}
        onPress={() => handleSort(column)}
        onHoverIn={() => setHoveredHeader(column)}
        onHoverOut={() => setHoveredHeader((prev) => (prev === column ? null : prev))}
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${label}`}
      >
        <Text
          style={[
            styles.columnHeaderText,
            { textAlign, color: textColor },
          ]}
        >
          {label}
          <Text style={active ? undefined : styles.sortHeaderHint}>{arrow}</Text>
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Holdings</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.actionBtn, isRefreshingPrices && styles.refreshBtnDisabled]}
            onPress={refreshAllMarketPrices}
            disabled={isRefreshingPrices || holdings.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Refresh prices"
          >
            <Animated.Text style={[styles.actionBtnIcon, { transform: [{ rotate: spin }] }]}>↻</Animated.Text>
            <Text style={styles.actionBtnLabel}>{isRefreshingPrices ? "Refreshing" : "Refresh"}</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => setIsImportTransactionsVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Import transactions"
          >
            <Text style={styles.actionBtnIcon}>≡</Text>
            <Text style={styles.actionBtnLabel}>Import</Text>
          </Pressable>
          <TourTarget tourKey="holdings-add">
            <Pressable ref={addBtnRef} style={styles.addBtn} onPress={openAddMenu}>
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </TourTarget>
        </View>
      </View>
      <View style={styles.headerMetaBlock}>
        <Text style={styles.headerHint}>Tap a holding for full details</Text>
        {lastPricesRefreshedAt ? (
          <Text style={styles.headerMetaLine}>Prices refreshed {formatRelativeTime(lastPricesRefreshedAt)}</Text>
        ) : null}
      </View>

      {/* Search */}
      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search ticker or company"
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
      />


      {/* Group By + Include Cash */}
      <View style={styles.groupControlRow}>
        <View style={styles.groupControlItem}>
          <Text style={styles.groupControlLabel}>Group by</Text>
          <SegmentedControl<GroupByKey>
            options={[
              { value: "stock", label: "None" },
              { value: "account", label: "Account" },
            ]}
            value={groupBy}
            onChange={(next) => {
              setGroupBy(next);
              // Default all account sections to expanded when grouping.
              setExpandedGroups({});
            }}
          />
        </View>
        <View style={styles.groupControlItem}>
          {!isMobile ? (
            <SegmentedControl<MarketFilter>
              options={[
                { value: "ALL", label: "All" },
                { value: "INDIA", label: "India" },
                { value: "US", label: "US" },
              ]}
              value={marketFilter}
              onChange={setMarketFilter}
            />
          ) : null}
          <View>
            <Pressable
              style={[styles.cashIconBtn, showCash && styles.cashIconBtnActive]}
              onPress={() => setShowCash((prev) => !prev)}
              onHoverIn={() => setCashInfoVisible(true)}
              onHoverOut={() => setCashInfoVisible(false)}
              onLongPress={() => setCashInfoVisible((prev) => !prev)}
              accessibilityRole="switch"
              accessibilityState={{ checked: showCash }}
              accessibilityLabel="Include uninvested cash in allocation calculations and as a Holdings row"
            >
              <Text style={[styles.cashIconText, showCash && styles.cashIconTextActive]}>$</Text>
            </Pressable>
            {cashInfoVisible ? (
              <View style={styles.cashTooltip} pointerEvents="none">
                <Text style={styles.cashTooltipText}>
                  Include uninvested cash in allocation calculations and as a Holdings row
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* Plain container — the outer ScreenContainer ScrollView owns scrolling.
          A nested (disabled) ScrollView here previously swallowed row scrolling. */}
      <View style={styles.listWrap}>
        {holdings.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{brokerAccounts.length === 0 ? "No broker account yet" : "No holdings yet"}</Text>
              {brokerAccounts.length === 0 ? (
                <>
                  <Text style={styles.emptyText}>Holdings are missing because you do not have a broker account linked yet.</Text>
                  <Text style={styles.emptyText}>Create a broker account first, then come back here to add your first holding.</Text>
                  <Pressable style={styles.emptyPrimaryBtn} onPress={() => router.push("/(tabs)/settings" as never)}>
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

          {holdings.length > 0 ? (
            isMobile ? (
              <View style={styles.mobileFilterRow}>
                <SegmentedControl<MarketFilter>
                  options={[
                    { value: "ALL", label: "All" },
                    { value: "INDIA", label: "India" },
                    { value: "US", label: "US" },
                  ]}
                  value={marketFilter}
                  onChange={setMarketFilter}
                />
              </View>
            ) : (
            <View style={[styles.gridRow, styles.columnHeaderRow, styles.stickyHeader, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
              {renderSortHeader("holding", groupBy === "account" ? "ACCOUNT / HOLDING" : "HOLDING", styles.colHolding, "left")}
              {!hideInvested ? renderSortHeader("invested", "INVESTED", styles.cellInvested, "right") : null}
              {renderSortHeader("current", "CURRENT", styles.cellCurrent, "right")}
              {renderSortHeader("alloc", "ALLOC", styles.cellAlloc, "right")}
            </View>
            )
          ) : null}

          {holdings.length > 0 ? (
            groupBy === "account" ? (
              accountSections.map((section) => {
                const isCollapsed = Boolean(collapsedAccounts[section.account.id]);
                return (
                <View key={section.account.id}>
                  <Pressable
                    onPress={() =>
                      setCollapsedAccounts((prev) => ({ ...prev, [section.account.id]: !prev[section.account.id] }))
                    }
                    style={[styles.gridRow, styles.sectionHeaderRow, styles.rowInteractive, { borderBottomColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !isCollapsed }}
                    accessibilityLabel={`${section.account.name} holdings`}
                  >
                    <View style={styles.colHolding}>
                      <Text style={[styles.sectionChevron, { color: colors.muted }]}>{isCollapsed ? "▸" : "▾"}</Text>
                      <View style={styles.holdingInfo}>
                        <Text style={styles.sectionHeaderTitle} numberOfLines={1}>
                          {section.account.name} ({section.account.owner})
                        </Text>
                        <Text style={styles.sectionHeaderMeta} numberOfLines={1}>
                          {section.account.broker}{section.rows.length ? ` · ${section.rows.length} holding${section.rows.length === 1 ? "" : "s"}` : ""}
                        </Text>
                      </View>
                    </View>
                    {!hideInvested ? (
                      <View style={styles.cellInvested}>
                        <Text style={styles.valueInvested}>{formatMoney(section.investedTotal, settings.reportingCurrency)}</Text>
                      </View>
                    ) : null}
                    <View style={styles.cellCurrent}>
                      <Text style={styles.valueCurrent}>{formatMoney(section.currentTotal, settings.reportingCurrency)}</Text>
                    </View>
                    <View style={styles.cellAlloc}>
                      <Text style={[styles.valueAlloc, { color: colors.text }]}>{section.allocTotal.toFixed(1)}%</Text>
                    </View>
                  </Pressable>
                  {!isCollapsed ? (
                    <>
                      {section.cashRC > 0 ? renderCashRow(`${section.account.id}:cash`, section.cashRC, true) : null}
                      {section.rows.map((row) => renderHoldingRow(row, true))}
                    </>
                  ) : null}
                </View>
                );
              })
            ) : (
              <>
                {showCash && totalCashRC > 0 ? renderCashRow("portfolio:cash", totalCashRC) : null}
                {flatRows.map((row) => renderHoldingRow(row))}
              </>
            )
          ) : null}

          {holdings.length > 0 && !hasVisibleRows ? (
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
            ceilingPct: DEFAULT_TRIM_CEILING_PCT,
            trimTriggerPct: DEFAULT_TRIM_TRIGGER_PCT,
            trimSlicePct: DEFAULT_TRIM_SLICE_PCT,
            asOf: nowIso(),
            updatedAt: nowIso(),
          });
        }}
      />

      <ImportTransactionsModal
        visible={isImportTransactionsVisible}
        accounts={brokerAccounts}
        preSelectedAccountId={pendingImportAccountId ?? undefined}
        onClose={() => {
          setIsImportTransactionsVisible(false);
          setPendingImportAccountId(null);
        }}
        onComplete={(result) => {
          console.log(`Imported ${result.transactionCount} transactions, ${result.derivedHoldingCount} derived holdings to ${result.accountName}`);
          setPendingImportAccountId(null);
        }}
        setAccountTransactions={setAccountTransactions}
        updateAccount={updateAccount}
        updateMarketPrices={updateMarketPrices}
        manualHoldings={manualHoldings}
      />

      {/* Add Menu Modal */}
      <Modal visible={isAddMenuVisible} transparent animationType="fade" onRequestClose={() => setIsAddMenuVisible(false)}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setIsAddMenuVisible(false)}>
          <Pressable
            style={[styles.dropdownCard, addMenuAnchor ? { top: addMenuAnchor.top, right: addMenuAnchor.right } : styles.dropdownFallback]}
            onPress={() => {}}
          >
            <Pressable
              style={styles.dropdownItem}
              onPress={() => {
                setIsAddMenuVisible(false);
                setIsAddAccountVisible(true);
              }}
            >
              <Text style={styles.dropdownItemTitle}>Add Account</Text>
              <Text style={styles.dropdownItemDesc}>Create a new broker or savings account</Text>
            </Pressable>
            <View style={styles.dropdownDivider} />
            <Pressable
              style={styles.dropdownItem}
              onPress={() => {
                setIsAddMenuVisible(false);
                setIsAddVisible(true);
              }}
            >
              <Text style={styles.dropdownItemTitle}>Add Holding</Text>
              <Text style={styles.dropdownItemDesc}>Add an individual holding to an account</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <AddAccountModal
        visible={isAddAccountVisible}
        onClose={() => setIsAddAccountVisible(false)}
        onCreate={handleCreateAccount}
      />

      {/* Import Menu Modal */}

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
    </>
  );
}

export default function HoldingsScreen() {
  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <HoldingsSection />
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerMetaBlock: {
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
    gap: 2,
  },
  headerHint: {
    color: defaultColors.muted,
    fontSize: typography.caption,
  },
  headerMetaLine: {
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
  addBtn: {
    borderRadius: 8,
    backgroundColor: spec.TEAL,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "600",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4b4b5e",
    backgroundColor: "#2a2a38",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnIcon: {
    color: "#f4f4f6",
    fontSize: 12,
    fontWeight: "600",
  },
  actionBtnLabel: {
    color: "#f4f4f6",
    fontSize: 12,
    fontWeight: "500",
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
  groupControlRow: {
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  groupControlItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  groupControlLabel: {
    color: defaultColors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  chipAZ: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: defaultColors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginLeft: spacing.xs,
  },
  chipAZActive: {
    borderColor: defaultColors.accent,
    backgroundColor: `${defaultColors.accent}22`,
  },
  chipAZText: {
    color: defaultColors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    letterSpacing: 0.4,
  },
  chipAZTextActive: {
    color: defaultColors.accent,
  },
  cashIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: defaultColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cashIconBtnActive: {
    borderColor: defaultColors.accent,
    backgroundColor: `${defaultColors.accent}22`,
  },
  cashIconText: {
    color: defaultColors.muted,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  cashIconTextActive: {
    color: defaultColors.accent,
  },
  cashTooltip: {
    position: "absolute",
    bottom: 36,
    right: 0,
    width: 220,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: defaultColors.border,
    backgroundColor: defaultColors.surface,
    zIndex: 20,
  },
  cashTooltipText: {
    color: defaultColors.text,
    fontSize: typography.caption,
    lineHeight: 16,
  },
  sectionHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    paddingVertical: spacing.xs,
  },
  sectionHeaderTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  sectionHeaderMeta: {
    marginTop: 1,
    color: defaultColors.muted,
    fontSize: typography.caption,
  },
  cashBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cashBadgeText: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  cashRow: {
    opacity: 0.9,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.md,
  },
  infoSectionLabel: {
    fontSize: typography.micro,
    fontWeight: typography.weightSemibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  infoKvRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  infoKvLabel: {
    fontSize: typography.caption,
  },
  infoKvValue: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  infoTabWrap: {
    // expandedWrap already contributes md(12) horizontal / sm(8) vertical padding;
    // add the remainder so the info content sits at a consistent ~16px inset.
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    gap: 16,
  },
  statGrid: {
    flexDirection: "row",
    backgroundColor: "#1E232B",
    borderRadius: 10,
    overflow: "hidden",
    gap: 1,
  },
  statBlock: {
    flex: 1,
    backgroundColor: "#12161C",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  statBlockLabel: {
    fontSize: 11,
    color: "#8A94A3",
    marginBottom: 4,
  },
  statBlockValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F5F7FA",
    fontVariant: ["tabular-nums"],
  },
  statBlockSub: {
    fontSize: 11,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  chartCard: {
    borderWidth: 1,
    borderColor: "#1E232B",
    borderRadius: 10,
    backgroundColor: "#0E1116",
    padding: 14,
  },
  perfLabel: {
    fontSize: 11,
    color: "#5A6472",
    letterSpacing: 0.55,
    marginBottom: 8,
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
  },
  rowInteractive: {
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    ...(Platform.OS === "web" ? ({ cursor: "pointer", transitionDuration: "150ms" } as object) : {}),
  },
  rowChevron: {
    marginLeft: spacing.sm,
    width: 14,
    textAlign: "center",
    fontSize: typography.caption,
    opacity: 0,
  },
  rowChevronVisible: {
    opacity: 1,
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
  // Value columns (Invested | Current | Alloc)
  holdingValueColumns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 24,
  },
  valueColumn: {
    alignItems: "flex-end",
    minWidth: 72,
  },
  allocColumn: {
    alignItems: "flex-end",
    minWidth: 48,
  },
  valueColumnLabel: {
    fontSize: 11,
    fontWeight: typography.weightMedium,
    marginBottom: 2,
  },
  valueColumnInvested: {
    fontSize: typography.body,
    fontWeight: typography.weightRegular,
    fontVariant: ["tabular-nums"],
    fontFamily: typography.mono,
  },
  valueColumnCurrent: {
    fontSize: typography.body,
    fontWeight: typography.weightBold,
    fontVariant: ["tabular-nums"],
    fontFamily: typography.mono,
  },
  valueColumnGain: {
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    marginTop: 2,
    fontFamily: typography.mono,
  },
  valueColumnAlloc: {
    fontSize: 14,
    fontWeight: typography.weightBold,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    fontFamily: typography.mono,
  },
  // Shared 4-column grid: HOLDING (1fr) | INVESTED (150) | CURRENT (160) | ALLOC (70)
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  // --- Mobile (< 768px) stacked-column row ---
  mobileFilterRow: {
    paddingVertical: spacing.sm,
  },
  mobileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mobileIdentity: {
    flex: 1,
    minWidth: 0,
  },
  mobileTicker: {
    fontSize: 16,
    fontWeight: "700",
  },
  mobileName: {
    fontSize: 12,
    marginTop: 2,
  },
  mobileValueStack: {
    alignItems: "flex-end",
  },
  mobileAlloc: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  mobileCurrent: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  mobileInvestedLine: {
    fontSize: 11,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  mobileGainPct: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  colHolding: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  colHoldingIndent: {
    paddingLeft: 16,
  },
  cellInvested: {
    width: 150,
    alignItems: "flex-end",
  },
  cellCurrent: {
    width: 160,
    alignItems: "flex-end",
  },
  cellAlloc: {
    width: 70,
    alignItems: "flex-end",
  },
  valueInvested: {
    fontSize: 13,
    fontWeight: typography.weightRegular,
    color: "#8A94A3",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  valueCurrent: {
    fontSize: 14,
    fontWeight: typography.weightBold,
    color: "#F5F7FA",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  valueGain: {
    fontSize: 11,
    fontWeight: typography.weightRegular,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  valueAlloc: {
    fontSize: 14,
    fontWeight: typography.weightBold,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  sortHeaderCell: {
    ...(Platform.OS === "web"
      ? ({ cursor: "pointer", userSelect: "none" } as object)
      : {}),
  },
  sortHeaderHint: {
    color: "#3A4350",
  },
  sectionHeaderRow: {
    marginTop: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionChevron: {
    width: 14,
    textAlign: "center",
    fontSize: typography.caption,
    marginRight: spacing.xs,
  },
  // Sticky column header for the holdings table
  columnHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stickyHeader: Platform.OS === "web" ? ({ position: "sticky", top: 0, zIndex: 10 } as object) : {},
  headerLeft: {
    flex: 1,
    paddingRight: spacing.md,
  },
  columnHeaderText: {
    fontSize: 11,
    fontWeight: typography.weightSemibold,
    letterSpacing: 0.44,
    textTransform: "uppercase",
  },
  columnHeaderAlloc: {
    textAlign: "right",
  },
  expandedWrap: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statHeader: {
    flexDirection: "row",
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statColumn: {
    flex: 1,
  },
  statLabel: {
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    marginBottom: 2,
  },
  statValue: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    fontVariant: ["tabular-nums"],
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
  trimTabWrap: {
    gap: spacing.xs,
  },
  trimStatusWrap: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  trimVerdictText: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    lineHeight: 18,
  },
  trimStatusDetails: {
    gap: spacing.xs,
  },
  trimStatusDetailsMuted: {
    opacity: 0.55,
  },
  trimProgressLabel: {
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    fontVariant: ["tabular-nums"],
  },
  trimProgressSubLabel: {
    fontSize: typography.micro,
    fontVariant: ["tabular-nums"],
  },
  trimProgressTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: defaultColors.surface,
    overflow: "hidden",
  },
  trimProgressTrackThin: {
    height: 4,
  },
  trimProgressFill: {
    height: "100%",
    borderRadius: radii.pill,
  },
  trimSettingsCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: defaultColors.border,
    backgroundColor: defaultColors.bg,
    padding: spacing.sm,
  },
  trimSectionTitle: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    marginBottom: 2,
  },
  trimSettingsList: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  trimSettingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  trimSettingLabel: {
    flex: 1,
    fontSize: typography.micro,
  },
  trimInputLabel: {
    marginTop: spacing.xs,
    fontSize: typography.micro,
  },
  trimInput: {
    marginTop: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: defaultColors.border,
    backgroundColor: defaultColors.surface,
    color: defaultColors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  trimStepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  trimStepperBtn: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: defaultColors.border,
    backgroundColor: defaultColors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  trimStepperBtnText: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    lineHeight: typography.body,
  },
  trimStepperInput: {
    width: 92,
    marginTop: 0,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    paddingHorizontal: spacing.sm,
  },
  trimPrimaryBtn: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: defaultColors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    alignSelf: "flex-start",
  },
  trimPrimaryBtnText: {
    color: defaultColors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  trimBtnDisabled: {
    opacity: 0.55,
  },
  trimHintText: {
    fontSize: typography.micro,
    lineHeight: 16,
  },
  trimSectionDivider: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: defaultColors.border,
  },
  trimMarkFormWrap: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  trimInlineActions: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  trimGhostBtn: {
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  trimGhostBtnText: {
    fontSize: typography.caption,
  },
  trimHistoryTable: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: defaultColors.border,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  trimHistoryHeaderRow: {
    flexDirection: "row",
    backgroundColor: defaultColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: defaultColors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  trimHistoryDataRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: defaultColors.border,
  },
  trimHistoryHeaderCell: {
    flex: 1,
    fontSize: typography.micro,
    fontWeight: typography.weightSemibold,
  },
  trimHistoryCell: {
    flex: 1,
    fontSize: typography.caption,
  },
  trimHistoryCellRight: {
    textAlign: "right",
    fontVariant: ["tabular-nums"],
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
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  dropdownCard: {
    position: "absolute",
    minWidth: 240,
    maxWidth: 300,
    backgroundColor: defaultColors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: defaultColors.border,
    paddingVertical: spacing.xs,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.4)" } as object,
    }),
  },
  dropdownFallback: {
    top: 80,
    right: spacing.lg,
  },
  dropdownItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  dropdownItemTitle: {
    color: defaultColors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    marginBottom: 2,
  },
  dropdownItemDesc: {
    color: defaultColors.muted,
    fontSize: typography.caption,
  },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: defaultColors.border,
    marginHorizontal: spacing.md,
  },
});
