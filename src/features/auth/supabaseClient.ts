import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

interface AuthSubscription {
  unsubscribe: () => void;
}

interface QueryResult<T> {
  data: T;
  error: { message: string } | null;
}

interface SupabaseTableQuery {
  select: (_columns: string) => SupabaseTableQuery;
  eq: (_column: string, _value: string) => SupabaseTableQuery;
  maybeSingle: <T>() => Promise<QueryResult<T | null>>;
  upsert: (_values: unknown, _options?: { onConflict?: string }) => Promise<QueryResult<null>>;
}

interface SupabaseLikeClient {
  auth: {
    getSession: () => Promise<{ data: { session: { user: { id: string; email?: string | null } | null } | null }; error: { message: string } | null }>;
    signInWithPassword: (input: { email: string; password: string }) => Promise<{ data: { session: { user: { id: string; email?: string | null } | null } | null; user: { id: string; email?: string | null } | null }; error: { message: string } | null }>;
    signUp: (input: { email: string; password: string }) => Promise<{ data: { session: { user: { id: string; email?: string | null } | null } | null; user: { id: string; email?: string | null } | null }; error: { message: string } | null }>;
    signInWithOAuth: (input: { provider: string; options?: { redirectTo?: string } }) => Promise<{ data: { url?: string | null; provider?: string } | null; error: { message: string } | null }>;
    signOut: () => Promise<{ error: { message: string } | null }>;
    onAuthStateChange: (callback: (event: unknown, session: { user: { id: string; email?: string | null } | null } | null) => void) => { data: { subscription: AuthSubscription } };
  };
  from: (_table: string) => SupabaseTableQuery;
}

type CreateClientFn = (url: string, anonKey: string, options: unknown) => SupabaseLikeClient;

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
const rawAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

export const hasSupabaseConfig = rawUrl.length > 0 && rawAnonKey.length > 0;

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: async (key: string) => {
      map.delete(key);
    },
  };
};

const webStorage = () => ({
  getItem: async (key: string) => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Ignore storage write failures and allow in-memory session fallback.
    }
  },
  removeItem: async (key: string) => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Ignore storage removal failures.
    }
  },
});

const authStorage = Platform.OS === "web" ? webStorage() : AsyncStorage ?? memoryStorage();

const url = hasSupabaseConfig ? rawUrl : "https://placeholder.supabase.co";
const anonKey = hasSupabaseConfig ? rawAnonKey : "placeholder-anon-key";

const noopError = { message: "Supabase client is unavailable. Install @supabase/supabase-js and restart." };

const createNoopClient = (): SupabaseLikeClient => ({
  from: () => {
    const query: SupabaseTableQuery = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: null, error: noopError }),
      upsert: async () => ({ data: null, error: noopError }),
    };
    return query;
  },
  auth: {
    getSession: async () => ({ data: { session: null }, error: noopError }),
    signInWithPassword: async () => ({ data: { session: null, user: null }, error: noopError }),
    signUp: async () => ({ data: { session: null, user: null }, error: noopError }),
    signInWithOAuth: async () => ({ data: null, error: noopError }),
    signOut: async () => ({ error: noopError }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
  },
});

let createClientImpl: CreateClientFn | null = null;
try {
  const mod = require("@supabase/supabase-js") as { createClient?: CreateClientFn };
  if (typeof mod.createClient === "function") {
    createClientImpl = mod.createClient;
  }
} catch {
  createClientImpl = null;
}

export const supabase: SupabaseLikeClient = (createClientImpl
  ? createClientImpl(url, anonKey, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: Platform.OS === "web",
      },
    })
  : createNoopClient());


