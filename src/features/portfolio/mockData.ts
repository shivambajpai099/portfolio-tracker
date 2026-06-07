import type { Account, CashHolding, FxRates, Holding, PortfolioSettings } from "../../types/portfolio";

export const seedAccounts: Account[] = [
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

export const seedHoldings: Holding[] = [
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

export const seedFxRates: FxRates = {
  USDINR: 83.2,
};

export const seedCashHoldings: CashHolding[] = [
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

export const seedSettings: PortfolioSettings = {
  reportingCurrency: "INR",
  includeFamilyAccounts: true,
  allocationBasis: "CURRENT_VALUE",
  allocationIncludeCash: true,
  onboardingTipsSeen: false,
  timelineRetention: "1Y",
};

