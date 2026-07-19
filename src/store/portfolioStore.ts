import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PortfolioSnapshotData } from "../features/portfolio/cloudSnapshot";
import { calcSymbolAllocations, convert, holdingCost } from "../features/portfolio/calculations";
import { deriveHoldingsFromTransactions } from "../features/portfolio/fifoCalculator";
import {
  processCorporateActions,
  normalizeHoldingsForSplits,
  reverseStockSplit,
  reverseStockSplitFromHolding,
  DEFAULT_STOCK_SPLITS,
  corporateActionId,
  type StockSplit,
} from "../features/portfolio/corporateActionProcessor";
import { exposureBySymbol, holdingMarketValue, toINR, toUSD } from "../features/portfolio/selectors";
import { seedAccounts, seedCashHoldings, seedFxRates, seedHoldings, seedSettings } from "../features/portfolio/mockData";
import type {
  Account,
  AllocationSnapshot,
  CashHolding,
  Currency,
  ExposureBySymbol,
  FxRates,
  Holding,
  PortfolioSettings,
  TimelineRetention,
} from "../types/portfolio";
import type { Transaction } from "../types/transaction";
import { applyIndiaAlias } from "../utils/indiaSymbols";

const normalizeSettings = (settings: Partial<PortfolioSettings> | undefined): PortfolioSettings => ({
  ...seedSettings,
  ...(settings ?? {}),
  onboardingTipsSeen: Boolean(settings?.onboardingTipsSeen),
  spotlightTourSeen: Boolean(settings?.spotlightTourSeen),
});

const DRIFT_SNAPSHOT_LIMIT = 500;

const isIndiaHolding = (holding: Holding): boolean => {
  const symbol = holding.symbol.toUpperCase();
  return holding.currency === "INR" || symbol.endsWith(".NS") || symbol.endsWith(".BO");
};

/**
 * Merge stock-split registries, de-duplicated by their stable corporate-action
 * id (identity + effective date + ratio). Preserves input order (first wins).
 */
const mergeSplitRegistries = (...registries: (StockSplit[] | undefined)[]): StockSplit[] => {
  const seen = new Set<string>();
  const merged: StockSplit[] = [];
  for (const registry of registries) {
    if (!registry) continue;
    for (const split of registry) {
      const id = corporateActionId(split);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(split);
    }
  }
  return merged;
};

/**
 * Get all holdings by combining manual holdings with derived holdings from transaction-sourced accounts.
 * This is used internally for building allocation snapshots.
 */
const getAllHoldings = (
  manualHoldings: Holding[],
  transactions: Transaction[],
  accounts: Account[],
  priceMap?: Map<string, number>
): Holding[] => {
  const allHoldings: Holding[] = [];
  const transactionAccountIds = new Set<string>();

  // Identify which accounts are transaction-sourced
  for (const account of accounts) {
    if (account.dataSource === "transactions") {
      transactionAccountIds.add(account.id);
    }
  }

  // Always include all manual holdings (regardless of account type)
  for (const holding of manualHoldings) {
    allHoldings.push(holding);
  }

  // Also add derived holdings for transaction accounts
  for (const accountId of transactionAccountIds) {
    const { holdings } = deriveHoldingsFromTransactions(transactions, accountId, priceMap);
    allHoldings.push(...holdings);
  }

  return allHoldings;
};

const buildAllocationSnapshot = (
  holdings: Holding[],
  cashHoldings: CashHolding[],
  fxRates: FxRates,
  reportingCurrency: Currency,
  date: string
): AllocationSnapshot => {
  let indiaValue = 0;
  let usValue = 0;

  let investedEquityValue = 0;

  for (const holding of holdings) {
    const value = convert(holdingMarketValue(holding), holding.currency, reportingCurrency, fxRates);
    const invested = convert(holdingCost(holding), holding.currency, reportingCurrency, fxRates);
    investedEquityValue += invested;
    if (isIndiaHolding(holding)) {
      indiaValue += value;
    } else {
      usValue += value;
    }
  }

  const cashValue = cashHoldings.reduce(
    (sum, item) => sum + convert(item.balance, item.currency, reportingCurrency, fxRates),
    0
  );

  const investedValue = investedEquityValue + cashValue;
  const totalPortfolioValue = indiaValue + usValue + cashValue;

  const topHoldings = calcSymbolAllocations(
    holdings,
    cashHoldings,
    fxRates,
    reportingCurrency,
    "CURRENT_VALUE",
    true
  )
    .sort((a, b) => b.allocationPct - a.allocationPct)
    .slice(0, 10)
    .map((item) => ({
      symbol: item.symbol,
      allocationPct: item.allocationPct,
      currentValue: item.currentValue,
      investedValue: item.investedValue,
      gainLossPct: item.gainLossPct,
    }));

  return {
    date,
    totalPortfolioValue,
    investedValue,
    gainLoss: totalPortfolioValue - investedValue,
    indiaAllocationPct: totalPortfolioValue > 0 ? (indiaValue / totalPortfolioValue) * 100 : 0,
    usAllocationPct: totalPortfolioValue > 0 ? (usValue / totalPortfolioValue) * 100 : 0,
    cashAllocationPct: totalPortfolioValue > 0 ? (cashValue / totalPortfolioValue) * 100 : 0,
    topHoldings,
  };
};

