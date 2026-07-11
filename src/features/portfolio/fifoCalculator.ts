/**
 * FIFO Calculator
 *
 * Derives holdings from transactions using First-In-First-Out (FIFO) cost basis method.
 * Processes BUY transactions to create tax lots, SELL transactions consume lots in FIFO order.
 * Returns holdings that match the existing Holding schema for seamless integration.
 */

import type { Currency, Holding, TimestampISO } from "../../types/portfolio";
import type { Transaction, TaxLot, LotConsumption, SellTransactionRealization } from "../../types/transaction";

/**
 * Internal state for a position being built from transactions.
 */
interface PositionState {
  symbol: string;
  companyName: string;
  currency: Currency;
  accountId: string;
  openLots: TaxLot[];
  totalRealizedGainLoss: number;
  firstPurchaseDate: TimestampISO;
  lastTransactionDate: TimestampISO;
}

/**
 * Result of FIFO derivation for a single account.
 */
export interface FifoDerivationResult {
  holdings: Holding[];
  realizations: SellTransactionRealization[];
  errors: string[];
}

/**
 * Generate a unique holding ID for derived holdings.
 */
const generateDerivedHoldingId = (accountId: string, symbol: string): string => {
  return `derived-${accountId}-${symbol}`;
};

/**
 * Sort transactions by date (ascending) for FIFO processing.
 */
const sortTransactionsByDate = (transactions: Transaction[]): Transaction[] => {
  return [...transactions].sort((a, b) => {
    const dateA = new Date(a.transactionDate).getTime();
    const dateB = new Date(b.transactionDate).getTime();
    if (dateA !== dateB) return dateA - dateB;
    // For same date, process BUYs before SELLs
    if (a.type === "BUY" && b.type === "SELL") return -1;
    if (a.type === "SELL" && b.type === "BUY") return 1;
    return 0;
  });
};

/**
 * Process a BUY transaction: create a new tax lot.
 */
const processBuy = (position: PositionState, tx: Transaction): void => {
  const lot: TaxLot = {
    transactionId: tx.id,
    originalQuantity: tx.quantity,
    remainingQuantity: tx.quantity,
    costBasis: tx.pricePerShare,
    purchaseDate: tx.transactionDate,
  };
  position.openLots.push(lot);
  position.lastTransactionDate = tx.transactionDate;

  // Update first purchase date if this is earlier
  if (!position.firstPurchaseDate || tx.transactionDate < position.firstPurchaseDate) {
    position.firstPurchaseDate = tx.transactionDate;
  }
};

/**
 * Process a SELL transaction: consume shares from lots using FIFO.
 * Returns the realization details for tracking realized gains.
 */
const processSell = (
  position: PositionState,
  tx: Transaction
): { realization: SellTransactionRealization; error?: string } => {
  let remainingToSell = tx.quantity;
  const lotConsumptions: LotConsumption[] = [];
  let totalCostBasis = 0;
  let totalProceeds = 0;

  // Consume lots in FIFO order (oldest first)
  for (const lot of position.openLots) {
    if (remainingToSell <= 0) break;
    if (lot.remainingQuantity <= 0) continue;

    const quantityFromLot = Math.min(lot.remainingQuantity, remainingToSell);
    lot.remainingQuantity -= quantityFromLot;
    remainingToSell -= quantityFromLot;

    const costBasisForLot = quantityFromLot * lot.costBasis;
    const proceedsForLot = quantityFromLot * tx.pricePerShare;
    const realizedGainLoss = proceedsForLot - costBasisForLot;

    totalCostBasis += costBasisForLot;
    totalProceeds += proceedsForLot;

    lotConsumptions.push({
      lotTransactionId: lot.transactionId,
      quantityConsumed: quantityFromLot,
      costBasisPerShare: lot.costBasis,
      salePricePerShare: tx.pricePerShare,
      realizedGainLoss,
    });
  }

  // Remove fully consumed lots
  position.openLots = position.openLots.filter((lot) => lot.remainingQuantity > 0);
  position.lastTransactionDate = tx.transactionDate;

  const totalRealizedGainLoss = totalProceeds - totalCostBasis;
  position.totalRealizedGainLoss += totalRealizedGainLoss;

  const realization: SellTransactionRealization = {
    sellTransactionId: tx.id,
    sellDate: tx.transactionDate,
    totalQuantitySold: tx.quantity - remainingToSell,
    totalProceeds,
    totalCostBasis,
    totalRealizedGainLoss,
    lotConsumptions,
  };

  // Check for oversell
  let error: string | undefined;
  if (remainingToSell > 0.0001) {
    error = `SELL of ${tx.quantity} ${tx.symbol} exceeds available shares. Short by ${remainingToSell.toFixed(4)} shares.`;
  }

  return { realization, error };
};

/**
 * Calculate weighted average cost basis from open lots.
 */
const calculateAverageCostBasis = (lots: TaxLot[]): number => {
  let totalCost = 0;
  let totalQuantity = 0;

  for (const lot of lots) {
    if (lot.remainingQuantity > 0) {
      totalCost += lot.remainingQuantity * lot.costBasis;
      totalQuantity += lot.remainingQuantity;
    }
  }

  return totalQuantity > 0 ? totalCost / totalQuantity : 0;
};

