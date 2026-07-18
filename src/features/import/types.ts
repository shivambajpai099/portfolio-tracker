/**
 * Holdings Import System - Type Definitions
 *
 * This module defines the pluggable parser interface for importing holdings
 * from various broker exports. New sources (Upstox, Groww, etc.) can be added
 * by implementing the HoldingsSourceParser interface.
 */

import type { Currency } from "../../types/portfolio";

/**
 * A single parsed holding row from an import file.
 * This is the raw parsed data before validation and enrichment.
 */
export interface ParsedHolding {
  /** Exchange ticker symbol (e.g., AAPL, RELIANCE.NS) */
  symbol: string;
  /** Number of shares/units held */
  quantity: number;
  /** Average purchase price per share */
  avgPrice: number;
  /** Date when the holding was first acquired (optional) */
  holdingSince?: string;
  /** Original row index in the source file (for error reporting) */
  rawRowIndex: number;
}

/**
 * A row that was skipped during parsing, with the reason.
 */
export interface SkippedRow {
  /** Original row index in the source file */
  rawRowIndex: number;
  /** Human-readable reason for skipping */
  reason: string;
  /** Original raw data from the row (for debugging) */
  rawData?: Record<string, unknown>;
}

/**
 * Result of parsing a holdings export file.
 * Contains metadata, parsed holdings, and any errors encountered.
 */
export interface ParseResult {
  /** Whether the file was successfully parsed */
  ok: boolean;
  /** Name of the broker (e.g., "Vested", "INDMoney") - extracted from file */
  brokerName?: string;
  /** Date the holdings report was generated - extracted from file */
  asOfDate?: string;
  /** Currency of the holdings (inferred from file structure) */
  currency?: Currency;
  /** Successfully parsed holdings */
  holdings: ParsedHolding[];
  /** Rows that were skipped with reasons */
  skippedRows: SkippedRow[];
  /** File-level errors that prevented full parsing */
  errors: string[];
}

/**
 * Supported file types for import.
 */
export type ImportFileType = "xlsx" | "numbers" | "csv";

/**
 * Interface for a holdings source parser.
 *
 * To add support for a new broker/source:
 * 1. Create a new file implementing this interface
 * 2. Register it in the parser registry (parsers/index.ts)
 *
 * Each parser handles a specific file format from a specific source.
 */
export interface HoldingsSourceParser {
  /** Unique identifier for this parser (e.g., "indmoney", "upstox") */
  id: string;
  /** Display name shown in the UI (e.g., "INDMoney", "Upstox") */
  displayName: string;
  /** Supported file extensions (e.g., [".xlsx", ".numbers"]) */
  supportedExtensions: string[];
  /** Brief description of supported file format */
  description: string;

  /**
   * Parse a file and extract holdings data.
   *
   * @param fileUri - URI to the file (from document picker)
   * @param fileExtension - File extension (e.g., ".xlsx")
   * @returns ParseResult with holdings, skipped rows, and errors
   */
  parse(fileUri: string, fileExtension: string): Promise<ParseResult>;

  /**
   * Optional: Check if a file matches this parser's expected format.
   * Used for auto-detection when user doesn't specify the source.
   *
   * @param fileUri - URI to the file
   * @param fileExtension - File extension
   * @returns true if this parser can likely handle the file
   */
  canParse?(fileUri: string, fileExtension: string): Promise<boolean>;
}

/**
 * Enriched holding ready for review/commit.
 * Contains additional data fetched after parsing.
 */
export interface EnrichedHolding {
  /** Original parsed holding data */
  parsed: ParsedHolding;
  /** Company name (from market data lookup) */
  companyName?: string;
  /** Current market price (if available) */
  currentPrice?: number;
  /** Current value (quantity × currentPrice) */
  currentValue?: number;
  /** Invested value (quantity × avgPrice) */
  investedValue: number;
  /** Whether the symbol was recognized */
  symbolRecognized: boolean;
  /** Warning message (e.g., "Price unavailable") */
  warning?: string;
}

/**
 * Comparison between existing and imported holding.
 */
