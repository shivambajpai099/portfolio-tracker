# Skill: Authentication

## Scope
- `src/features/auth/supabaseClient.ts` — Supabase client init
- `src/features/auth/authService.ts` — auth operation wrappers
- `src/store/authStore.ts` — Zustand auth state
- `src/features/portfolio/PortfolioCloudSyncBootstrap.tsx` — cloud sync lifecycle
- `src/features/portfolio/cloudSyncService.ts` — Supabase snapshot CRUD
- `app/(auth)/login.tsx`, `app/(auth)/signup.tsx` — auth screens
- `app/(tabs)/_layout.tsx` — auth guard
- `app/_layout.tsx` — initialization

---

## Supabase Client Initialization (`supabaseClient.ts`)

```typescript
export const hasSupabaseConfig: boolean  // true only when both env vars are present
```

When `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` is absent, a **no-op stub** is used in place of a real Supabase client. Every call resolves with a safe empty/error response. The app runs fully offline.

**Session storage**:
- Native: `AsyncStorage` (persistent across app restarts).
- Web: in-memory `Map` (session lost on page reload — by design, avoids localStorage token exposure).

---

## Auth Service (`authService.ts`)

All functions return `AuthResult`:
```typescript
interface AuthResult {
  session: AuthSession | null;
  user: AuthUser | null;
  error: string | null;   // human-readable error message, or null on success
}
```

| Function | Description |
|---|---|
| `getInitialSession()` | Called once on boot; returns existing Supabase session |
| `signInWithEmail(email, password)` | `supabase.auth.signInWithPassword` |
| `signUpWithEmail(email, password)` | `supabase.auth.signUp` |
| `signOutSession()` | `supabase.auth.signOut`; returns `string \| null` (error message) |

All functions return `{ session: null, user: null, error: missingConfigMessage }` immediately when `hasSupabaseConfig` is false.

---

## Auth Store (`authStore.ts`)

```typescript
{
  initialized: boolean   // false until initialize() resolves
  loading: boolean
  session: AuthSession | null
  user: AuthUser | null
  error: string | null

  initialize(): Promise<void>    // idempotent — no-op if already initialized
  signIn(email, password): Promise<boolean>   // returns true on success
  signUp(email, password): Promise<boolean>
  signOut(): Promise<boolean>
  clearError(): void
}
```

**Lifecycle in root layout**:
```typescript
// app/_layout.tsx
const initialize = useAuthStore((state) => state.initialize);
useEffect(() => {
  void initialize();
  return () => cleanupAuthStore();  // unsubscribes from onAuthStateChange
}, [initialize]);
```

**Auth state change listener**: `supabase.auth.onAuthStateChange` keeps `session` and `user` in sync across token refresh and cross-tab sign-out. Subscription created once; cleaned up via the exported `cleanupAuthStore()`.

---

## Auth Guard (`(tabs)/_layout.tsx`)

```typescript
const initialized = useAuthStore((state) => state.initialized);
const session     = useAuthStore((state) => state.session);

if (!initialized) return <ActivityIndicator />;     // spinner while loading
if (!session)     return <Redirect href="/(auth)/login" />;
// else render <Tabs>
```

Screens in `(tabs)/` are never rendered without a valid session.

---

## Cloud Sync Bootstrap (`PortfolioCloudSyncBootstrap.tsx`)

A **renderless component** (`return null`) mounted in `app/_layout.tsx`. Orchestrates all Supabase sync without coupling to any individual screen.

### Pull on login
```typescript
useEffect(() => {
  if (!cloudEnabled || !authInitialized || !hydrated || !userId) return;
  if (pullDoneForUserRef.current === userId) return;  // once per login

  pullDoneForUserRef.current = userId;
  (async () => {
    const remote = await fetchLatestSnapshot(userId);
    if (!remote.data) { await flushPush(); return; }  // seed cloud from local
    if (isRemoteNewer(remote.data.snapshotUpdatedAt, local.snapshotUpdatedAt)) {
      portfolioStore.replaceFromSnapshot(remote.data);
    }
  })();
}, [cloudEnabled, authInitialized, hydrated, userId]);
```

### Debounced push on mutation
```typescript
usePortfolioStore.subscribe(() => {
  schedulePush();   // debounced 700 ms
});
```
`schedulePush` is skipped while `applyingRemoteRef.current` is true (prevents push-back during a pull).

### Conflict resolution
Last-write-wins by `snapshotUpdatedAt` ISO timestamp comparison. The device that most recently mutated its local store wins.

---

## Cloud Sync Service (`cloudSyncService.ts`)

```typescript
fetchLatestSnapshot(userId): Promise<CloudSnapshotResult>
// CloudSnapshotResult { data: PortfolioSnapshotData | null, updatedAt: string | null, error: string | null }

pushSnapshot(userId, snapshot): Promise<string | null>
// Returns error message or null on success
// Uses upsert with onConflict: "user_id" — one row per user
```

Supabase table: `portfolio_snapshots`
- `user_id` unique constraint → upsert strategy.
- RLS ensures users can only access their own row.

---

## Auth Screens

### Login (`app/(auth)/login.tsx`)
- Uses `useAuthStore` selectors: `signIn`, `loading`, `error`, `clearError`.
- `canSubmit` guard: `email.trim().length > 0 && password.length >= 6 && !loading`.
- On success: `authStore.session` is set → `(tabs)/_layout.tsx` re-renders → tabs load.

### Signup (`app/(auth)/signup.tsx`)
- Same pattern as login but calls `signUp`.
- After successful signup, navigates to login (Supabase sends confirmation email; session not immediately granted).

---

## Running Without Supabase

1. Omit `.env` or leave `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` empty.
2. `hasSupabaseConfig === false` → all auth service calls return an error message.
3. The app launches directly into `(tabs)/` because `session` remains `null` but — wait — actually without a session `(tabs)/_layout.tsx` redirects to login.
4. In a pure offline scenario, set up a bypass: the auth guard checks `hasSupabaseConfig` before redirecting, or ship with hardcoded seed data only.

> Note: The current codebase always enforces the auth guard regardless of `hasSupabaseConfig`. If you want offline-first without the login screen, add a `hasSupabaseConfig` bypass to `(tabs)/_layout.tsx`.

---

## Adding OAuth or Magic Link

1. Add the provider method to `authService.ts` (mirrors existing pattern).
2. Add the action to `authStore.ts`.
3. Add a UI button to `app/(auth)/login.tsx`.
4. For OAuth deep-link handling: configure `scheme` in `app.json` (already set to `"portfoliotracker"`) and use `expo-linking` to handle the callback URL.

