import type { Account, CashHolding, FxRates, Holding, PortfolioSettings } from "../../types/portfolio";

/**
 * Whether to seed dummy/sample data for new users.
 * Set EXPO_PUBLIC_SEED_DEMO_DATA=true in .env to enable demo data (useful for development/testing).
 * By default, new users start with empty portfolios.
 */
const shouldSeedDemoData = (): boolean => {
  try {
    // Check for Expo public env var
    const envValue = process.env.EXPO_PUBLIC_SEED_DEMO_DATA;
    return envValue === "true";
  } catch {
    return false;
  }
};

// Demo accounts for development/testing purposes
const demoAccounts: Account[] = [
  {
    id: "acc-1",
    name: "Primary Investments",
    owner: "You",
    broker: "Zerodha",
    type: "BROKER",
    baseCurrency: "INR",
  },
  {
    id: "acc-2",
    name: "US Growth",
    owner: "You",
    broker: "IBKR",
    type: "BROKER",
    baseCurrency: "USD",
  },
  {
    id: "acc-3",
    name: "Family Core",
    owner: "Family",
    broker: "Fidelity",
    type: "BROKER",
    baseCurrency: "USD",
  },
];

// Demo holdings for development/testing purposes
const demoHoldings: Holding[] = [
  {
    id: "h-1",
    accountId: "acc-1",
    symbol: "RELIANCE",
    companyName: "Reliance Industries",
    quantity: 18,
    averagePrice: 2460,
    marketPrice: 2895,
    currency: "INR",
  },
  {
    id: "h-2",
    accountId: "acc-2",
    symbol: "AAPL",
    companyName: "Apple Inc.",
    quantity: 14,
    averagePrice: 171.2,
    marketPrice: 198.4,
    currency: "USD",
  },
  {
    id: "h-3",
    accountId: "acc-3",
    symbol: "AAPL",
    companyName: "Apple Inc.",
    quantity: 6,
    averagePrice: 176.5,
    marketPrice: 198.4,
    currency: "USD",
  },
  {
    id: "h-4",
    accountId: "acc-3",
    symbol: "MSFT",
    companyName: "Microsoft Corp.",
    quantity: 9,
    averagePrice: 365,
    marketPrice: 423.75,
    currency: "USD",
  },
];

// Demo cash holdings for development/testing purposes
const demoCashHoldings: CashHolding[] = [
  {
    id: "c-1",
    accountId: "acc-1",
    currency: "INR",
    balance: 125000,
  },
  {
    id: "c-2",
    accountId: "acc-2",
    currency: "USD",
    balance: 2450,
  },
];

// Export seed data based on environment configuration
export const seedAccounts: Account[] = shouldSeedDemoData() ? demoAccounts : [];
export const seedHoldings: Holding[] = shouldSeedDemoData() ? demoHoldings : [];
export const seedCashHoldings: CashHolding[] = shouldSeedDemoData() ? demoCashHoldings : [];

export const seedFxRates: FxRates = {
  USDINR: 83.2,
};

export const seedSettings: PortfolioSettings = {
  reportingCurrency: "INR",
  includeFamilyAccounts: true,
  allocationBasis: "CURRENT_VALUE",
  allocationIncludeCash: true,
  onboardingTipsSeen: false,
  spotlightTourSeen: false,
  timelineRetention: "1Y",
  themeMode: "dark",
};

