/**
 * Holdings Parser Registry
 *
 * Central registry for all holdings source parsers.
 * To add a new parser:
 * 1. Create the parser implementing HoldingsSourceParser interface
 * 2. Import and register it here
 */

import type { HoldingsSourceParser } from "./types";
import { indmoneyParser } from "./parsers";

/**
 * All registered parsers, keyed by their ID.
 * New parsers are added here.
 */
const parsers: Record<string, HoldingsSourceParser> = {
  [indmoneyParser.id]: indmoneyParser,
  // Future parsers:
  // [upstoxParser.id]: upstoxParser,
  // [growwParser.id]: growwParser,
  // [zerodhaParser.id]: zerodhaParser,
};

/**
 * Get a parser by its ID.
 */
export const getParser = (parserId: string): HoldingsSourceParser | undefined => {
  return parsers[parserId];
};

/**
 * Get all registered parsers.
 */
export const getAllParsers = (): HoldingsSourceParser[] => {
  return Object.values(parsers);
};

/**
 * Get parsers that support a given file extension.
 */
export const getParsersForExtension = (extension: string): HoldingsSourceParser[] => {
  const ext = extension.toLowerCase().startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return Object.values(parsers).filter((parser) =>
    parser.supportedExtensions.some((supported) => supported.toLowerCase() === ext)
  );
};

/**
 * Get the default parser ID (first registered parser).
 */
export const getDefaultParserId = (): string => {
  const parserIds = Object.keys(parsers);
  return parserIds.length > 0 ? parserIds[0] : "";
};

/**
 * Get all supported file extensions across all parsers.
 */
export const getAllSupportedExtensions = (): string[] => {
  const extensions = new Set<string>();
  for (const parser of Object.values(parsers)) {
    for (const ext of parser.supportedExtensions) {
      extensions.add(ext.toLowerCase());
    }
  }
  return Array.from(extensions);
};

export { indmoneyParser };


