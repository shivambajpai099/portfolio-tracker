import { supabase } from "../auth/supabaseClient";
import {
  makeSnapshotPayload,
  parseSnapshotPayload,
  type PortfolioSnapshotData,
} from "./cloudSnapshot";

const TABLE = "portfolio_snapshots";

interface SnapshotRow {
  id: string;
  user_id: string;
  portfolio_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface CloudSnapshotResult {
  data: PortfolioSnapshotData | null;
  updatedAt: string | null;
  error: string | null;
}

export const fetchLatestSnapshot = async (userId: string): Promise<CloudSnapshotResult> => {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, user_id, portfolio_json, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle<SnapshotRow>();

  if (error) {
    return { data: null, updatedAt: null, error: error.message };
  }

  if (!data) {
    return { data: null, updatedAt: null, error: null };
  }

  const parsed = parseSnapshotPayload(data.portfolio_json);
  if (!parsed) {
    return { data: null, updatedAt: data.updated_at, error: "Invalid cloud snapshot format." };
  }

  return { data: parsed, updatedAt: data.updated_at, error: null };
};

export const pushSnapshot = async (userId: string, snapshot: PortfolioSnapshotData): Promise<string | null> => {
  const payload = makeSnapshotPayload(snapshot);

  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      portfolio_json: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return error?.message ?? null;
};

