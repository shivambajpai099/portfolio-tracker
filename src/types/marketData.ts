import type { Currency, TimestampISO } from "./portfolio";

export interface TickerSuggestion {
  symbol: string;
  companyName: string;
  exchange: string;
  currency: Currency;
}

export interface LivePriceQuote {
  symbol: string;
  price: number;
  currency: Currency;
  exchange: string;
  asOf: TimestampISO;
  /** Human-readable company name from the quote provider, when available. */
  companyName?: string;
}

export interface ServiceError {
  code: "NETWORK" | "API" | "UNKNOWN";
  message: string;
}

export type ServiceResult<T> =
  | {
      ok: true;
      data: T;
      fromCache: boolean;
      fetchedAt: TimestampISO;
    }
  | {
      ok: false;
      error: ServiceError;
      data?: T;
      fromCache: boolean;
      fetchedAt?: TimestampISO;
    };

