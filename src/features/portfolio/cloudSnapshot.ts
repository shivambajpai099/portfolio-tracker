import type {
  Account,
  CashHolding,
  FxRates,
  Holding,
  PortfolioSettings,
} from "../../types/portfolio";

export interface PortfolioSnapshotData {
  accounts: Account[];
  holdings: Holding[];
  cashHoldings: CashHolding[];
  settings: PortfolioSettings;
  fxRates: FxRates;
  snapshotUpdatedAt: string;
}

export interface PortfolioSnapshotPayload {
  schemaVersion: number;
  snapshotUpdatedAt: string;
  portfolio: PortfolioSnapshotData;
}

export const SNAPSHOT_SCHEMA_VERSION = 1;

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
    settings: p.settings,
    fxRates: p.fxRates,
    snapshotUpdatedAt: p.snapshotUpdatedAt,
  } as PortfolioSnapshotData;
};

