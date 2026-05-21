import type { Currency, ExposureBySymbol, FxRates, Holding } from "../../types/portfolio";
import { holdingMarketValue, toINR, toUSD } from "./calculations";

// Re-export from calculations so callers can import from either location.
export { holdingMarketValue, toINR, toUSD } from "./calculations";

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

