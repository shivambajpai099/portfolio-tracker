import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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

interface PortfolioState {
  accounts: Account[];
  holdings: Holding[];
  cashHoldings: CashHolding[];
  settings: PortfolioSettings;
  fxRates: FxRates;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;

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
      hydrated: false,
      setHydrated: (value: boolean) => set({ hydrated: value }),

      addAccount: (account: Account) =>
        set((state) => ({
          accounts: [...state.accounts, account],
        })),
      updateAccount: (accountId: string, updates: Partial<Account>) =>
        set((state) => ({
          accounts: state.accounts.map((account) =>
            account.id === accountId ? { ...account, ...updates } : account
          ),
        })),
      removeAccount: (accountId: string) =>
        set((state) => ({
          accounts: state.accounts.filter((account) => account.id !== accountId),
          holdings: state.holdings.filter((holding) => holding.accountId !== accountId),
          cashHoldings: state.cashHoldings.filter((cashHolding) => cashHolding.accountId !== accountId),
        })),

      addHolding: (holding: Holding) =>
        set((state) => ({
          holdings: [...state.holdings, holding],
        })),
      updateHolding: (holdingId: string, updates: Partial<Holding>) =>
        set((state) => ({
          holdings: state.holdings.map((holding) =>
            holding.id === holdingId ? { ...holding, ...updates } : holding
          ),
        })),
      removeHolding: (holdingId: string) =>
        set((state) => ({
          holdings: state.holdings.filter((holding) => holding.id !== holdingId),
        })),

      addCashHolding: (cashHolding: CashHolding) =>
        set((state) => ({
          cashHoldings: [...state.cashHoldings, cashHolding],
        })),
      updateCashHolding: (cashHoldingId: string, updates: Partial<CashHolding>) =>
        set((state) => ({
          cashHoldings: state.cashHoldings.map((cashHolding) =>
            cashHolding.id === cashHoldingId ? { ...cashHolding, ...updates } : cashHolding
          ),
        })),
      removeCashHolding: (cashHoldingId: string) =>
        set((state) => ({
          cashHoldings: state.cashHoldings.filter((cashHolding) => cashHolding.id !== cashHoldingId),
        })),

      updateSettings: (updates: Partial<PortfolioSettings>) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),
      updateFxRates: (rates: FxRates) => set({ fxRates: rates }),
      clearAllData: () =>
        set({
          accounts: [],
          holdings: [],
          cashHoldings: [],
          settings: seedSettings,
          fxRates: seedFxRates,
        }),

      totalValueInINR: () => {
        const { holdings, fxRates } = get();
        return holdings.reduce((sum: number, item: Holding) => {
          const value = holdingMarketValue(item);
          return sum + toINR(value, item.currency, fxRates.USDINR);
        }, 0);
      },
      totalValueInUSD: () => {
        const { holdings, fxRates } = get();
        return holdings.reduce((sum: number, item: Holding) => {
          const value = holdingMarketValue(item);
          return sum + toUSD(value, item.currency, fxRates.USDINR);
        }, 0);
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
      }),
      onRehydrateStorage: () => (state: PortfolioState | undefined) => {
        state?.setHydrated(true);
      },
    }
  )
);

