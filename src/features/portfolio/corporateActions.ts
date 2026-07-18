/**
 * Corporate Actions
 *
 * Broker order-history exports (e.g. Groww) only contain actual BUY/SELL
 * orders. They do NOT contain shares that were credited to your demat account
 * by corporate actions — bonus issues, stock splits and demerger allotments.
 *
 * Because those shares appear "out of nowhere", FIFO validation flags later
 * SELLs of them as false "short sell / exceeds available shares" warnings
 * (classic offenders: GAIL, ITC, ADANIENT, TATAMOTORS/TMPV).
 *
 * This module injects synthetic zero-cost BUY transactions (and applies symbol
 * renames) so the derived holdings and FIFO validation stay consistent.
 *
 * Ported from the standalone applyCorporateActions.js script.
 */

import type { Transaction } from "../../types/transaction";

/**
 * A corporate action to reconcile against imported transactions.
 *
 * - rename:   the ticker changed (e.g. TATAMOTORS -> TMPV after demerger);
 *             the same shares are simply relabeled.
 * - bonus:    extra shares credited to the SAME symbol at zero cost.
 * - demerger: shares of a NEW symbol credited based on the parent holding
 *             as of the record date.
 */
export type CorporateAction =
  | { type: "rename"; fromSymbol: string; toSymbol: string }
  | {
      type: "bonus";
      symbol: string;
      recordDate: string;
      ratio: { new: number; held: number };
      label?: string;
      exchange?: string;
    }
  | {
      type: "demerger";
      parentSymbol: string;
      newSymbol: string;
      recordDate: string;
      ratio: { new: number; held: number };
      label?: string;
      exchange?: string;
    };

const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();

/**
 * Net shares held in `symbol` as of (and including) `asOfDate`, based only on
 * the BUY/SELL rows seen so far.
 */
export const sharesHeldAsOf = (
  transactions: Transaction[],
  symbol: string,
  asOfDate: string
): number => {
  const target = normalizeSymbol(symbol);
  const cutoff = new Date(asOfDate).getTime();
  let held = 0;
  for (const tx of transactions) {
    if (normalizeSymbol(tx.symbol) !== target) continue;
    if (new Date(tx.transactionDate).getTime() > cutoff) continue;
    if (tx.type === "BUY") held += tx.quantity;
    else if (tx.type === "SELL") held -= tx.quantity;
  }
  return held;
};

/**
 * Rename every transaction's symbol from `fromSymbol` to `toSymbol`.
 */
const applyRename = (transactions: Transaction[], action: Extract<CorporateAction, { type: "rename" }>): Transaction[] => {
  const from = normalizeSymbol(action.fromSymbol);
  const to = normalizeSymbol(action.toSymbol);
  return transactions.map((tx) =>
    normalizeSymbol(tx.symbol) === from ? { ...tx, symbol: to } : tx
  );
};

/**
 * Inject a synthetic zero-cost BUY for a bonus issue or demerger allotment,
 * sized from the parent holding as of the record date.
 */
const applyCredit = (
  transactions: Transaction[],
  action: Extract<CorporateAction, { type: "bonus" | "demerger" }>
): Transaction[] => {
  const parentSymbol = action.type === "demerger" ? action.parentSymbol : action.symbol;
  const targetSymbol = action.type === "demerger" ? action.newSymbol : action.symbol;

  const held = sharesHeldAsOf(transactions, parentSymbol, action.recordDate);
  if (held <= 0) return transactions; // didn't hold the parent on the record date

  const qty = Math.floor((held * action.ratio.new) / action.ratio.held);
  if (qty <= 0) return transactions;

  // Deterministic id keeps re-imports idempotent (no duplicate credits).
  const syntheticId = `ca-${action.type}-${normalizeSymbol(targetSymbol)}-${action.recordDate}`;
  if (transactions.some((tx) => tx.id === syntheticId)) return transactions;

  // Inherit account/currency from an existing transaction for this position.
  const reference =
    transactions.find((tx) => normalizeSymbol(tx.symbol) === normalizeSymbol(parentSymbol)) ??
    transactions[0];
  if (!reference) return transactions;

  const synthetic: Transaction = {
    id: syntheticId,
    accountId: reference.accountId,
    symbol: normalizeSymbol(targetSymbol),
    companyName: action.label || normalizeSymbol(targetSymbol),
    transactionDate: new Date(action.recordDate).toISOString(),
    type: "BUY",
    quantity: qty,
    pricePerShare: 0, // corporate-action shares are credited at zero cash cost
    fees: 0,
    currency: reference.currency,
    notes: `Corporate action (${action.type})`,
    createdAt: new Date().toISOString(),
  };

  return [...transactions, synthetic];
};

/**
 * Apply a list of corporate actions to a set of transactions.
 * Renames are applied first (so later bonus/demerger lookups see the
 * post-rename symbol), then credits, in the order given.
 */
export const applyCorporateActions = (
  transactions: Transaction[],
  actions: CorporateAction[] = DEFAULT_CORPORATE_ACTIONS
): Transaction[] => {
  let working = [...transactions];
  for (const action of actions) {
    if (action.type === "rename") {
      working = applyRename(working, action);
    } else {
      working = applyCredit(working, action);
    }
  }
  return working;
};

/**
 * Built-in corporate actions for well-documented Indian-market events that
 * commonly trigger false short-sell warnings.
 *
 * Add your own here (record date + ratio from the NSE/BSE announcement).
 * Only actions whose parent was held on the record date inject shares, so
 * unused entries are harmless.
 */
export const DEFAULT_CORPORATE_ACTIONS: CorporateAction[] = [
  // ITC Ltd demerger of ITC Hotels — 1 ITC Hotels share for every 10 ITC held.
  {
    type: "demerger",
    parentSymbol: "ITC",
    newSymbol: "ITCHOTEL",
    recordDate: "2025-01-06",
    ratio: { new: 1, held: 10 },
    label: "ITC Hotels Ltd",
    exchange: "NSE",
  },

  // --- Add more actions below (examples — verify record date & ratio) ---
  // Tata Motors PV entity relabeled TMPV post-demerger:
  // { type: "rename", fromSymbol: "TATAMOTORS", toSymbol: "TMPV" },
  //
  // GAIL bonus issue (fill in the record date & ratio from the announcement):
  // { type: "bonus", symbol: "GAIL", recordDate: "YYYY-MM-DD", ratio: { new: 1, held: 2 } },
  //
  // Adani Enterprises bonus issue:
  // { type: "bonus", symbol: "ADANIENT", recordDate: "YYYY-MM-DD", ratio: { new: 1, held: 1 } },
];