export interface HoldingComparison {
  symbol: string;
  companyName: string;
  existingQuantity: number;
  existingAvgPrice: number;
  newQuantity: number;
  newAvgPrice: number;
  parsed: ParsedHolding;
}

/**
 * Result of comparing imported holdings with existing account holdings.
 */
export interface ImportReviewData {
  /** Holdings that don't exist in the account (will be added) */
  newHoldings: EnrichedHolding[];
  /** Holdings that exist but have different quantity/price (will be updated) */
  changedHoldings: HoldingComparison[];
  /** Holdings that match exactly (no change needed) */
  unchangedHoldings: { symbol: string; companyName: string }[];
  /** Rows that were skipped during parsing */
  skippedRows: SkippedRow[];
  /** Summary counts */
  summary: {
    newCount: number;
    changedCount: number;
    unchangedCount: number;
    skippedCount: number;
  };
}

/**
 * Import commit result for a single holding.
 */
export interface HoldingCommitResult {
  symbol: string;
  success: boolean;
  action: "added" | "updated";
  error?: string;
}

/**
 * Overall result of committing an import.
 */
export interface ImportCommitResult {
  success: boolean;
  results: HoldingCommitResult[];
  summary: {
    addedCount: number;
    updatedCount: number;
    failedCount: number;
  };
}

// ---------------------------------------------------------------------------
// Transaction Import Types
// ---------------------------------------------------------------------------

import type { ParsedTransaction, TransactionParseResult } from "../../types/transaction";

// Re-export for convenience
export type { ParsedTransaction, TransactionParseResult };

/**
 * Parser type discriminator.
 */
export type ParserType = "holdings" | "transactions";

/**
 * Interface for a transaction source parser.
 *
 * Similar to HoldingsSourceParser but returns transactions instead of holdings.
 * Transactions are processed through FIFO to derive holdings.
 */
export interface TransactionSourceParser {
  /** Unique identifier for this parser (e.g., "vested-transactions") */
  id: string;
  /** Display name shown in the UI (e.g., "Vested Transactions") */
  displayName: string;
  /** Supported file extensions (e.g., [".xlsx", ".csv"]) */
  supportedExtensions: string[];
  /** Brief description of supported file format */
  description: string;
  /** Parser type discriminator */
  parserType: "transactions";
  /** Whether this parser is recommended (shown with badge in UI) */
  recommended?: boolean;

  /**
   * Parse a file and extract transaction data.
   *
   * @param fileUri - URI to the file (from document picker)
   * @param fileExtension - File extension (e.g., ".csv")
   * @returns TransactionParseResult with transactions, skipped rows, and errors
   */
  parse(fileUri: string, fileExtension: string): Promise<TransactionParseResult>;

  /**
   * Optional: Check if a file matches this parser's expected format.
   */
  canParse?(fileUri: string, fileExtension: string): Promise<boolean>;
}

/**
 * Union type for any source parser.
 */
export type SourceParser = HoldingsSourceParser | TransactionSourceParser;

/**
 * Type guard to check if a parser is a transaction parser.
 */
export const isTransactionParser = (parser: SourceParser): parser is TransactionSourceParser => {
  return "parserType" in parser && parser.parserType === "transactions";
};

/**
 * Type guard to check if a parser is a holdings parser.
 */
export const isHoldingsParser = (parser: SourceParser): parser is HoldingsSourceParser => {
  return !("parserType" in parser) || (parser as TransactionSourceParser).parserType !== "transactions";
};

/**
 * Review data for transaction imports.
 * Shows derived holdings that will be created from transactions.
 */
export interface TransactionImportReviewData {
  /** Number of transactions parsed */
  transactionCount: number;
  /** Number of BUY transactions */
  buyCount: number;
  /** Number of SELL transactions */
  sellCount: number;
  /** Holdings derived from transactions (preview) */
  derivedHoldings: EnrichedHolding[];
  /** Rows that were skipped during parsing */
  skippedRows: SkippedRow[];
  /** Any errors during FIFO derivation (e.g., sell exceeds buys) */
  derivationErrors: string[];
  /** Summary */
  summary: {
    transactionCount: number;
    derivedHoldingCount: number;
    skippedCount: number;
    errorCount: number;
  };
}
