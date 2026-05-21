import { create } from "zustand";
import {
  type AuthSession,
  type AuthUser,
  getInitialSession,
  signInWithEmail,
  signOutSession,
  signUpWithEmail,
} from "../features/auth/authService";
import { supabase } from "../features/auth/supabaseClient";

interface AuthState {
  initialized: boolean;
  loading: boolean;
  session: AuthSession | null;
  user: AuthUser | null;
  error: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  clearError: () => void;
}

let authSubscriptionCleanup: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  initialized: false,
  loading: false,
  session: null,
  user: null,
  error: null,

  initialize: async () => {
    if (get().initialized) {
      return;
    }

    set({ loading: true, error: null });

    const initial = await getInitialSession();
    set({
      initialized: true,
      loading: false,
      session: initial.session,
      user: initial.user,
      error: initial.error,
    });

    if (!authSubscriptionCleanup) {
      const { data } = supabase.auth.onAuthStateChange((_event: unknown, nextSession: AuthSession | null) => {
        set({
          session: nextSession,
          user: nextSession?.user ?? null,
          error: null,
        });
      });
      authSubscriptionCleanup = () => {
        data.subscription.unsubscribe();
      };
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null });
    const result = await signInWithEmail(email, password);
    set({
      loading: false,
      error: result.error,
      session: result.session,
      user: result.user,
    });
    return !result.error;
  },

  signUp: async (email: string, password: string) => {
    set({ loading: true, error: null });
    const result = await signUpWithEmail(email, password);
    set({
      loading: false,
      error: result.error,
      session: result.session,
      user: result.user,
    });
    return !result.error;
  },

  signOut: async () => {
    set({ loading: true, error: null });
    const error = await signOutSession();
    if (error) {
      set({ loading: false, error });
      return false;
    }

    set({ loading: false, error: null, session: null, user: null });
    return true;
  },

  clearError: () => set({ error: null }),
}));

export const cleanupAuthStore = () => {
  authSubscriptionCleanup?.();
  authSubscriptionCleanup = null;
};

