import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PortfolioSnapshotData } from "../features/portfolio/cloudSnapshot";
import { exposureBySymbol, holdingMarketValue, toINR, toUSD } from "../features/portfolio/selectors";
import { seedAccounts, seedCashHoldings, seedFxRates, seedHoldings, seedSettings } from "../features/portfolio/mockData";
import type {
  Account,
  CashHolding,
  ExposureBySymbol,
  FxRates,
  Holding,
  PortfolioSettings,
} from "../types/portfolio";

const normalizeSettings = (settings: Partial<PortfolioSettings> | undefined): PortfolioSettings => ({
  ...seedSettings,
  ...(settings ?? {}),
  onboardingTipsSeen: Boolean(settings?.onboardingTipsSeen),
});

interface PortfolioState {
  accounts: Account[];
  holdings: Holding[];
  cashHoldings: CashHolding[];
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
      settings: seedSettings,
      fxRates: seedFxRates,
      snapshotUpdatedAt: new Date().toISOString(),
      hydrated: false,
      setHydrated: (value: boolean) => set({ hydrated: value }),
      getSnapshot: () => {
        const { accounts, holdings, cashHoldings, settings, fxRates, snapshotUpdatedAt } = get();
        return {
          accounts,
          holdings,
          cashHoldings,
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
        set((state) => ({
          accounts: state.accounts.filter((account) => account.id !== accountId),
          holdings: state.holdings.filter((holding) => holding.accountId !== accountId),
          cashHoldings: state.cashHoldings.filter((cashHolding) => cashHolding.accountId !== accountId),
          snapshotUpdatedAt: new Date().toISOString(),
        })),

      addHolding: (holding: Holding) =>
        set((state) => ({
          holdings: [...state.holdings, holding],
          snapshotUpdatedAt: new Date().toISOString(),
        })),
      updateHolding: (holdingId: string, updates: Partial<Holding>) =>
        set((state) => ({
          holdings: state.holdings.map((holding) =>
            holding.id === holdingId ? { ...holding, ...updates } : holding
          ),
          snapshotUpdatedAt: new Date().toISOString(),
        })),
      removeHolding: (holdingId: string) =>
        set((state) => ({
          holdings: state.holdings.filter((holding) => holding.id !== holdingId),
          snapshotUpdatedAt: new Date().toISOString(),
        })),

      addCashHolding: (cashHolding: CashHolding) =>
        set((state) => ({
          cashHoldings: [...state.cashHoldings, cashHolding],
          snapshotUpdatedAt: new Date().toISOString(),
        })),
      updateCashHolding: (cashHoldingId: string, updates: Partial<CashHolding>) =>
        set((state) => ({
          cashHoldings: state.cashHoldings.map((cashHolding) =>
            cashHolding.id === cashHoldingId ? { ...cashHolding, ...updates } : cashHolding
          ),
          snapshotUpdatedAt: new Date().toISOString(),
        })),
      removeCashHolding: (cashHoldingId: string) =>
        set((state) => ({
          cashHoldings: state.cashHoldings.filter((cashHolding) => cashHolding.id !== cashHoldingId),
          snapshotUpdatedAt: new Date().toISOString(),
        })),

      updateSettings: (updates: Partial<PortfolioSettings>) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
          snapshotUpdatedAt: new Date().toISOString(),
        })),
      updateFxRates: (rates: FxRates) => set({ fxRates: rates, snapshotUpdatedAt: new Date().toISOString() }),
      clearAllData: () =>
        set({
          accounts: [],
          holdings: [],
          cashHoldings: [],
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
            settings: normalizeSettings(state.settings),
            fxRates: state.fxRates,
            snapshotUpdatedAt: new Date().toISOString(),
          });
        } else if (state && typeof state.settings?.onboardingTipsSeen !== "boolean") {
          state.updateSettings(normalizeSettings(state.settings));
        }
        state?.setHydrated(true);
      },
    }
  )
);

