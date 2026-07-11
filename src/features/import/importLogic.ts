/**
 * Import Logic Utilities
 *
 * Handles comparison of parsed holdings with existing account holdings,
 * price enrichment, and commit operations.
 */

import type { Holding, Currency } from "../../types/portfolio";
import type {
  ParsedHolding,
  ParseResult,
  EnrichedHolding,
  HoldingComparison,
  ImportReviewData,
  HoldingCommitResult,
  ImportCommitResult,
} from "./types";

/**
 * Compare parsed holdings with existing account holdings.
 * Categorizes each parsed holding as NEW, CHANGED, or UNCHANGED.
 */
export const buildImportReviewData = (
  parseResult: ParseResult,
  existingHoldings: Holding[],
  accountId: string,
  priceMap: Map<string, { price: number; companyName: string }>
): ImportReviewData => {
  // Filter existing holdings to only those in the target account
  const accountHoldings = existingHoldings.filter((h) => h.accountId === accountId);

  // Build map of existing holdings by symbol (normalized)
  const existingBySymbol = new Map<string, Holding>();
  for (const holding of accountHoldings) {
    existingBySymbol.set(normalizeSymbol(holding.symbol), holding);
  }

  const newHoldings: EnrichedHolding[] = [];
  const changedHoldings: HoldingComparison[] = [];
  const unchangedHoldings: { symbol: string; companyName: string }[] = [];

  for (const parsed of parseResult.holdings) {
    const normalizedSymbol = normalizeSymbol(parsed.symbol);
    const existing = existingBySymbol.get(normalizedSymbol);
    const priceData = priceMap.get(normalizedSymbol);

    const enriched: EnrichedHolding = {
      parsed,
      companyName: priceData?.companyName,
      currentPrice: priceData?.price,
      currentValue: priceData?.price ? parsed.quantity * priceData.price : undefined,
      investedValue: parsed.quantity * parsed.avgPrice,
      symbolRecognized: Boolean(priceData),
      warning: priceData ? undefined : "Price unavailable — will import at cost basis only",
    };

    if (!existing) {
      // NEW: doesn't exist in account
      newHoldings.push(enriched);
    } else {
      // Check if changed
      const quantityChanged = Math.abs(existing.quantity - parsed.quantity) > 0.0001;
      const priceChanged = Math.abs(existing.averagePrice - parsed.avgPrice) > 0.0001;

      if (quantityChanged || priceChanged) {
        // CHANGED: exists but different quantity or avg price
        changedHoldings.push({
          symbol: parsed.symbol,
          companyName: existing.companyName || priceData?.companyName || parsed.symbol,
          existingQuantity: existing.quantity,
          existingAvgPrice: existing.averagePrice,
          newQuantity: parsed.quantity,
          newAvgPrice: parsed.avgPrice,
          parsed,
        });
      } else {
        // UNCHANGED: exists with same values
        unchangedHoldings.push({
          symbol: parsed.symbol,
          companyName: existing.companyName || priceData?.companyName || parsed.symbol,
        });
      }
    }
  }

  return {
    newHoldings,
    changedHoldings,
    unchangedHoldings,
    skippedRows: parseResult.skippedRows,
    summary: {
      newCount: newHoldings.length,
      changedCount: changedHoldings.length,
      unchangedCount: unchangedHoldings.length,
      skippedCount: parseResult.skippedRows.length,
    },
  };
};

/**
 * Normalize a symbol for comparison.
 * Removes exchange suffixes and normalizes case.
 */
export const normalizeSymbol = (symbol: string): string => {
  return symbol.trim().toUpperCase();
};

/**
 * Generate a unique holding ID.
 */
export const generateHoldingId = (): string => {
  return `h-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

/**
 * Create a Holding object from parsed data.
 */
export const createHoldingFromParsed = (
  parsed: ParsedHolding,
  accountId: string,
  currency: Currency,
  companyName?: string,
  currentPrice?: number
): Holding => {
  const now = new Date().toISOString();
  return {
    id: generateHoldingId(),
    accountId,
    symbol: parsed.symbol,
    companyName: companyName || parsed.symbol,
    quantity: parsed.quantity,
    averagePrice: parsed.avgPrice,
    marketPrice: currentPrice ?? parsed.avgPrice, // Use avg price as fallback
    currency,
    asOf: parsed.holdingSince,
    updatedAt: now,
  };
};

/**
 * Commit import changes to the store.
 * Processes holdings one by one and returns results.
 */
export const commitImport = (
  reviewData: ImportReviewData,
  accountId: string,
  currency: Currency,
  priceMap: Map<string, { price: number; companyName: string }>,
  existingHoldings: Holding[],
  addHolding: (holding: Holding) => void,
  updateHolding: (holdingId: string, updates: Partial<Holding>) => void
): ImportCommitResult => {
  const results: HoldingCommitResult[] = [];
  let addedCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  // Filter existing holdings to only those in the target account
  const accountHoldings = existingHoldings.filter((h) => h.accountId === accountId);
  const existingBySymbol = new Map<string, Holding>();
  for (const holding of accountHoldings) {
    existingBySymbol.set(normalizeSymbol(holding.symbol), holding);
  }

  // Process new holdings
  for (const enriched of reviewData.newHoldings) {
    try {
      const priceData = priceMap.get(normalizeSymbol(enriched.parsed.symbol));
      const holding = createHoldingFromParsed(
        enriched.parsed,
        accountId,
        currency,
        priceData?.companyName || enriched.companyName,
        priceData?.price || enriched.currentPrice
      );
      addHolding(holding);
      results.push({ symbol: enriched.parsed.symbol, success: true, action: "added" });
      addedCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ symbol: enriched.parsed.symbol, success: false, action: "added", error: message });
      failedCount++;
    }
  }

  // Process changed holdings
  for (const changed of reviewData.changedHoldings) {
    try {
      const existing = existingBySymbol.get(normalizeSymbol(changed.symbol));
      if (!existing) {
        throw new Error("Holding not found");
      }

      const priceData = priceMap.get(normalizeSymbol(changed.symbol));
      const now = new Date().toISOString();

      updateHolding(existing.id, {
        quantity: changed.newQuantity,
        averagePrice: changed.newAvgPrice,
        marketPrice: priceData?.price ?? existing.marketPrice,
        updatedAt: now,
      });

      results.push({ symbol: changed.symbol, success: true, action: "updated" });
      updatedCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ symbol: changed.symbol, success: false, action: "updated", error: message });
      failedCount++;
    }
  }

  return {
    success: failedCount === 0,
    results,
    summary: {
      addedCount,
      updatedCount,
      failedCount,
    },
  };
};

/**
 * Build symbols list for price fetching.
 */
export const getSymbolsForPriceFetch = (parseResult: ParseResult): string[] => {
  const symbols = new Set<string>();
  for (const holding of parseResult.holdings) {
    symbols.add(holding.symbol.trim().toUpperCase());
  }
  return Array.from(symbols);
};

