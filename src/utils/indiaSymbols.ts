import type { Currency } from "../types/portfolio";

/**
 * Indian ticker alias / rename map.
 *
 * Price/quote lookups (Yahoo Finance, NSE) key off the exact NSE ticker symbol
 * (e.g. `SONATSOFTW.NS`) — NOT the company's display name. A handful of Indian
 * securities are commonly stored (via broker exports or manual entry) under a
 * name/abbreviation, or under an OLD ticker after an NSE symbol rename, so their
 * price fetch returns nothing.
 *
 * This map normalizes those known mismatches to the correct *current* NSE
 * ticker. Keys are the (upper-cased, suffix-stripped) symbol as it might be
 * stored; values are the correct bare NSE ticker.
 *
 * Extend this as new mismatches / renames are discovered. Verify each mapping
 * against the security's ISIN before adding it.
 */
export const INDIA_SYMBOL_ALIASES: Record<string, string> = {
  // Sonata Software — NSE ticker is SONATSOFTW (not the long/short forms).
  SONATASOFTWARE: "SONATSOFTW",
  SONATASOFT: "SONATSOFTW",
  SONATA: "SONATSOFTW",
  // NSE symbol rename: NIIT Technologies -> Coforge.
  NIITTECH: "COFORGE",
  // NSE symbol rename: Cadila Healthcare -> Zydus Lifesciences.
  CADILAHC: "ZYDUSLIFE",
};

const EXCHANGE_SUFFIX = /^(.*)\.(NS|BO)$/i;

/**
 * Apply a known Indian-ticker alias. Preserves an existing exchange suffix
 * (`.NS`/`.BO`); returns the symbol upper-cased and trimmed when no alias
 * applies.
 */
export const applyIndiaAlias = (symbol: string): string => {
  const raw = symbol.trim().toUpperCase();
  const match = raw.match(EXCHANGE_SUFFIX);
  const bare = match ? match[1] : raw;
  const corrected = INDIA_SYMBOL_ALIASES[bare];
  if (!corrected) return raw;
  return match ? `${corrected}.${match[2].toUpperCase()}` : corrected;
};

/**
 * Build the exact symbols to request a live quote for.
 *
 * For INR securities we return ONLY the exchange-suffixed variants (`.NS`/`.BO`)
 * — never the bare symbol, which collides with a same-ticker US listing — and
 * we apply the alias map so renamed/mismatched tickers resolve. Non-INR symbols
 * are returned as-is.
 */
export const buildIndiaQuoteCandidates = (symbol: string, currency: Currency): string[] => {
  const raw = symbol.trim().toUpperCase();
  const hasSuffix = /\.(NS|BO)$/i.test(raw);

  if (currency === "INR") {
    if (hasSuffix) {
      return [applyIndiaAlias(raw)];
    }
    const bare = applyIndiaAlias(raw);
    return [`${bare}.NS`, `${bare}.BO`];
  }

  return [raw];
};

