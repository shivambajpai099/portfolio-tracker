export type Currency = "INR" | "USD";
export type TimestampISO = string;

export type AccountType = "brokerage" | "retirement" | "family";

export interface Account {
  id: string;
  name: string;
  owner: string;
  broker: string;
  type: AccountType;
  baseCurrency: Currency;
  createdAt?: TimestampISO;
  updatedAt?: TimestampISO;
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

export interface PortfolioSettings {
  reportingCurrency: Currency;
  includeFamilyAccounts: boolean;
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

export type BrokerAccount = Account;

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

