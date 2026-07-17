import type { Currency } from "../types/portfolio";

export const formatMoney = (value: number, currency: Currency): string => {
  const locale = currency === "INR" ? "en-IN" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Formats INR values in compact Indian numbering notation.
 * 
 * - < 1,000: full value (e.g., "₹850.00")
 * - >= 1,000 and < 1,00,000: thousands with "k" (e.g., "₹99.18k")
 * - >= 1,00,000 and < 1,00,00,000: lakhs with "L" (e.g., "₹2.63L")
 * - >= 1,00,00,000: crores with "Cr" (e.g., "₹1.25Cr")
 * 
 * For non-INR currencies, falls back to standard compact notation (K, M, B).
 */
export const formatCompact = (value: number, currency: Currency): string => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const symbol = currency === "INR" ? "₹" : "$";

  if (currency === "INR") {
    // Indian numbering: thousand, lakh (1,00,000), crore (1,00,00,000)
    if (absValue >= 10000000) {
      // Crore tier: >= 1,00,00,000
      return `${sign}${symbol}${(absValue / 10000000).toFixed(2)}Cr`;
    }
    if (absValue >= 100000) {
      // Lakh tier: >= 1,00,000
      return `${sign}${symbol}${(absValue / 100000).toFixed(2)}L`;
    }
    if (absValue >= 1000) {
      // Thousand tier: >= 1,000
      return `${sign}${symbol}${(absValue / 1000).toFixed(2)}k`;
    }
    // Full value: < 1,000
    return `${sign}${symbol}${absValue.toFixed(2)}`;
  }

  // USD and other currencies: K (thousand), M (million), B (billion)
  if (absValue >= 1000000000) {
    return `${sign}${symbol}${(absValue / 1000000000).toFixed(2)}B`;
  }
  if (absValue >= 1000000) {
    return `${sign}${symbol}${(absValue / 1000000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `${sign}${symbol}${(absValue / 1000).toFixed(2)}K`;
  }
  return `${sign}${symbol}${absValue.toFixed(2)}`;
};

/**
 * Formats a gain/loss value with +/- sign and compact notation.
 */
export const formatCompactGainLoss = (value: number, currency: Currency): string => {
  const formatted = formatCompact(Math.abs(value), currency);
  return value >= 0 ? `+${formatted}` : `-${formatted.replace(/^-/, "")}`;
};