const retentionToMonths = (retention: TimelineRetention | undefined): number | null => {
  if (retention === "6M") return 6;
  if (retention === "1Y") return 12;
  if (retention === "2Y") return 24;
  return null;
};

const pruneSnapshotsByRetention = (
  snapshots: AllocationSnapshot[],
  retention: TimelineRetention | undefined,
  nowIso: string
): AllocationSnapshot[] => {
  const months = retentionToMonths(retention);
  let filtered = snapshots;

  if (months !== null) {
    const cutoff = new Date(nowIso);
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffTs = cutoff.getTime();
    filtered = snapshots.filter((snapshot) => {
      const ts = new Date(snapshot.date).getTime();
      return Number.isFinite(ts) && ts >= cutoffTs;
    });
  }

  if (filtered.length > DRIFT_SNAPSHOT_LIMIT) {
    return filtered.slice(filtered.length - DRIFT_SNAPSHOT_LIMIT);
  }

  return filtered;
};

const normalizeAllocationSnapshots = (snapshots: AllocationSnapshot[]): AllocationSnapshot[] =>
  snapshots.map((snapshot) => ({
    ...snapshot,
    investedValue:
      typeof snapshot.investedValue === "number" ? snapshot.investedValue : snapshot.totalPortfolioValue,
    gainLoss:
      typeof snapshot.gainLoss === "number"
        ? snapshot.gainLoss
        : snapshot.totalPortfolioValue -
          (typeof snapshot.investedValue === "number" ? snapshot.investedValue : snapshot.totalPortfolioValue),
    topHoldings: Array.isArray(snapshot.topHoldings)
      ? snapshot.topHoldings.map((holding) => ({
          ...holding,
          currentValue: typeof holding.currentValue === "number" ? holding.currentValue : 0,
          investedValue: typeof holding.investedValue === "number" ? holding.investedValue : 0,
          gainLossPct: typeof holding.gainLossPct === "number" ? holding.gainLossPct : 0,
        }))
      : [],
  }));

const appendAllocationSnapshot = (
  snapshots: AllocationSnapshot[],
  nextSnapshot: AllocationSnapshot,
  retention: TimelineRetention | undefined
): AllocationSnapshot[] => {
  return pruneSnapshotsByRetention([...snapshots, nextSnapshot], retention, nextSnapshot.date);
};

interface PortfolioState {
  accounts: Account[];
  holdings: Holding[];
  cashHoldings: CashHolding[];
  transactions: Transaction[];
  /**
   * Point-in-time allocation + valuation snapshots.
   *
   * These are the system of record for historical *market value* and gain/loss
   * over time (Timeline and Insights "Portfolio Evolution"), because the app
   * does not persist historical market prices — so past valuation cannot be
   * reconstructed from transactions alone.
   *
   * NOTE: Allocation *drift* no longer relies on these. `app/(tabs)/drift.tsx`
   * reconstructs allocation at exact dates from transaction history (see
   * `features/portfolio/allocationHistory.ts`) and only falls back to snapshots
   * for manual-only portfolios that have no transactions.
   */
  allocationSnapshots: AllocationSnapshot[];
  settings: PortfolioSettings;
  fxRates: FxRates;
  /** Cached market prices for symbols (used for transaction-derived holdings) */
  marketPrices: Record<string, number>;
  /**
   * Known stock splits discovered during imports (from Yahoo) plus any manual
   * ones. Persisted so the launch-time `normalizeCorporateActions` pass can
   * retroactively split-adjust existing data — not just the built-in defaults.
   */
  stockSplits: StockSplit[];
  snapshotUpdatedAt: string;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  getSnapshot: () => PortfolioSnapshotData;
  replaceFromSnapshot: (snapshot: PortfolioSnapshotData) => void;

