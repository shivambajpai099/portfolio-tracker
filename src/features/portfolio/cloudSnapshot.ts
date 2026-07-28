import type {
  Account,
  AllocationSnapshot,
  CashHolding,
  FxRates,
  Holding,
  PortfolioSettings,
  TrimSymbolState,
} from "../../types/portfolio";
import type { Transaction } from "../../types/transaction";

export interface PortfolioSnapshotData {
  accounts: Account[];
  holdings: Holding[];
  cashHoldings: CashHolding[];
  transactions?: Transaction[];
  allocationSnapshots: AllocationSnapshot[];
  settings: PortfolioSettings;
  trimBySymbol?: Record<string, TrimSymbolState>;
  fxRates: FxRates;
  snapshotUpdatedAt: string;
}

export interface PortfolioSnapshotPayload {
  schemaVersion: number;
  snapshotUpdatedAt: string;
  portfolio: PortfolioSnapshotData;
}

export const SNAPSHOT_SCHEMA_VERSION = 2;

export const makeSnapshotPayload = (data: PortfolioSnapshotData): PortfolioSnapshotPayload => ({
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  snapshotUpdatedAt: data.snapshotUpdatedAt,
  portfolio: data,
});

export const parseSnapshotPayload = (input: unknown): PortfolioSnapshotData | null => {
  if (!input || typeof input !== "object") {
    return null;
  }

  const payload = input as Partial<PortfolioSnapshotPayload>;
  const portfolio = payload.portfolio;

  if (!portfolio || typeof portfolio !== "object") {
    return null;
  }

  const p = portfolio as Partial<PortfolioSnapshotData>;

  if (!Array.isArray(p.accounts) || !Array.isArray(p.holdings) || !Array.isArray(p.cashHoldings)) {
    return null;
  }

  if (!p.settings || !p.fxRates || typeof p.snapshotUpdatedAt !== "string") {
    return null;
  }

  return {
    accounts: p.accounts,
    holdings: p.holdings,
    cashHoldings: p.cashHoldings,
    transactions: Array.isArray(p.transactions) ? p.transactions : [],
    allocationSnapshots: Array.isArray((p as Partial<PortfolioSnapshotData>).allocationSnapshots)
      ? ((p as Partial<PortfolioSnapshotData>).allocationSnapshots as AllocationSnapshot[]).map((snapshot) => ({
          ...snapshot,
          topHoldings: Array.isArray(snapshot.topHoldings)
            ? snapshot.topHoldings.map((holding) => ({
                ...holding,
                currentValue: typeof holding.currentValue === "number" ? holding.currentValue : 0,
                investedValue: typeof holding.investedValue === "number" ? holding.investedValue : 0,
                gainLossPct: typeof holding.gainLossPct === "number" ? holding.gainLossPct : 0,
              }))
            : [],
          investedValue:
            typeof snapshot.investedValue === "number" ? snapshot.investedValue : snapshot.totalPortfolioValue,
          gainLoss:
            typeof snapshot.gainLoss === "number"
              ? snapshot.gainLoss
              : snapshot.totalPortfolioValue -
                (typeof snapshot.investedValue === "number" ? snapshot.investedValue : snapshot.totalPortfolioValue),
        }))
      : [],
    settings: p.settings,
    trimBySymbol:
      p.trimBySymbol && typeof p.trimBySymbol === "object"
        ? Object.entries(p.trimBySymbol as Record<string, TrimSymbolState>).reduce<Record<string, TrimSymbolState>>(
            (acc, [symbol, entry]) => {
              const history = Array.isArray(entry?.history)
                ? entry.history.filter(
                    (event) =>
                      Boolean(event) &&
                      typeof event.date === "string" &&
                      typeof event.price === "number" &&
                      typeof event.sharesTrimmed === "number"
                  )
                : [];
              acc[symbol] = {
                lastTrimPrice: typeof entry?.lastTrimPrice === "number" ? entry.lastTrimPrice : null,
                history,
              };
              return acc;
            },
            {}
          )
        : {},
    fxRates: p.fxRates,
    snapshotUpdatedAt: p.snapshotUpdatedAt,
  } as PortfolioSnapshotData;
};
