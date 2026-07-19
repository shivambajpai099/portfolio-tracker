/**
 * Intraday trade filtering.
 *
 * Same-day BUY+SELL round-trips (MIS / square-off) net to zero position but
 * pollute trade-history analytics: they inflate trade counts, add zero-day
 * "closed trades" that crush average holding periods, and double-count gross
 * capital that never actually stayed invested.
 *
 * `excludeIntradayRoundTrips` removes only the *matched* intraday quantity per
 * account/symbol/day, preserving any net overnight position. Holdings and
 * allocations are unaffected — this is meant for the Insights analytics inputs
 * only. It is a pure function (no side effects) so it is easy to unit test.
 */

import type { Transaction } from "../../types/transaction";

/**
 * Normalize a ticker so intraday legs of the *same* underlying always group
 * together, even when a broker export records them inconsistently. Uppercases,
 * trims, and strips the Indian exchange suffix (`.NS` / `.BO`) — matching the
 * normalization used for live-price lookups elsewhere in the app. Without this,
 * an intraday BUY logged as `INFY` and its offsetting SELL logged as `INFY.NS`
 * would land in different day-groups, so the SELL survives filtering and gets
 * FIFO-matched against a long-held lot — showing a phantom loss on a stock you
 * still hold.
 */
const normalizeSymbol = (symbol: string): string =>
  symbol.trim().toUpperCase().replace(/\.(NS|BO)$/i, "");

/** Calendar-day key: same account, same (normalized) symbol, same trading day. */
const dayGroupKey = (t: Transaction): string =>
  `${t.accountId}|${normalizeSymbol(t.symbol)}|${t.transactionDate.slice(0, 10)}`;

/**
 * Remove same-day, same-account, same-symbol BUY/SELL round-trips so intraday
 * activity doesn't skew trade-history analytics.
 *
 * The matched quantity (min of same-day buys and sells) is netted out. Only the
 * surplus (overnight) quantity is kept, with its transactions preserved in their
 * original order. Transactions are never mutated in place — reduced legs are
 * returned as new objects with an adjusted `quantity`.
 */
export const excludeIntradayRoundTrips = (transactions: Transaction[]): Transaction[] => {
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = dayGroupKey(tx);
    const existing = groups.get(key);
    if (existing) existing.push(tx);
    else groups.set(key, [tx]);
  }

  const result: Transaction[] = [];

  for (const group of groups.values()) {
    let buyQty = 0;
    let sellQty = 0;
    for (const tx of group) {
      if (tx.type === "BUY") buyQty += tx.quantity;
      else if (tx.type === "SELL") sellQty += tx.quantity;
    }

    const intradayQty = Math.min(buyQty, sellQty);
    if (intradayQty <= 0) {
      // Nothing offsets within the day — keep the group untouched.
      result.push(...group);
      continue;
    }

    // Drop the matched intraday quantity from each side, keeping only the net
    // overnight surplus while preserving transaction order.
    let buyToDrop = intradayQty;
    let sellToDrop = intradayQty;

    for (const tx of group) {
      if (tx.type === "BUY" && buyToDrop > 0) {
        const drop = Math.min(tx.quantity, buyToDrop);
        buyToDrop -= drop;
        const keep = tx.quantity - drop;
        if (keep > 1e-9) result.push({ ...tx, quantity: keep });
      } else if (tx.type === "SELL" && sellToDrop > 0) {
        const drop = Math.min(tx.quantity, sellToDrop);
        sellToDrop -= drop;
        const keep = tx.quantity - drop;
        if (keep > 1e-9) result.push({ ...tx, quantity: keep });
      } else {
        result.push(tx);
      }
    }
  }

  return result;
};