/**
 * Calculate total remaining quantity from open lots.
 */
const calculateTotalQuantity = (lots: TaxLot[]): number => {
  return lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
};

/**
 * Derive holdings from transactions for a specific account using FIFO.
 *
 * @param transactions - All transactions (will be filtered by accountId)
 * @param accountId - Target account ID
 * @param priceMap - Optional map of symbol -> current market price
 * @returns FifoDerivationResult with derived holdings, realizations, and any errors
 */
export const deriveHoldingsFromTransactions = (
  transactions: Transaction[],
  accountId: string,
  priceMap?: Map<string, number>
): FifoDerivationResult => {
  // Filter transactions for this account and sort by date
  const accountTxs = sortTransactionsByDate(
    transactions.filter((tx) => tx.accountId === accountId)
  );

  const positions = new Map<string, PositionState>();
  const realizations: SellTransactionRealization[] = [];
  const errors: string[] = [];

  // Process each transaction
  for (const tx of accountTxs) {
    const symbol = tx.symbol.toUpperCase();

    // Get or create position state
    let position = positions.get(symbol);
    if (!position) {
      position = {
        symbol,
        companyName: tx.companyName,
        currency: tx.currency,
        accountId,
        openLots: [],
        totalRealizedGainLoss: 0,
        firstPurchaseDate: tx.transactionDate,
        lastTransactionDate: tx.transactionDate,
      };
      positions.set(symbol, position);
    }

    // Update company name if newer transaction has it
    if (tx.companyName && tx.companyName !== symbol) {
      position.companyName = tx.companyName;
    }

    // Process based on transaction type
    if (tx.type === "BUY") {
      processBuy(position, tx);
    } else if (tx.type === "SELL") {
      const { realization, error } = processSell(position, tx);
      realizations.push(realization);
      if (error) {
        errors.push(error);
      }
    }
  }

  // Convert positions to holdings (only positions with remaining shares)
  const holdings: Holding[] = [];
  const now = new Date().toISOString();

  for (const position of positions.values()) {
    const quantity = calculateTotalQuantity(position.openLots);

    // Skip positions with no remaining shares (fully liquidated)
    if (quantity < 0.0001) {
      continue;
    }

    const averagePrice = calculateAverageCostBasis(position.openLots);
    const marketPrice = priceMap?.get(position.symbol) ?? averagePrice;

    holdings.push({
      id: generateDerivedHoldingId(accountId, position.symbol),
      accountId,
      symbol: position.symbol,
      companyName: position.companyName,
      quantity,
      averagePrice,
      marketPrice,
      currency: position.currency,
      asOf: position.lastTransactionDate,
      updatedAt: now,
    });
  }

  // Sort holdings by symbol for consistent ordering
  holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));

  return { holdings, realizations, errors };
};

/**
 * Derive holdings for multiple accounts at once.
 * More efficient when you need holdings for all accounts.
 */
export const deriveAllHoldings = (
  transactions: Transaction[],
  accountIds: string[],
  priceMap?: Map<string, number>
): Map<string, FifoDerivationResult> => {
  const results = new Map<string, FifoDerivationResult>();

  for (const accountId of accountIds) {
    results.set(accountId, deriveHoldingsFromTransactions(transactions, accountId, priceMap));
  }

  return results;
};

/**
 * Get summary statistics for transaction-based P&L.
 */
export interface TransactionPnLSummary {
  totalRealizedGainLoss: number;
  totalUnrealizedGainLoss: number;
  totalCostBasis: number;
  totalMarketValue: number;
}

export const calculateTransactionPnL = (
  transactions: Transaction[],
  accountId: string,
  priceMap: Map<string, number>
): TransactionPnLSummary => {
  const { holdings, realizations } = deriveHoldingsFromTransactions(transactions, accountId, priceMap);

  const totalRealizedGainLoss = realizations.reduce(
    (sum, r) => sum + r.totalRealizedGainLoss,
    0
  );

  let totalCostBasis = 0;
  let totalMarketValue = 0;

  for (const holding of holdings) {
    const cost = holding.quantity * holding.averagePrice;
    const market = holding.quantity * holding.marketPrice;
    totalCostBasis += cost;
    totalMarketValue += market;
  }

  const totalUnrealizedGainLoss = totalMarketValue - totalCostBasis;

  return {
    totalRealizedGainLoss,
    totalUnrealizedGainLoss,
    totalCostBasis,
    totalMarketValue,
  };
};

/**
 * Get all realizations from all transactions across all accounts.
 * Useful for portfolio-wide analytics.
 */
export const getAllRealizations = (
  transactions: Transaction[]
): SellTransactionRealization[] => {
  // Group transactions by account
  const accountIds = new Set<string>();
  for (const tx of transactions) {
    accountIds.add(tx.accountId);
  }

  const allRealizations: SellTransactionRealization[] = [];
  
  for (const accountId of accountIds) {
    const { realizations } = deriveHoldingsFromTransactions(transactions, accountId);
    allRealizations.push(...realizations);
  }

  return allRealizations;
};
