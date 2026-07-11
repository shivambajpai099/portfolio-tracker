import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PortfolioSnapshotData } from "../features/portfolio/cloudSnapshot";
import { calcSymbolAllocations, convert, holdingCost } from "../features/portfolio/calculations";
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

const normalizeSettings = (settings: Partial<PortfolioSettings> | undefined): PortfolioSettings => ({
  ...seedSettings,
  ...(settings ?? {}),
  onboardingTipsSeen: Boolean(settings?.onboardingTipsSeen),
});

const DRIFT_SNAPSHOT_LIMIT = 500;

const isIndiaHolding = (holding: Holding): boolean => {
  const symbol = holding.symbol.toUpperCase();
  return holding.currency === "INR" || symbol.endsWith(".NS") || symbol.endsWith(".BO");
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
  allocationSnapshots: AllocationSnapshot[];
  settings: PortfolioSettings;
  fxRates: FxRates;
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
          return {
            accounts: state.accounts.filter((account) => account.id !== accountId),
            holdings,
            cashHoldings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(holdings, cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),

      addHolding: (holding: Holding) =>
        set((state) => {
          const now = new Date().toISOString();
          const holdings = [...state.holdings, holding];
          return {
            holdings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(holdings, state.cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
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
          return {
            holdings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(holdings, state.cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),
      removeHolding: (holdingId: string) =>
        set((state) => {
          const now = new Date().toISOString();
          const holdings = state.holdings.filter((holding) => holding.id !== holdingId);
          return {
            holdings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(holdings, state.cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),

      addCashHolding: (cashHolding: CashHolding) =>
        set((state) => {
          const now = new Date().toISOString();
          const cashHoldings = [...state.cashHoldings, cashHolding];
          return {
            cashHoldings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(state.holdings, cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
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
          return {
            cashHoldings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(state.holdings, cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),
      removeCashHolding: (cashHoldingId: string) =>
        set((state) => {
          const now = new Date().toISOString();
          const cashHoldings = state.cashHoldings.filter((cashHolding) => cashHolding.id !== cashHoldingId);
          return {
            cashHoldings,
            allocationSnapshots: appendAllocationSnapshot(
              state.allocationSnapshots,
              buildAllocationSnapshot(state.holdings, cashHoldings, state.fxRates, state.settings.reportingCurrency, now),
              state.settings.timelineRetention
            ),
            snapshotUpdatedAt: now,
          };
        }),

      // Transaction mutations
      addTransactions: (newTransactions: Transaction[]) =>
        set((state) => ({
          transactions: [...state.transactions, ...newTransactions],
          snapshotUpdatedAt: new Date().toISOString(),
        })),

      setAccountTransactions: (accountId: string, newTransactions: Transaction[]) =>
        set((state) => {
          // Remove existing transactions for this account, then add new ones
          const otherTransactions = state.transactions.filter((tx) => tx.accountId !== accountId);
          return {
            transactions: [...otherTransactions, ...newTransactions],
            snapshotUpdatedAt: new Date().toISOString(),
          };
        }),

      removeTransactionsByAccount: (accountId: string) =>
        set((state) => ({
          transactions: state.transactions.filter((tx) => tx.accountId !== accountId),
          snapshotUpdatedAt: new Date().toISOString(),
        })),

      clearTransactions: () =>
        set({
          transactions: [],
          snapshotUpdatedAt: new Date().toISOString(),
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
      clearAllData: () =>
        set({
          accounts: [],
          holdings: [],
          cashHoldings: [],
          transactions: [],
          allocationSnapshots: [],
          settings: seedSettings,
          fxRates: seedFxRates,
          snapshotUpdatedAt: new Date().toISOString(),
        }),

      totalValueInINR: () => {
        const { holdings, cashHoldings, fxRates } = get();
        const holdingsValue = holdings.reduce((sum: number, item: Holding) => {
          return sum + toINR(holdingMarketValue(item), item.currency, fxRates);
        }, 0);
        const cashValue = cashHoldings.reduce((sum: number, item) => {
          return sum + toINR(item.balance, item.currency, fxRates);
        }, 0);
        return holdingsValue + cashValue;
      },
      totalValueInUSD: () => {
        const { holdings, cashHoldings, fxRates } = get();
        const holdingsValue = holdings.reduce((sum: number, item: Holding) => {
          return sum + toUSD(holdingMarketValue(item), item.currency, fxRates);
        }, 0);
        const cashValue = cashHoldings.reduce((sum: number, item) => {
          return sum + toUSD(item.balance, item.currency, fxRates);
        }, 0);
        return holdingsValue + cashValue;
      },
      exposure: () => {
        const { holdings, fxRates } = get();
        return exposureBySymbol(holdings, fxRates.USDINR);
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
        snapshotUpdatedAt: state.snapshotUpdatedAt,
      }),
      onRehydrateStorage: () => (state: PortfolioState | undefined) => {
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

