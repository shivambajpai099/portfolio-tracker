/**
 * Parser Registry
 *
 * Central registry for all source parsers (holdings and transactions).
 * To add a new parser:
 * 1. Create the parser implementing HoldingsSourceParser or TransactionSourceParser
 * 2. Import and register it here
 */

import type { HoldingsSourceParser, TransactionSourceParser, SourceParser } from "./types";
import { indmoneyParser, vestedTransactionsParser, indmoneyTransactionsParser } from "./parsers";

/**
 * All registered holdings parsers, keyed by their ID.
 */
const holdingsParsers: Record<string, HoldingsSourceParser> = {
  [indmoneyParser.id]: indmoneyParser,
  // Future parsers:
  // [upstoxParser.id]: upstoxParser,
  // [growwParser.id]: growwParser,
  // [zerodhaParser.id]: zerodhaParser,
};

/**
 * All registered transaction parsers, keyed by their ID.
 */
const transactionParsers: Record<string, TransactionSourceParser> = {
  [vestedTransactionsParser.id]: vestedTransactionsParser,
  [indmoneyTransactionsParser.id]: indmoneyTransactionsParser,
  // Future parsers:
  // [schwabTransactionsParser.id]: schwabTransactionsParser,
};

/**
 * Get a holdings parser by its ID.
 */
export const getParser = (parserId: string): HoldingsSourceParser | undefined => {
  return holdingsParsers[parserId];
};

/**
 * Get a transaction parser by its ID.
 */
export const getTransactionParser = (parserId: string): TransactionSourceParser | undefined => {
  return transactionParsers[parserId];
};

/**
 * Get any parser (holdings or transaction) by its ID.
 */
export const getAnyParser = (parserId: string): SourceParser | undefined => {
  return holdingsParsers[parserId] ?? transactionParsers[parserId];
};

/**
 * Get all registered holdings parsers.
 */
export const getAllParsers = (): HoldingsSourceParser[] => {
  return Object.values(holdingsParsers);
};

/**
 * Get all registered transaction parsers.
 */
export const getAllTransactionParsers = (): TransactionSourceParser[] => {
  return Object.values(transactionParsers);
};

/**
 * Get all parsers of any type.
 */
export const getAllSourceParsers = (): SourceParser[] => {
  return [...Object.values(holdingsParsers), ...Object.values(transactionParsers)];
};

/**
 * Get holdings parsers that support a given file extension.
 */
export const getParsersForExtension = (extension: string): HoldingsSourceParser[] => {
  const ext = extension.toLowerCase().startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return Object.values(holdingsParsers).filter((parser) =>
    parser.supportedExtensions.some((supported) => supported.toLowerCase() === ext)
  );
};

/**
 * Get transaction parsers that support a given file extension.
 */
export const getTransactionParsersForExtension = (extension: string): TransactionSourceParser[] => {
  const ext = extension.toLowerCase().startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return Object.values(transactionParsers).filter((parser) =>
    parser.supportedExtensions.some((supported) => supported.toLowerCase() === ext)
  );
};

/**
 * Get all parsers (any type) that support a given file extension.
 */
export const getAllParsersForExtension = (extension: string): SourceParser[] => {
  const ext = extension.toLowerCase().startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return getAllSourceParsers().filter((parser) =>
    parser.supportedExtensions.some((supported) => supported.toLowerCase() === ext)
  );
};

/**
 * Get the default holdings parser ID (first registered parser).
 */
export const getDefaultParserId = (): string => {
  const parserIds = Object.keys(holdingsParsers);
  return parserIds.length > 0 ? parserIds[0] : "";
};

/**
 * Get all supported file extensions across all parsers.
 */
export const getAllSupportedExtensions = (): string[] => {
  const extensions = new Set<string>();
  for (const parser of getAllSourceParsers()) {
    for (const ext of parser.supportedExtensions) {
      extensions.add(ext.toLowerCase());
    }
  }
  return Array.from(extensions);
};

export { indmoneyParser, vestedTransactionsParser, indmoneyTransactionsParser };
