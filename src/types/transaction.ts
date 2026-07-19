/**
 * Transaction-Based Portfolio Types
 *
 * These types represent the transaction-based model where transactions are the
 * source of truth, and holdings, cost basis, and P&L are derived from them.
 */

import type { Currency, TimestampISO } from "./portfolio";

// ---------------------------------------------------------------------------
// Transaction Types
// ---------------------------------------------------------------------------

export type TransactionType = "BUY" | "SELL";

/**
 * A single transaction (BUY or SELL) for a security.
 */
export interface Transaction {
  id: string;
  accountId: string;
  symbol: string;
  /** Primary security identifier used for corporate-action matching (preferred over symbol). */
  isin?: string;
  companyName: string;
  transactionDate: TimestampISO;
  type: TransactionType;
  quantity: number;
  pricePerShare: number;
  fees?: number;
  currency: Currency;
  notes?: string;
  /**
   * IDs of corporate actions (e.g. stock splits) already applied to this
   * transaction. Enables idempotent re-processing — a split is never applied
   * twice to the same row.
   */
  appliedCorporateActions?: string[];
  createdAt: TimestampISO;
  updatedAt?: TimestampISO;
}

/**
 * Create transaction input (without id and timestamps).
 */
export interface CreateTransactionInput {
  accountId: string;
  symbol: string;
  isin?: string;
  companyName: string;
  transactionDate: TimestampISO;
  type: TransactionType;
  quantity: number;
  pricePerShare: number;
  fees?: number;
  currency: Currency;
  notes?: string;
}

// ---------------------------------------------------------------------------
// FIFO Lot Types
// ---------------------------------------------------------------------------

/**
 * A tax lot created by a BUY transaction.
 * Tracks remaining quantity after sells have consumed shares.
 */
export interface TaxLot {
  /** ID of the BUY transaction that created this lot */
  transactionId: string;
  /** Original quantity purchased */
  originalQuantity: number;
  /** Remaining quantity after sells (FIFO consumption) */
  remainingQuantity: number;
  /** Price per share at purchase */
  costBasis: number;
  /** Date of purchase */
  purchaseDate: TimestampISO;
}

/**
 * Result of consuming shares from lots via FIFO.
 * Used to track realized gains when selling.
 */
export interface LotConsumption {
  /** ID of the lot being consumed */
  lotTransactionId: string;
  /** Number of shares consumed from this lot */
  quantityConsumed: number;
  /** Cost basis per share from this lot */
  costBasisPerShare: number;
  /** Sale price per share */
  salePricePerShare: number;
  /** Realized gain/loss from this consumption */
  realizedGainLoss: number;
}

/**
 * Summary of a SELL transaction's lot consumptions.
 */
export interface SellTransactionRealization {
  sellTransactionId: string;
  sellDate: TimestampISO;
  totalQuantitySold: number;
  totalProceeds: number;
  totalCostBasis: number;
  totalRealizedGainLoss: number;
  lotConsumptions: LotConsumption[];
}

// ---------------------------------------------------------------------------
// Derived Holding Types
// ---------------------------------------------------------------------------

/**
 * A holding derived from transactions (current position).
 */
export interface DerivedHolding {
  symbol: string;
  companyName: string;
  accountId: string;
  /** Total shares currently held (bought - sold) */
  quantity: number;
  /** Weighted average cost basis per share of current holdings */
  averageCostBasis: number;
  /** Total cost basis of current holdings */
  totalCostBasis: number;
  /** Current market price (from live price data) */
  marketPrice: number;
  /** Current market value */
  currentValue: number;
  /** Unrealized gain/loss */
  unrealizedGainLoss: number;
  /** Unrealized gain/loss percentage */
  unrealizedGainLossPct: number;
  /** Currency of the holding */
  currency: Currency;
  /** Open tax lots for this position */
  openLots: TaxLot[];
  /** Total realized gain/loss from closed positions */
  realizedGainLoss: number;
  /** First purchase date */
  firstPurchaseDate: TimestampISO;
  /** Latest transaction date */
  lastTransactionDate: TimestampISO;
}

/**
 * Aggregated holding across all accounts.
 */
export interface AggregatedHolding {
  symbol: string;
  companyName: string;
  /** Total shares across all accounts */
  totalQuantity: number;
  /** Weighted average cost basis */
  averageCostBasis: number;
  /** Total cost basis */
  totalCostBasis: number;
  /** Current market price */
  marketPrice: number;
  /** Current market value */
  currentValue: number;
  /** Unrealized gain/loss */
  unrealizedGainLoss: number;
  /** Unrealized gain/loss percentage */
  unrealizedGainLossPct: number;
  /** Currency */
  currency: Currency;
  /** Account IDs that hold this symbol */
  accountIds: string[];
  /** Total realized gain/loss */
  realizedGainLoss: number;
}

// ---------------------------------------------------------------------------
// Portfolio Metrics Types
// ---------------------------------------------------------------------------

/**
 * Comprehensive portfolio metrics derived from transactions.
 */
export interface PortfolioMetrics {
  /** Total capital invested (sum of all BUY amounts, minus returned capital from sells) */
  totalInvestedCapital: number;
  /** Current portfolio market value */
  currentPortfolioValue: number;
  /** Total cost basis of current holdings */
  totalCostBasis: number;
  /** Total realized P&L from closed positions */
  realizedPnL: number;
  /** Total unrealized P&L from open positions */
  unrealizedPnL: number;
  /** Total return (realized + unrealized) */
  totalReturn: number;
  /** Total return percentage */
  totalReturnPct: number;
  /** Number of open positions */
  positionCount: number;
  /** Reporting currency */
  currency: Currency;
}

/**
 * Historical portfolio snapshot at a specific date.
 */
export interface HistoricalPortfolioSnapshot {
  date: TimestampISO;
  /** Holdings on this date (before any transactions on this date) */
  holdings: DerivedHolding[];
  /** Total cost basis on this date */
  totalCostBasis: number;
  /** Total invested capital up to this date */
  investedCapital: number;
  /** Market value on this date (if historical prices available) */
  marketValue?: number;
  /** Total realized P&L up to this date */
  realizedPnL: number;
}

// ---------------------------------------------------------------------------
// Import Types
// ---------------------------------------------------------------------------

/**
 * A parsed transaction from an import file.
 */
export interface ParsedTransaction {
  symbol: string;
  isin?: string;
  companyName?: string;
  transactionDate: string;
  type: TransactionType;
  quantity: number;
  pricePerShare: number;
  fees?: number;
  notes?: string;
  rawRowIndex: number;
}

/**
 * Result of parsing a transaction export file.
 */
export interface TransactionParseResult {
  ok: boolean;
  brokerName?: string;
  currency?: Currency;
  transactions: ParsedTransaction[];
  skippedRows: Array<{
    rawRowIndex: number;
    reason: string;
    rawData?: Record<string, unknown>;
  }>;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Migration Types
// ---------------------------------------------------------------------------

/**
 * Result of migrating from holdings-based to transaction-based model.
 */
export interface MigrationResult {
  success: boolean;
  transactionsCreated: number;
  holdingsMigrated: number;
  errors: string[];
  transactions: Transaction[];
}

