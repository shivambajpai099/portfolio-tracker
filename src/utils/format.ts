import type { Currency } from "../types/portfolio";

/**
 * Formats a number with proper decimal precision.
 * - Shows 2 decimal places only when meaningful
 * - Omits trailing .00
 */
const formatDecimals = (value: number, forceDecimals = false): string => {
  if (forceDecimals || value % 1 !== 0) {
    // Has decimal component - show 2 decimal places
    const formatted = value.toFixed(2);
    // Remove trailing zeros after decimal only if it's .00
    return formatted.endsWith(".00") && !forceDecimals 
      ? formatted.slice(0, -3) 
      : formatted;
  }
  // Whole number - no decimals needed
  return value.toFixed(0);
};

/**
 * Formats currency values with full precision and proper locale grouping.
 * Uses Indian digit grouping (lakhs/crores) for INR.
 * 
 * Examples:
 * - ₹20,84,088.51
 * - ₹16,85,560
 * - $1,234.56
 * 
 * Use for: Headline metrics, expanded panels, tooltips
 */
export const formatMoney = (value: number, currency: Currency): string => {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  
  // Check if we need decimals
  const hasDecimals = value % 1 !== 0;
  
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Formats currency values in compact notation for space-constrained contexts.
 * Uses Indian numbering (k, L, Cr) for INR and Western (K, M, B) for USD.
 * 
 * Examples:
 * - ₹2.03L
 * - ₹99.18k
 * - $1.25M
 * 
 * Use for: Holdings list, chart axes, summary rows
 */
export const formatCompact = (value: number, currency: Currency): string => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const symbol = currency === "INR" ? "₹" : "$";

  if (currency === "INR") {
    // Indian numbering: thousand, lakh (1,00,000), crore (1,00,00,000)
    if (absValue >= 10000000) {
      // Crore tier: >= 1,00,00,000
      const num = absValue / 10000000;
      return `${sign}${symbol}${formatDecimals(num)}Cr`;
    }
    if (absValue >= 100000) {
      // Lakh tier: >= 1,00,000
      const num = absValue / 100000;
      return `${sign}${symbol}${formatDecimals(num)}L`;
    }
    if (absValue >= 1000) {
      // Thousand tier: >= 1,000
      const num = absValue / 1000;
      return `${sign}${symbol}${formatDecimals(num)}k`;
    }
    // Full value: < 1,000
    return `${sign}${symbol}${formatDecimals(absValue)}`;
  }

  // USD and other currencies: K (thousand), M (million), B (billion)
  if (absValue >= 1000000000) {
    const num = absValue / 1000000000;
    return `${sign}${symbol}${formatDecimals(num)}B`;
  }
  if (absValue >= 1000000) {
    const num = absValue / 1000000;
    return `${sign}${symbol}${formatDecimals(num)}M`;
  }
  if (absValue >= 1000) {
    const num = absValue / 1000;
    return `${sign}${symbol}${formatDecimals(num)}K`;
  }
  return `${sign}${symbol}${formatDecimals(absValue)}`;
};

/**
 * Formats compact values for chart axes - more aggressive rounding.
 * Omits decimals entirely for cleaner axis labels.
 * 
 * Examples:
 * - ₹50k
 * - ₹1L
 * - ₹5L
 * 
 * Use for: Y-axis labels only
 */
export const formatCompactAxis = (value: number, currency: Currency): string => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const symbol = currency === "INR" ? "₹" : "$";

  if (currency === "INR") {
    if (absValue >= 10000000) {
      const num = absValue / 10000000;
      return `${sign}${symbol}${num >= 10 ? Math.round(num) : num.toFixed(1).replace(/\.0$/, "")}Cr`;
    }
    if (absValue >= 100000) {
      const num = absValue / 100000;
      return `${sign}${symbol}${num >= 10 ? Math.round(num) : num.toFixed(1).replace(/\.0$/, "")}L`;
    }
    if (absValue >= 1000) {
      const num = absValue / 1000;
      return `${sign}${symbol}${num >= 10 ? Math.round(num) : num.toFixed(1).replace(/\.0$/, "")}k`;
    }
    return `${sign}${symbol}${Math.round(absValue)}`;
  }

  // USD
  if (absValue >= 1000000000) {
    const num = absValue / 1000000000;
    return `${sign}${symbol}${num >= 10 ? Math.round(num) : num.toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (absValue >= 1000000) {
    const num = absValue / 1000000;
    return `${sign}${symbol}${num >= 10 ? Math.round(num) : num.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (absValue >= 1000) {
    const num = absValue / 1000;
    return `${sign}${symbol}${num >= 10 ? Math.round(num) : num.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return `${sign}${symbol}${Math.round(absValue)}`;
};

/**
 * Formats a gain/loss value with +/- sign and compact notation.
 * 
 * Examples:
 * - +₹2.03L
 * - -$500
 */
export const formatCompactGainLoss = (value: number, currency: Currency): string => {
  const formatted = formatCompact(Math.abs(value), currency);
  return value >= 0 ? `+${formatted}` : `-${formatted.replace(/^-/, "")}`;
};

/**
 * Formats a gain/loss value with +/- sign and full formatting.
 * 
 * Examples:
 * - +₹2,03,021.74
 * - -$500.00
 */
export const formatMoneyGainLoss = (value: number, currency: Currency): string => {
  const formatted = formatMoney(Math.abs(value), currency);
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
};

/**
 * Formats a number with proper grouping (no currency symbol).
 * Uses Indian digit grouping for INR context.
 * 
 * Examples:
 * - 20,84,088.51 (INR context)
 * - 1,234.56 (USD context)
 */
export const formatNumber = (value: number, currency: Currency = "USD"): string => {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const hasDecimals = value % 1 !== 0;
  
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
};
