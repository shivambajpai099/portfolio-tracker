/**
 * Finance utilities — money-weighted and time-weighted return math.
 *
 * Pure, dependency-free helpers. Kept out of UI components so they can be
 * unit-tested and reused.
 */

export interface Cashflow {
  /** Date the cashflow occurred. */
  date: Date;
  /** Signed amount: money OUT (buys) is negative, money IN (sells / current value) is positive. */
  amount: number;
}

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

/**
 * Money-weighted rate of return (XIRR) via Newton–Raphson.
 *
 * Cashflow convention: buys are negative (money out), sells and the terminal
 * portfolio value are positive (money in). Returns the annualised rate as a
 * decimal (e.g. 0.184 = +18.4%), or `NaN` when it can't be resolved.
 */
export function computeXIRR(
  cashflows: Cashflow[],
  guess = 0.1,
  maxIter = 100,
  tol = 1e-6
): number {
  if (cashflows.length < 2) return NaN;

  // Must have at least one inflow and one outflow, otherwise no root exists.
  const hasPositive = cashflows.some((c) => c.amount > 0);
  const hasNegative = cashflows.some((c) => c.amount < 0);
  if (!hasPositive || !hasNegative) return NaN;

  const sorted = [...cashflows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();

  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    let f = 0;
    let df = 0;
    for (const { date, amount } of sorted) {
      const t = (date.getTime() - t0) / MS_PER_YEAR;
      const v = Math.pow(1 + rate, -t);
      f += amount * v;
      df -= (t * amount * v) / (1 + rate);
    }
    if (df === 0) break;
    const newRate = rate - f / df;
    if (!Number.isFinite(newRate)) break;
    if (Math.abs(newRate - rate) < tol) return newRate;
    rate = newRate;
  }

  return Number.isFinite(rate) ? rate : NaN;
}

/**
 * Compound annual growth rate (CAGR).
 *
 * Returns the annualised rate as a decimal (e.g. 0.142 = +14.2%), or `NaN`
 * when inputs are non-positive or the elapsed time is zero.
 */
export function computeCAGR(
  totalInvested: number,
  totalCurrent: number,
  firstDate: Date,
  now: Date = new Date()
): number {
  if (totalInvested <= 0 || totalCurrent <= 0) return NaN;
  const years = (now.getTime() - firstDate.getTime()) / MS_PER_YEAR;
  if (years <= 0) return NaN;
  return Math.pow(totalCurrent / totalInvested, 1 / years) - 1;
}

