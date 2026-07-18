export type Currency = "INR" | "USD";
export type TimestampISO = string;
export type ThemeMode = "light" | "dark" | "system";

export type AccountType = "BROKER" | "SAVINGS";

/** Data source for account holdings: manual entry or derived from transactions. */
export type AccountDataSource = "manual" | "transactions";

/** Returns true if the account type supports equity/fund holdings. */
export const accountSupportsHoldings = (type: AccountType): boolean => type === "BROKER";

/** Returns true if the account type supports cash balances. */
export const accountSupportsCash = (_type: AccountType): boolean => true;

export interface Account {
  id: string;
  name: string;
  owner: string;
  broker: string;
  type: AccountType;
  baseCurrency: Currency;
  /** How holdings are sourced: "manual" (direct entry) or "transactions" (derived from imported transactions). */
  dataSource?: AccountDataSource;
  createdAt?: TimestampISO;
  updatedAt?: TimestampISO;
  /** Timestamp when holdings were last imported to this account */
  lastImportedAt?: TimestampISO;
  /** Source/parser used for the last import (e.g., "INDMoney", "Manual") */
  lastImportSource?: string;
}

export interface Holding {
  id: string;
  accountId: string;
  // Exchange ticker symbol, e.g. AAPL or RELIANCE.
  symbol: string;
  companyName: string;
  quantity: number;
  averagePrice: number;
  marketPrice: number;
  currency: Currency;
  asOf?: TimestampISO;
  updatedAt?: TimestampISO;
}

export interface CashHolding {
  id: string;
  accountId: string;
  currency: Currency;
  balance: number;
  asOf?: TimestampISO;
  updatedAt?: TimestampISO;
}

export type AllocationBasis = "CURRENT_VALUE" | "INVESTED_VALUE";

/** User-defined target allocation across three buckets (must sum to 100). */
export interface TargetAllocation {
  indiaPct: number;
  usPct: number;
  cashPct: number;
}

export interface AllocationHoldingSnapshot {
  symbol: string;
  allocationPct: number;
  currentValue: number;
  investedValue: number;
  gainLossPct: number;
}

export interface AllocationSnapshot {
  date: TimestampISO;
  totalPortfolioValue: number;
  investedValue: number;
  gainLoss: number;
  indiaAllocationPct: number;
  usAllocationPct: number;
  cashAllocationPct: number;
  topHoldings: AllocationHoldingSnapshot[];
}

export type TimelineRetention = "6M" | "1Y" | "2Y" | "ALL";

export interface PortfolioSettings {
  reportingCurrency: Currency;
  includeFamilyAccounts: boolean;
  /** Whether allocation % is calculated from current market value or invested cost. */
  allocationBasis: AllocationBasis;
  /** Whether cash balances are included when computing allocation percentages. */
  allocationIncludeCash: boolean;
  /** True after the onboarding tips modal has been shown once. */
  onboardingTipsSeen: boolean;
  /** True after the spotlight onboarding tour has been completed or skipped. */
  spotlightTourSeen?: boolean;
  /** User-defined target allocation for rebalancing suggestions. */
  targetAllocation?: TargetAllocation | null;
  /** How long to retain historical allocation/timeline snapshots. */
  timelineRetention?: TimelineRetention;
  /** App theme mode: light, dark, or system default */
  themeMode?: ThemeMode;
  lastViewedAt?: TimestampISO;
  updatedAt?: TimestampISO;
}

export interface LivePriceEntry {
  symbol: string;
  currency: Currency;
  price: number;
  asOf: TimestampISO;
}

export interface LivePriceCache {
  bySymbol: Record<string, LivePriceEntry>;
  updatedAt?: TimestampISO;
}


export interface FxRates {
  USDINR: number;
}

export interface ExposureBySymbol {
  symbol: string;
  companyName: string;
  totalQuantity: number;
  totalValueInINR: number;
  totalValueInUSD: number;
}

