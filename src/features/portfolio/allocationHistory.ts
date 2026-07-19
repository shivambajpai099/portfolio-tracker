/**
 * Allocation History (transaction-derived)
 *
 * Reconstructs portfolio allocation at any past date directly from transaction
 * history, instead of relying on sporadically-captured allocation snapshots.
 *
 * Why transactions?
 * - Allocation snapshots are only recorded when the user happens to make a
 *   change (add a holding, refresh a price). Baselines for "1 / 3 / 6 months
 *   ago" are therefore frequently missing or captured at arbitrary times.
 * - Transactions carry an explicit `transactionDate`, so we can replay FIFO up
 *   to any cut-off date and know exactly what was held then.
 *
 * Valuation basis:
 * - The app does not persist historical *market* prices, so positions are
 *   valued at **cost basis (invested value)**. This yields a deterministic,
 *   offline "how did my deployed capital allocation shift" signal — isolating
 *   genuine reallocation from mere price movement.
 * - Cash has no dated history (a `CashHolding` only stores a current balance),
 *   so current cash balances are treated as a constant baseline across dates.
 */

import type {
  Account,
  AllocationSnapshot,
  CashHolding,
  Currency,
  FxRates,
  Holding,
} from "../../types/portfolio";
import type { Transaction } from "../../types/transaction";
import { calcSymbolAllocations, convert, holdingCost } from "./calculations";
import { deriveHoldingsFromTransactions } from "./fifoCalculator";

const isIndiaHolding = (holding: Holding): boolean => {
  const symbol = holding.symbol.toUpperCase();
  return holding.currency === "INR" || symbol.endsWith(".NS") || symbol.endsWith(".BO");
};

/**
 * Reconstruct the set of holdings as they stood on (or before) `asOf`.
 *
 * - Transaction-sourced accounts are replayed through FIFO using only the
 *   transactions dated on/before the cut-off.
 * - Manual holdings have no dated history, so they are included unchanged for
 *   every date (a constant approximation for mixed portfolios).
 *
 * Derived holdings come back with `marketPrice === averagePrice`, so valuing
 * them by cost basis is exact.
 */
export const reconstructHoldingsAsOf = (
  manualHoldings: Holding[],
  transactions: Transaction[],
  accounts: Account[],
  asOf: string
): Holding[] => {
  const cutoff = new Date(asOf).getTime();
  const upToDate = Number.isFinite(cutoff)
    ? transactions.filter((tx) => {
        const ts = new Date(tx.transactionDate).getTime();
        return Number.isFinite(ts) && ts <= cutoff;
      })
    : transactions;

  const holdings: Holding[] = [...manualHoldings];

  for (const account of accounts) {
    if (account.dataSource === "transactions") {
      const { holdings: derived } = deriveHoldingsFromTransactions(upToDate, account.id);
      holdings.push(...derived);
    }
  }

  return holdings;
};

/**
 * Build an {@link AllocationSnapshot} for a given point in time, reconstructed
 * from transactions and valued at cost basis (invested value).
 *
 * The return shape matches the snapshot type so the existing Drift UI can
 * consume it without changes.
 */
export const buildAllocationSnapshotAsOf = (
  manualHoldings: Holding[],
  transactions: Transaction[],
  accounts: Account[],
  cashHoldings: CashHolding[],
  fxRates: FxRates,
  reportingCurrency: Currency,
  asOf: string
): AllocationSnapshot => {
  const holdings = reconstructHoldingsAsOf(manualHoldings, transactions, accounts, asOf);

  let indiaValue = 0;
  let usValue = 0;
  for (const holding of holdings) {
    const invested = convert(holdingCost(holding), holding.currency, reportingCurrency, fxRates);
    if (isIndiaHolding(holding)) {
      indiaValue += invested;
    } else {
      usValue += invested;
    }
  }

  const cashValue = cashHoldings.reduce(
    (sum, item) => sum + convert(item.balance, item.currency, reportingCurrency, fxRates),
    0
  );

  const total = indiaValue + usValue + cashValue;

  const topHoldings = calcSymbolAllocations(
    holdings,
    cashHoldings,
    fxRates,
    reportingCurrency,
    "INVESTED_VALUE",
    true
  )
    .sort((a, b) => b.allocationPct - a.allocationPct)
    .slice(0, 10)
    .map((item) => ({
      symbol: item.symbol,
      allocationPct: item.allocationPct,
      currentValue: item.currentValue,
      investedValue: item.investedValue,
      gainLossPct: item.gainLossPct,
    }));

  return {
    date: asOf,
    totalPortfolioValue: total,
    investedValue: total,
    gainLoss: 0,
    indiaAllocationPct: total > 0 ? (indiaValue / total) * 100 : 0,
    usAllocationPct: total > 0 ? (usValue / total) * 100 : 0,
    cashAllocationPct: total > 0 ? (cashValue / total) * 100 : 0,
    topHoldings,
  };
};

export interface DriftPeriodComparison {
  months: number;
  baseline: AllocationSnapshot;
  latest: AllocationSnapshot;
}

/**
 * Produce the "latest" reconstruction (as of now) plus baselines for each of
 * the requested month offsets, all derived from transactions.
 *
 * Returns `null` when there are no transactions to reconstruct from, so callers
 * can fall back to snapshot-based drift (e.g. manual-only portfolios).
 */
export const buildTransactionDriftSeries = (
  manualHoldings: Holding[],
  transactions: Transaction[],
  accounts: Account[],
  cashHoldings: CashHolding[],
  fxRates: FxRates,
  reportingCurrency: Currency,
  monthOffsets: number[] = [1, 3, 6],
  now: Date = new Date()
): { latest: AllocationSnapshot; comparisons: DriftPeriodComparison[] } | null => {
  if (transactions.length === 0) return null;

  const latest = buildAllocationSnapshotAsOf(
    manualHoldings,
    transactions,
    accounts,
    cashHoldings,
    fxRates,
    reportingCurrency,
    now.toISOString()
  );

  // Earliest transaction date bounds how far back a comparison is meaningful.
  const earliestTs = transactions.reduce((min, tx) => {
    const ts = new Date(tx.transactionDate).getTime();
    return Number.isFinite(ts) && ts < min ? ts : min;
  }, Number.POSITIVE_INFINITY);

  const comparisons: DriftPeriodComparison[] = [];
  for (const months of monthOffsets) {
    const baselineDate = new Date(now);
    baselineDate.setMonth(baselineDate.getMonth() - months);

    // Skip periods that predate the very first transaction — there is no
    // portfolio history to compare against yet.
    if (Number.isFinite(earliestTs) && baselineDate.getTime() < earliestTs) {
      continue;
    }

    const baseline = buildAllocationSnapshotAsOf(
      manualHoldings,
      transactions,
      accounts,
      cashHoldings,
      fxRates,
      reportingCurrency,
      baselineDate.toISOString()
    );

    comparisons.push({ months, baseline, latest });
  }

  return { latest, comparisons };
};

