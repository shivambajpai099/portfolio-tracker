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