  addAccount: (account: Account) => void;
  updateAccount: (accountId: string, updates: Partial<Account>) => void;
  removeAccount: (accountId: string) => void;

  addHolding: (holding: Holding) => void;
  updateHolding: (holdingId: string, updates: Partial<Holding>) => void;
  removeHolding: (holdingId: string) => void;

  addCashHolding: (cashHolding: CashHolding) => void;
  updateCashHolding: (cashHoldingId: string, updates: Partial<CashHolding>) => void;
  removeCashHolding: (cashHoldingId: string) => void;

  // Transaction mutations
  addTransactions: (transactions: Transaction[]) => void;
  setAccountTransactions: (accountId: string, transactions: Transaction[]) => void;
  removeTransactionsByAccount: (accountId: string) => void;
  clearTransactions: () => void;

  /** Update cached market prices for symbols */
  updateMarketPrices: (prices: Record<string, number>) => void;

  /** Correct known Indian ticker mismatches/renames on stored data. */
  applyIndiaSymbolAliases: () => void;

  /**
   * Split-adjust already-persisted transactions and manual/snapshot holdings
   * for known stock splits, so cost basis (average price) and share counts stay
   * correct. Idempotent — safe to re-run on every launch.
   */
  normalizeCorporateActions: () => void;

  /**
   * Merge newly-discovered stock splits into the persisted registry (deduped)
   * and immediately re-run normalization so both new and existing data are
   * split-adjusted.
   */
  addStockSplits: (splits: StockSplit[]) => void;

  /** Remove a persisted stock split and reverse its adjustment on stored data. */
  removeStockSplit: (id: string) => void;

  updateSettings: (updates: Partial<PortfolioSettings>) => void;
  updateFxRates: (rates: FxRates) => void;
  clearAllData: () => void;

  totalValueInINR: () => number;
  totalValueInUSD: () => number;
  exposure: () => ExposureBySymbol[];
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      accounts: seedAccounts,
      holdings: seedHoldings,
      cashHoldings: seedCashHoldings,
      transactions: [],
      allocationSnapshots: [
        buildAllocationSnapshot(
          seedHoldings,
          seedCashHoldings,
          seedFxRates,
          seedSettings.reportingCurrency,
          new Date().toISOString()
        ),
      ],
      settings: seedSettings,
      fxRates: seedFxRates,
      marketPrices: {},
      stockSplits: [],
      snapshotUpdatedAt: new Date().toISOString(),
      hydrated: false,
      setHydrated: (value: boolean) => set({ hydrated: value }),
      getSnapshot: () => {
        const { accounts, holdings, cashHoldings, transactions, allocationSnapshots, settings, fxRates, snapshotUpdatedAt } = get();
        return {
          accounts,
          holdings,
          cashHoldings,
          transactions,
          allocationSnapshots,
          settings,
          fxRates,
          snapshotUpdatedAt,
        };
      },
      replaceFromSnapshot: (snapshot: PortfolioSnapshotData) =>
        set({
          accounts: snapshot.accounts,
          holdings: snapshot.holdings,
          cashHoldings: snapshot.cashHoldings,
          transactions: snapshot.transactions ?? [],
          allocationSnapshots: pruneSnapshotsByRetention(
            normalizeAllocationSnapshots(
              snapshot.allocationSnapshots?.length
                ? snapshot.allocationSnapshots
                : [
                    buildAllocationSnapshot(
                      snapshot.holdings,
                      snapshot.cashHoldings,
                      snapshot.fxRates,
                      snapshot.settings.reportingCurrency,
                      snapshot.snapshotUpdatedAt
                    ),
                  ]
            ),
            snapshot.settings.timelineRetention,
            snapshot.snapshotUpdatedAt
          ),
          settings: normalizeSettings(snapshot.settings),
          fxRates: snapshot.fxRates,
          snapshotUpdatedAt: snapshot.snapshotUpdatedAt,
        }),

