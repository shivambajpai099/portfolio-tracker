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
 * Resolve a live market price for a symbol from the price map, trying common
 * Indian-exchange suffix variants (.NS/.BO). Returns undefined when no quote
 * is available so callers can fall back to the stored price.
 */
const resolveLivePrice = (symbol: string, priceMap?: Map<string, number>): number | undefined => {
  if (!priceMap) return undefined;
  const normalized = symbol.replace(/\.(NS|BO)$/i, "");
  return (
    priceMap.get(symbol) ??
    priceMap.get(normalized) ??
    priceMap.get(`${normalized}.NS`) ??
    priceMap.get(`${normalized}.BO`)
  );
};

/**
 * Combine manual holdings and derived holdings from transactions.
 * - All accounts: include manually added holdings
 * - Transaction accounts: also include derived holdings from transactions
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

  // Always include all manual holdings (regardless of account type).
  // Refresh each holding's marketPrice from the live price map when a quote is
  // available so the current value reflects the market — leaving averagePrice
  // (cost basis) untouched. Without this, manual holdings keep a stale
  // marketPrice (often equal to averagePrice), making Current == Invested.
  for (const holding of manualHoldings) {
    const livePrice = resolveLivePrice(holding.symbol, priceMap);
    allHoldings.push(livePrice != null ? { ...holding, marketPrice: livePrice } : holding);
  }

  // Also add derived holdings for transaction accounts
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

