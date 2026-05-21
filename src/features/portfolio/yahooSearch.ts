import { searchTickerSuggestions } from "../../services/yahooFinanceService";
import type { TickerSuggestion } from "../../types/marketData";

export type { TickerSuggestion } from "../../types/marketData";

export const searchTickers = async (
  query: string,
  signal?: AbortSignal
): Promise<TickerSuggestion[]> => {
  const result = await searchTickerSuggestions(query, signal);
  return result.data ?? [];
};