      addAccount: (account: Account) =>
        set((state) => ({
          accounts: [...state.accounts, account],
          snapshotUpdatedAt: new Date().toISOString(),
        })),
      updateAccount: (accountId: string, updates: Partial<Account>) =>
        set((state) => ({
          accounts: state.accounts.map((account) =>
            account.id === accountId ? { ...account, ...updates } : account
          ),
          snapshotUpdatedAt: new Date().toISOString(),
        })),
      removeAccount: (accountId: string) =>
        set((state) => {
          const now = new Date().toISOString();
          const holdings = state.holdings.filter((holding) => holding.accountId !== accountId);
          const cashHoldings = state.cashHoldings.filter((cashHolding) => cashHolding.accountId !== accountId);
          const accounts = state.accounts.filter((account) => account.id !== accountId);
          const transactions = state.transactions.filter((tx) => tx.accountId !== accountId);
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(holdings, transactions, accounts, priceMap);
          return {
            accounts,
            holdings,
            cashHoldings,
            transactions,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),

      addHolding: (holding: Holding) =>
        set((state) => {
          const now = new Date().toISOString();
          const holdings = [...state.holdings, holding];
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(holdings, state.transactions, state.accounts, priceMap);
          return {
            holdings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, state.cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),
      updateHolding: (holdingId: string, updates: Partial<Holding>) =>
        set((state) => {
          const now = new Date().toISOString();
          const holdings = state.holdings.map((holding) =>
            holding.id === holdingId ? { ...holding, ...updates } : holding
          );
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(holdings, state.transactions, state.accounts, priceMap);
          return {
            holdings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, state.cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),
      removeHolding: (holdingId: string) =>
        set((state) => {
          const now = new Date().toISOString();
          const holdings = state.holdings.filter((holding) => holding.id !== holdingId);
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(holdings, state.transactions, state.accounts, priceMap);
          return {
            holdings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, state.cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),

      addCashHolding: (cashHolding: CashHolding) =>
        set((state) => {
          const now = new Date().toISOString();
          const cashHoldings = [...state.cashHoldings, cashHolding];
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(state.holdings, state.transactions, state.accounts, priceMap);
          return {
            cashHoldings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),
      updateCashHolding: (cashHoldingId: string, updates: Partial<CashHolding>) =>
        set((state) => {
          const now = new Date().toISOString();
          const cashHoldings = state.cashHoldings.map((cashHolding) =>
            cashHolding.id === cashHoldingId ? { ...cashHolding, ...updates } : cashHolding
          );
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(state.holdings, state.transactions, state.accounts, priceMap);
          return {
            cashHoldings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),
      removeCashHolding: (cashHoldingId: string) =>
        set((state) => {
          const now = new Date().toISOString();
          const cashHoldings = state.cashHoldings.filter((cashHolding) => cashHolding.id !== cashHoldingId);
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(state.holdings, state.transactions, state.accounts, priceMap);
          return {
            cashHoldings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),

      // Transaction mutations
      addTransactions: (newTransactions: Transaction[]) =>
        set((state) => {
          const now = new Date().toISOString();
          const transactions = [...state.transactions, ...newTransactions];
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(state.holdings, transactions, state.accounts, priceMap);
          return {
            transactions,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, state.cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),

      setAccountTransactions: (accountId: string, newTransactions: Transaction[]) =>
        set((state) => {
          const now = new Date().toISOString();
          // Remove existing transactions for this account, then add new ones
          const otherTransactions = state.transactions.filter((tx) => tx.accountId !== accountId);
          const transactions = [...otherTransactions, ...newTransactions];
          // Importing transactions makes this account transaction-sourced. Drop
          // any manually entered holdings for the same account so the FIFO-
          // derived holdings become the single source of truth (no double-count).
          const holdings = state.holdings.filter((h) => h.accountId !== accountId);
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(holdings, transactions, state.accounts, priceMap);
          return {
            holdings,
            transactions,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, state.cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),

      removeTransactionsByAccount: (accountId: string) =>
        set((state) => {
          const now = new Date().toISOString();
          const transactions = state.transactions.filter((tx) => tx.accountId !== accountId);
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(state.holdings, transactions, state.accounts, priceMap);
          return {
            transactions,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, state.cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),

      clearTransactions: () =>
        set((state) => {
          const now = new Date().toISOString();
          const priceMap = new Map(Object.entries(state.marketPrices));
          const allHoldings = getAllHoldings(state.holdings, [], state.accounts, priceMap);
          return {
            transactions: [],
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(allHoldings, state.cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),

      updateSettings: (updates: Partial<PortfolioSettings>) =>
        set((state) => {
          const now = new Date().toISOString();
          const settings = { ...state.settings, ...updates };
          const retentionChanged =
            typeof updates.timelineRetention !== "undefined" &&
            updates.timelineRetention !== state.settings.timelineRetention;
          return {
            settings,
            allocationSnapshots: retentionChanged
              ? pruneSnapshotsByRetention(state.allocationSnapshots, settings.timelineRetention, now)
              : state.allocationSnapshots,
            snapshotUpdatedAt: now,
          };
        }),
      updateFxRates: (rates: FxRates) => set({ fxRates: rates, snapshotUpdatedAt: new Date().toISOString() }),
      updateMarketPrices: (prices: Record<string, number>) =>
        set((state) => ({
          marketPrices: { ...state.marketPrices, ...prices },
        })),
      applyIndiaSymbolAliases: () =>
        set((state) => {
          let changed = false;
          const transactions = state.transactions.map((tx) => {
            if (tx.currency !== "INR") return tx;
            const next = applyIndiaAlias(tx.symbol);
            if (next === tx.symbol) return tx;
            changed = true;
            return { ...tx, symbol: next };
          });
          const holdings = state.holdings.map((h) => {
            if (h.currency !== "INR") return h;
            const next = applyIndiaAlias(h.symbol);
            if (next === h.symbol) return h;
            changed = true;
            return { ...h, symbol: next };
          });
          return changed ? { transactions, holdings } : {};
        }),
      normalizeCorporateActions: () =>
        set((state) => {
          // Registry = built-in defaults + splits discovered/persisted from
          // imports, deduped by their stable corporate-action id.
          const registry = mergeSplitRegistries(DEFAULT_STOCK_SPLITS, state.stockSplits);

          // Re-apply known splits to stored transactions (idempotent via each
          // row's appliedCorporateActions markers). Fixes existing data that was
          // imported before a split was known/fetched.
          const transactions = processCorporateActions(state.transactions, registry);

          // Split-adjust manual/snapshot holdings whose snapshot pre-dates a
          // split (idempotent via each holding's appliedCorporateActions).
          const holdings = normalizeHoldingsForSplits(state.holdings, registry);

          const transactionsChanged = transactions !== state.transactions && transactions.some(
            (tx, i) => tx !== state.transactions[i]
          );
          const holdingsChanged = holdings.some((h, i) => h !== state.holdings[i]);

          if (!transactionsChanged && !holdingsChanged) return {};
          return { transactions, holdings };
        }),
      addStockSplits: (splits: StockSplit[]) =>
        set((state) => {
          const existing = state.stockSplits ?? [];
          const merged = mergeSplitRegistries(existing, splits);
          // Nothing new? avoid a needless state write.
          if (merged.length === existing.length) return {};

          // Re-normalize immediately so newly-learned splits correct both the
          // just-imported and any previously-stored data.
          const registry = mergeSplitRegistries(DEFAULT_STOCK_SPLITS, merged);
          const transactions = processCorporateActions(state.transactions, registry);
          const holdings = normalizeHoldingsForSplits(state.holdings, registry);
          return { stockSplits: merged, transactions, holdings };
        }),
      removeStockSplit: (id: string) =>
        set((state) => {
          const existing = state.stockSplits ?? [];
          const target = existing.find((s) => corporateActionId(s) === id);
          const stockSplits = existing.filter((s) => corporateActionId(s) !== id);
          if (!target) return { stockSplits };

          // Reverse the adjustment on any rows/holdings carrying this split's
          // marker so the position returns to its pre-split values.
          const transactions = reverseStockSplit(state.transactions, target);
          const holdings = reverseStockSplitFromHolding(state.holdings, target);
          return { stockSplits, transactions, holdings };
        }),
      clearAllData: () =>
        set({
          accounts: [],
          holdings: [],
          cashHoldings: [],
          transactions: [],
          allocationSnapshots: [],
          settings: seedSettings,
          fxRates: seedFxRates,
          marketPrices: {},
          snapshotUpdatedAt: new Date().toISOString(),
        }),

      totalValueInINR: () => {
        const { holdings, transactions, accounts, cashHoldings, fxRates, marketPrices } = get();
        const priceMap = new Map(Object.entries(marketPrices));
        const allHoldings = getAllHoldings(holdings, transactions, accounts, priceMap);
        const holdingsValue = allHoldings.reduce((sum: number, item: Holding) => {
          return sum + toINR(holdingMarketValue(item), item.currency, fxRates);
        }, 0);
        const cashValue = cashHoldings.reduce((sum: number, item) => {
          return sum + toINR(item.balance, item.currency, fxRates);
        }, 0);
        return holdingsValue + cashValue;
      },
      totalValueInUSD: () => {
        const { holdings, transactions, accounts, cashHoldings, fxRates, marketPrices } = get();
        const priceMap = new Map(Object.entries(marketPrices));
        const allHoldings = getAllHoldings(holdings, transactions, accounts, priceMap);
        const holdingsValue = allHoldings.reduce((sum: number, item: Holding) => {
          return sum + toUSD(holdingMarketValue(item), item.currency, fxRates);
        }, 0);
        const cashValue = cashHoldings.reduce((sum: number, item) => {
          return sum + toUSD(item.balance, item.currency, fxRates);
        }, 0);
        return holdingsValue + cashValue;
      },
      exposure: () => {
        const { holdings, transactions, accounts, fxRates, marketPrices } = get();
        const priceMap = new Map(Object.entries(marketPrices));
        const allHoldings = getAllHoldings(holdings, transactions, accounts, priceMap);
        return exposureBySymbol(allHoldings, fxRates.USDINR);
      },
    }),
    {
      name: "portfolio-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state: PortfolioState) => ({
        accounts: state.accounts,
        holdings: state.holdings,
        cashHoldings: state.cashHoldings,
        transactions: state.transactions,
        allocationSnapshots: state.allocationSnapshots,
        settings: state.settings,
        fxRates: state.fxRates,
        marketPrices: state.marketPrices,
        stockSplits: state.stockSplits,
        snapshotUpdatedAt: state.snapshotUpdatedAt,
      }),
      onRehydrateStorage: () => (state: PortfolioState | undefined) => {
        // One-time correction of known Indian ticker mismatches/renames on
        // already-stored data (e.g. SONATA -> SONATSOFTW) so price lookups
        // resolve. No-op when nothing matches the alias map.
        if (state) {
          state.applyIndiaSymbolAliases();
        }
        // Re-apply known stock splits to stored transactions and manual/snapshot
        // holdings so cost basis stays correct for data imported before a split
        // was known. Idempotent — no-op when everything is already adjusted.
        if (state) {
          state.normalizeCorporateActions();
        }
        if (state && !state.snapshotUpdatedAt) {
          state.replaceFromSnapshot({
            accounts: state.accounts,
            holdings: state.holdings,
            cashHoldings: state.cashHoldings,
            transactions: state.transactions ?? [],
            allocationSnapshots: state.allocationSnapshots,
            settings: normalizeSettings(state.settings),
            fxRates: state.fxRates,
            snapshotUpdatedAt: new Date().toISOString(),
          });
        } else if (
          state &&
          (!Array.isArray(state.allocationSnapshots) || state.allocationSnapshots.length === 0) &&
          (state.holdings.length > 0 || state.cashHoldings.length > 0)
        ) {
          state.replaceFromSnapshot({
            accounts: state.accounts,
            holdings: state.holdings,
            cashHoldings: state.cashHoldings,
            transactions: state.transactions ?? [],
            allocationSnapshots: [
              buildAllocationSnapshot(
                state.holdings,
                state.cashHoldings,
                state.fxRates,
                state.settings.reportingCurrency,
                new Date().toISOString()
              ),
            ],
            settings: normalizeSettings(state.settings),
            fxRates: state.fxRates,
            snapshotUpdatedAt: state.snapshotUpdatedAt || new Date().toISOString(),
          });
        } else if (
          state &&
          Array.isArray(state.allocationSnapshots) &&
          state.allocationSnapshots.some(
            (snapshot) =>
              typeof snapshot.investedValue !== "number" ||
              typeof snapshot.gainLoss !== "number" ||
              (snapshot.topHoldings ?? []).some((holding) => typeof holding.gainLossPct !== "number")
          )
        ) {
          state.replaceFromSnapshot({
            accounts: state.accounts,
            holdings: state.holdings,
            cashHoldings: state.cashHoldings,
            transactions: state.transactions ?? [],
            allocationSnapshots: normalizeAllocationSnapshots(state.allocationSnapshots),
            settings: normalizeSettings(state.settings),
            fxRates: state.fxRates,
            snapshotUpdatedAt: state.snapshotUpdatedAt || new Date().toISOString(),
          });
        } else if (
          state &&
          (typeof state.settings?.onboardingTipsSeen !== "boolean" || !state.settings?.timelineRetention)
        ) {
          state.updateSettings(normalizeSettings(state.settings));
        }
        state?.setHydrated(true);
      },
    }
  )
);

