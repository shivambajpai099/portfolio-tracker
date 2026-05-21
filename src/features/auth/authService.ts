import { hasSupabaseConfig, supabase } from "./supabaseClient";

export interface AuthUser {
  id: string;
  email?: string | null;
}

export interface AuthSession {
  user: AuthUser | null;
}

export interface AuthResult {
  session: AuthSession | null;
  user: AuthUser | null;
  error: string | null;
}

const missingConfigMessage =
  "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

export const getInitialSession = async (): Promise<AuthResult> => {
  if (!hasSupabaseConfig) {
    return { session: null, user: null, error: missingConfigMessage };
  }

  const { data, error } = await supabase.auth.getSession();
  return {
    session: data.session,
    user: data.session?.user ?? null,
    error: error?.message ?? null,
  };
};

export const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
  if (!hasSupabaseConfig) {
    return { session: null, user: null, error: missingConfigMessage };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return {
    session: data.session,
    user: data.user ?? null,
    error: error?.message ?? null,
  };
};

export const signUpWithEmail = async (email: string, password: string): Promise<AuthResult> => {
  if (!hasSupabaseConfig) {
    return { session: null, user: null, error: missingConfigMessage };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  return {
    session: data.session,
    user: data.user ?? null,
    error: error?.message ?? null,
  };
};

export const signOutSession = async (): Promise<string | null> => {
  if (!hasSupabaseConfig) {
    return missingConfigMessage;
  }

  const { error } = await supabase.auth.signOut();
  return error?.message ?? null;
};

