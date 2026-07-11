/**
 * Transaction Parser Utilities
 *
 * Converts parsed transactions from import files into Transaction entities
 * and derives holdings using FIFO calculation.
 */

import type { Currency, Holding } from "../../types/portfolio";
import type { Transaction, ParsedTransaction, TransactionParseResult } from "../../types/transaction";
import { deriveHoldingsFromTransactions } from "../portfolio/fifoCalculator";
import type { EnrichedHolding, TransactionImportReviewData, SkippedRow } from "./types";

/**
 * Generate a unique transaction ID.
 */
export const generateTransactionId = (): string => {
  return `tx-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

/**
 * Convert a ParsedTransaction to a full Transaction entity.
 */
export const createTransactionFromParsed = (
  parsed: ParsedTransaction,
  accountId: string,
  currency: Currency,
  companyName?: string
): Transaction => {
  const now = new Date().toISOString();
  return {
    id: generateTransactionId(),
    accountId,
    symbol: parsed.symbol.toUpperCase(),
    companyName: companyName || parsed.companyName || parsed.symbol.toUpperCase(),
    transactionDate: parsed.transactionDate,
    type: parsed.type,
    quantity: parsed.quantity,
    pricePerShare: parsed.pricePerShare,
    fees: parsed.fees,
    currency,
    notes: parsed.notes,
    createdAt: now,
  };
};

/**
 * Convert all parsed transactions to Transaction entities.
 */
export const createTransactionsFromParseResult = (
  parseResult: TransactionParseResult,
  accountId: string,
  priceMap?: Map<string, { price: number; companyName: string }>
): Transaction[] => {
  const currency = parseResult.currency || "USD";

  return parseResult.transactions.map((parsed) => {
    const priceData = priceMap?.get(parsed.symbol.toUpperCase());
    return createTransactionFromParsed(
      parsed,
      accountId,
      currency,
      priceData?.companyName || parsed.companyName
    );
  });
};

/**
 * Build review data for a transaction import.
 * Shows preview of derived holdings and any errors.
 */
export const buildTransactionImportReviewData = (
  parseResult: TransactionParseResult,
  accountId: string,
  priceMap: Map<string, { price: number; companyName: string }>
): TransactionImportReviewData => {
  const currency = parseResult.currency || "USD";

  // Create transactions from parsed data
  const transactions = createTransactionsFromParseResult(parseResult, accountId, priceMap);

  // Derive holdings using FIFO
  const { holdings, errors } = deriveHoldingsFromTransactions(
    transactions,
    accountId,
    new Map(Array.from(priceMap.entries()).map(([k, v]) => [k, v.price]))
  );

  // Count transaction types
  const buyCount = parseResult.transactions.filter((tx) => tx.type === "BUY").length;
  const sellCount = parseResult.transactions.filter((tx) => tx.type === "SELL").length;

  // Enrich holdings for display
  const derivedHoldings: EnrichedHolding[] = holdings.map((holding) => {
    const priceData = priceMap.get(holding.symbol);
    return {
      parsed: {
        symbol: holding.symbol,
        quantity: holding.quantity,
        avgPrice: holding.averagePrice,
        rawRowIndex: 0, // Not applicable for derived holdings
      },
      companyName: holding.companyName,
      currentPrice: priceData?.price ?? holding.marketPrice,
      currentValue: holding.quantity * (priceData?.price ?? holding.marketPrice),
      investedValue: holding.quantity * holding.averagePrice,
      symbolRecognized: Boolean(priceData),
      warning: priceData ? undefined : "Price unavailable — using cost basis",
    };
  });

  return {
    transactionCount: parseResult.transactions.length,
    buyCount,
    sellCount,
    derivedHoldings,
    skippedRows: parseResult.skippedRows,
    derivationErrors: errors,
    summary: {
      transactionCount: parseResult.transactions.length,
      derivedHoldingCount: derivedHoldings.length,
      skippedCount: parseResult.skippedRows.length,
      errorCount: errors.length,
    },
  };
};

/**
 * Get unique symbols from parsed transactions for price fetching.
 */
export const getSymbolsFromTransactions = (parseResult: TransactionParseResult): string[] => {
  const symbols = new Set<string>();
  for (const tx of parseResult.transactions) {
    symbols.add(tx.symbol.trim().toUpperCase());
  }
  return Array.from(symbols);
};

