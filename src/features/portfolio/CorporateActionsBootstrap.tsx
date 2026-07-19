import { useEffect, useRef } from "react";
import { usePortfolioStore } from "../../store/portfolioStore";
import { fetchStockSplits } from "../../services/corporateActionsService";
import type { Currency } from "../../types/portfolio";

/**
 * Corporate Actions Bootstrap (renderless)
 *
 * Refreshes stock splits for currently-held securities on launch and applies
 * any newly-discovered ones to already-stored data.
 *
 * WHY THIS EXISTS
 * Splits are normally fetched during transaction import. But a split that
 * happens AFTER a position's last transaction (e.g. you bought once, then the
 * stock split months later and you never traded it again) is never captured —
 * nothing re-triggers a fetch. Meanwhile the live market price returned by
 * Yahoo is already split-adjusted, so a pre-split share count valued at a
 * post-split price makes quantity, cost basis and P&L all wrong.
 *
 * This bootstrap closes that gap: it gathers every held symbol (from manual
 * holdings and transactions), fetches their splits, and hands them to
 * `addStockSplits`, which merges them into the persisted registry and re-runs
 * normalization. Idempotency markers ensure already-applied splits are never
 * re-applied, so this is safe to run on every launch.
 */

interface HeldSecurity {
  symbol: string;
  isin?: string;
  currency?: Currency;
}

const collectHeldSecurities = (): HeldSecurity[] => {
  const { holdings, transactions } = usePortfolioStore.getState();
  const bySymbol = new Map<string, HeldSecurity>();

  const add = (symbol: string, isin: string | undefined, currency: Currency | undefined) => {
    const key = symbol.trim().toUpperCase();
    if (!key) return;
    const existing = bySymbol.get(key);
    if (existing) {
      // Backfill ISIN if a later source carries it.
      if (!existing.isin && isin) existing.isin = isin;
      return;
    }
    bySymbol.set(key, { symbol, isin, currency });
  };

  for (const h of holdings) add(h.symbol, h.isin, h.currency);
  for (const t of transactions) add(t.symbol, t.isin, t.currency);

  return [...bySymbol.values()];
};

export function CorporateActionsBootstrap() {
  const hydrated = usePortfolioStore((s) => s.hydrated);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!hydrated || ranRef.current) return;
    ranRef.current = true;

    const controller = new AbortController();

    const run = async () => {
      const securities = collectHeldSecurities();
      if (securities.length === 0) return;

      try {
        const { splits } = await fetchStockSplits(securities, controller.signal);
        if (splits.length === 0) return;
        // addStockSplits is idempotent + re-normalizes existing data, so this
        // retroactively fixes positions affected by post-last-transaction splits.
        usePortfolioStore.getState().addStockSplits(splits);
      } catch {
        // Network/parse failures are non-fatal — stored data is unchanged and
        // the next launch will retry.
      }
    };

    void run();

    return () => controller.abort();
  }, [hydrated]);

  return null;
}

