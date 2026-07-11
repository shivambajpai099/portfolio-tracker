/**
 * Ticker Image Service
 * Provides URLs for company logos/ticker images.
 * Uses Financial Modeling Prep for US stocks, falls back to null for Indian stocks.
 */

const FMP_BASE = "https://financialmodelingprep.com/image-stock";

/**
 * Returns the image URL for a given ticker symbol, or null if not available.
 * - US stocks: Uses Financial Modeling Prep
 * - Indian stocks (.NS/.BO): Returns null (no reliable free source)
 */
export const getTickerImageUrl = (symbol: string): string | null => {
  if (!symbol) return null;

  const upperSymbol = symbol.toUpperCase();

  // Indian stocks - no reliable free image source
  if (upperSymbol.endsWith(".NS") || upperSymbol.endsWith(".BO")) {
    return null;
  }

  // Clean symbol for US stocks (remove exchange suffixes if any)
  const cleanSymbol = upperSymbol
    .replace(/\.(NASDAQ|NYSE|OQ|N)$/i, "")
    .trim();

  if (!cleanSymbol) return null;

  return `${FMP_BASE}/${cleanSymbol}.png`;
};

/**
 * Checks if a ticker symbol is likely to have an image available.
 */
export const hasTickerImage = (symbol: string): boolean => {
  return getTickerImageUrl(symbol) !== null;
};

