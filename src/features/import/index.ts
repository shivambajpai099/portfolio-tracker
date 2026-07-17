/**
 * Import Feature
 *
 * Pluggable system for importing holdings and transactions from broker exports.
 *
 * Public API:
 * - Types for parser interface and results
 * - Parser registry for managing parsers
 * - Individual parsers (indmoney, vested-transactions, etc.)
 * - Import logic utilities
 */

// Types - Holdings
export type {
  ParsedHolding,
  SkippedRow,
  ParseResult,
  ImportFileType,
  HoldingsSourceParser,
  EnrichedHolding,
  HoldingComparison,
  ImportReviewData,
  HoldingCommitResult,
  ImportCommitResult,
} from "./types";

// Types - Transactions
export type {
  TransactionSourceParser,
  SourceParser,
  ParserType,
  ParsedTransaction,
  TransactionParseResult,
  TransactionImportReviewData,
} from "./types";

// Type guards
export { isTransactionParser, isHoldingsParser } from "./types";

// Parser registry
export {
  getParser,
  getTransactionParser,
  getAnyParser,
  getAllParsers,
  getAllTransactionParsers,
  getAllSourceParsers,
  getParsersForExtension,
  getTransactionParsersForExtension,
  getAllParsersForExtension,
  getDefaultParserId,
  getAllSupportedExtensions,
} from "./parserRegistry";

// Import logic
export {
  buildImportReviewData,
  commitImport,
  getSymbolsForPriceFetch,
  normalizeSymbol,
  generateHoldingId,
  createHoldingFromParsed,
} from "./importLogic";

// Transaction import logic
export {
  generateTransactionId,
  createTransactionFromParsed,
  createTransactionsFromParseResult,
  buildTransactionImportReviewData,
  getSymbolsFromTransactions,
} from "./transactionParser";

// Parsers
export { indmoneyParser } from "./parsers/indmoney";
export { vestedTransactionsParser } from "./parsers/vested-transactions";
export { indmoneyTransactionsParser } from "./parsers/indmoney-transactions";

