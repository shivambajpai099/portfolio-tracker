import type { Account, Currency, ExposureBySymbol, FxRates, Holding } from "../../types/portfolio";
import type { Transaction } from "../../types/transaction";
import { holdingMarketValue, toINR, toUSD } from "./calculations";
import { deriveHoldingsFromTransactions } from "./fifoCalculator";

// Re-export from calculations so callers can import from either location.
export { holdingMarketValue, toINR, toUSD } from "./calculations";

/**
 * Get derived holdings for a transaction-sourced account.
 * Returns empty array if account is not transaction-sourced.
 */
export const selectDerivedHoldings = (
  transactions: Transaction[],
  accountId: string,
  priceMap?: Map<string, number>
): Holding[] => {
  const { holdings } = deriveHoldingsFromTransactions(transactions, accountId, priceMap);
  return holdings;
};

/**
 * Combine manual holdings and derived holdings from transactions.
 * - Manual accounts: use holdings directly
 * - Transaction accounts: derive holdings from transactions
 *
 * This is the main selector for getting all holdings in a unified way.
 */
export const selectAllHoldings = (
  manualHoldings: Holding[],
  transactions: Transaction[],
  accounts: Account[],
  priceMap?: Map<string, number>
): Holding[] => {
  const allHoldings: Holding[] = [];
  const transactionAccountIds = new Set<string>();

  // Identify which accounts are transaction-sourced
  for (const account of accounts) {
    if (account.dataSource === "transactions") {
      transactionAccountIds.add(account.id);
    }
  }

  // Add manual holdings (from non-transaction accounts)
  for (const holding of manualHoldings) {
    if (!transactionAccountIds.has(holding.accountId)) {
      allHoldings.push(holding);
    }
  }

  // Add derived holdings for transaction accounts
  for (const accountId of transactionAccountIds) {
    const derived = selectDerivedHoldings(transactions, accountId, priceMap);
    allHoldings.push(...derived);
  }

  return allHoldings;
};

/**
 * Check if an account uses transactions as data source.
 */
export const isTransactionAccount = (account: Account): boolean => {
  return account.dataSource === "transactions";
};

export const exposureBySymbol = (holdings: Holding[], usdInr: number): ExposureBySymbol[] => {
  const rates: FxRates = { USDINR: usdInr };
  const map = new Map<string, ExposureBySymbol>();

  for (const holding of holdings) {
    const current = map.get(holding.symbol);
    const marketValue = holdingMarketValue(holding);
    const inrValue = toINR(marketValue, holding.currency as Currency, rates);
    const usdValue = toUSD(marketValue, holding.currency as Currency, rates);

    if (!current) {
      map.set(holding.symbol, {
        symbol: holding.symbol,
        companyName: holding.companyName,
        totalQuantity: holding.quantity,
        totalValueInINR: inrValue,
        totalValueInUSD: usdValue,
      });
      continue;
    }

    current.totalQuantity += holding.quantity;
    current.totalValueInINR += inrValue;
    current.totalValueInUSD += usdValue;
  }

  return [...map.values()].sort((a, b) => b.totalValueInINR - a.totalValueInINR);
};

