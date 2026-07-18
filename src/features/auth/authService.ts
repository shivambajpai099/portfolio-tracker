import { Platform, Linking } from "react-native";
import { hasSupabaseConfig, supabase } from "./supabaseClient";

export interface AuthUserMetadata {
  full_name?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  picture?: string | null;
}

export interface AuthUser {
  id: string;
  email?: string | null;
  user_metadata?: AuthUserMetadata | null;
}

export interface AuthSession {
  user: AuthUser | null;
}

export interface AuthResult {
  session: AuthSession | null;
  user: AuthUser | null;
  error: string | null;
}

export interface OAuthResult {
  url: string | null;
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

/**
 * Initiates Google OAuth sign-in flow.
 * On web: redirects to Google OAuth page.
 * On native: opens the OAuth URL in the system browser.
 */
export const signInWithGoogle = async (): Promise<OAuthResult> => {
  if (!hasSupabaseConfig) {
    return { url: null, error: missingConfigMessage };
  }

  // Build redirect URL based on platform
  const redirectTo = Platform.OS === "web"
    ? window.location.origin
    : "portfoliotracker://auth/callback"; // Deep link for native apps

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) {
    return { url: null, error: error.message };
  }

  const url = data?.url ?? null;

  // On native platforms, we need to open the URL manually
  if (url && Platform.OS !== "web") {
    try {
      await Linking.openURL(url);
    } catch (e) {
      return { url: null, error: "Failed to open Google sign-in page" };
    }
  }

  return { url, error: null };
};

