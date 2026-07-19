/**
 * Corporate Action Processor
 *
 * Normalizes raw broker transactions for corporate actions BEFORE they reach
 * the intraday filter and the FIFO engine. Keeping this concern isolated means
 * the FIFO engine only ever sees clean, split-adjusted transactions and never
 * needs any corporate-action awareness of its own.
 *
 * Pipeline position:
 *   Import → Normalize Broker Format → [CorporateActionProcessor] →
 *   Remove Intraday Quantities → FIFO Engine → Holdings / P&L / Insights
 *
 * Currently supports STOCK SPLITS. The design is intentionally extensible: add
 * new members to `CorporateActionEvent` and handle them in
 * `CorporateActionProcessor.process`.
 *
 * Stock-split rules implemented here:
 *   - A split is applied only to transactions dated strictly BEFORE its
 *     effective (ex) date.
 *   - Quantity is multiplied by the split factor `newShares / oldShares`.
 *   - Price per share is divided by the same factor (inverse adjustment).
 *   - Total invested amount per row (quantity × pricePerShare) is preserved.
 *   - Multiple splits are applied in chronological order.
 *   - Processing is idempotent — each row records the split IDs already applied
 *     so re-running never double-adjusts.
 *   - Securities are matched by ISIN first, falling back to symbol.
 */

import type { Transaction } from "../../types/transaction";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface SplitRatio {
  /** Number of shares AFTER the split for every `oldShares` held before it. */
  newShares: number;
  /** Number of shares BEFORE the split. */
  oldShares: number;
}

/**
 * A stock split / consolidation.
 * e.g. a 5-for-1 split → `{ newShares: 5, oldShares: 1 }`.
 * A 1-for-2 reverse split → `{ newShares: 1, oldShares: 2 }`.
 */
export interface StockSplit {
  type: "split";
  /** Primary identifier (preferred). */
  isin?: string;
  /** Fallback identifier when ISIN is unavailable on either side. */
  symbol?: string;
  /** Ex/effective date (ISO). Splits apply only to transactions strictly before this date. */
  effectiveDate: string;
  ratio: SplitRatio;
  label?: string;
}

/** Union of all supported corporate actions (extend as new types are added). */
export type CorporateActionEvent = StockSplit;

// ---------------------------------------------------------------------------
// Identity helpers (ISIN primary, symbol fallback)
// ---------------------------------------------------------------------------

const normalizeSymbol = (symbol: string): string =>
  symbol.trim().toUpperCase().replace(/\.(NS|BO)$/i, "");

const normalizeIsin = (isin: string): string => isin.trim().toUpperCase();

/**
 * Stable, deterministic ID for a corporate action, used as the idempotency
 * marker written to `Transaction.appliedCorporateActions`.
 */
export const corporateActionId = (event: CorporateActionEvent): string => {
  const identity = event.isin
    ? `ISIN:${normalizeIsin(event.isin)}`
    : `SYM:${normalizeSymbol(event.symbol ?? "")}`;
  return `split|${identity}|${event.effectiveDate}|${event.ratio.newShares}:${event.ratio.oldShares}`;
};

/**
 * Does this transaction belong to the security targeted by the event?
 * ISIN is authoritative when present on BOTH sides; otherwise fall back to a
 * normalized symbol comparison.
 */
const securityMatches = (tx: Transaction, event: CorporateActionEvent): boolean => {
  if (event.isin && tx.isin) return normalizeIsin(event.isin) === normalizeIsin(tx.isin);
  if (event.symbol) return normalizeSymbol(event.symbol) === normalizeSymbol(tx.symbol);
  return false;
};

const isBeforeEffective = (tx: Transaction, effectiveDate: string): boolean =>
  new Date(tx.transactionDate).getTime() < new Date(effectiveDate).getTime();

// ---------------------------------------------------------------------------
// Stock split application (pure)
// ---------------------------------------------------------------------------

/**
 * Apply a single stock split to a list of transactions.
 *
 * Pure and idempotent: matched rows dated before the effective date have their
 * quantity/price adjusted and the split ID recorded; already-adjusted rows and
 * non-matching / post-split rows are returned untouched.
 */
export const applyStockSplit = (transactions: Transaction[], split: StockSplit): Transaction[] => {
  const factor = split.ratio.newShares / split.ratio.oldShares;
  if (!Number.isFinite(factor) || factor <= 0) return transactions;

  const id = corporateActionId(split);

  return transactions.map((tx) => {
    // Idempotency: never apply the same split to the same row twice.
    if (tx.appliedCorporateActions?.includes(id)) return tx;
    if (!securityMatches(tx, split)) return tx;
    if (!isBeforeEffective(tx, split.effectiveDate)) return tx;

    return {
      ...tx,
      quantity: tx.quantity * factor,
      pricePerShare: tx.pricePerShare / factor,
      appliedCorporateActions: [...(tx.appliedCorporateActions ?? []), id],
    };
  });
};

// ---------------------------------------------------------------------------
// Default split registry
// ---------------------------------------------------------------------------

/**
 * Known stock splits. Add entries verified against the exchange announcement
 * (ISIN + ex date + ratio). Entries that don't match any imported transaction
 * are harmless no-ops.
 */
export const DEFAULT_STOCK_SPLITS: StockSplit[] = [
  // Tata Steel sub-division of face value ₹10 → ₹1 (1 old share → 10 new),
  // ex-date 2022-07-28. Fixes false FIFO short-sell warnings when pre-split
  // buys are sold post-split.
  {
    type: "split",
    symbol: "TATASTEEL",
    effectiveDate: "2022-07-28",
    ratio: { newShares: 10, oldShares: 1 },
    label: "Tata Steel 1:10 split",
  },

  // Example (disabled — verify before enabling):
  // IRCTC 1→5 split, ex-date 2021-10-29:
  // { type: "split", isin: "INE335Y01020", symbol: "IRCTC", effectiveDate: "2021-10-29", ratio: { newShares: 5, oldShares: 1 }, label: "IRCTC 1:5 split" },
];

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

/**
 * Applies a configured set of corporate actions to raw transactions,
 * producing normalized transactions ready for intraday filtering and FIFO.
 */
export class CorporateActionProcessor {
  private readonly events: CorporateActionEvent[];

  constructor(events: CorporateActionEvent[] = DEFAULT_STOCK_SPLITS) {
    // Apply chronologically so multiple splits compound in the right order.
    this.events = [...events].sort(
      (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime()
    );
  }

  /** Normalize transactions for all configured corporate actions. */
  process(transactions: Transaction[]): Transaction[] {
    let working = transactions;
    for (const event of this.events) {
      switch (event.type) {
        case "split":
          working = applyStockSplit(working, event);
          break;
        // Future corporate-action types handled here.
      }
    }
    return working;
  }
}

/**
 * Convenience wrapper: normalize transactions with the given (or default)
 * corporate actions.
 */
export const processCorporateActions = (
  transactions: Transaction[],
  events: CorporateActionEvent[] = DEFAULT_STOCK_SPLITS
): Transaction[] => new CorporateActionProcessor(events).process(transactions);

