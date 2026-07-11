/**
 * Holdings Import Feature
 *
 * Pluggable system for importing holdings from broker exports.
 *
 * Public API:
 * - Types for parser interface and results
 * - Parser registry for managing parsers
 * - Individual parsers (indmoney, etc.)
 * - Import logic utilities
 */

// Types
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

// Parser registry
export {
  getParser,
  getAllParsers,
  getParsersForExtension,
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

// Parsers
export { indmoneyParser } from "./parsers/indmoney";

