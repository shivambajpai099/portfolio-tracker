# Portfolio Tracker (Expo)

Simple, local-first portfolio tracking app architecture for Android, iOS, and Web.

## Tech Stack

- Expo + TypeScript
- Expo Router
- Zustand + AsyncStorage persistence
- React Native StyleSheet + shared theme tokens

## Local Persistence

The app uses Zustand `persist` middleware with AsyncStorage to auto-load on startup and auto-save after state mutations for:

- accounts
- holdings
- cash balances
- portfolio settings

## Folder Structure

```text
app/
  _layout.tsx
  (auth)/
    _layout.tsx
    login.tsx
    signup.tsx
  (tabs)/
    _layout.tsx
    index.tsx
    holdings.tsx
    accounts.tsx
    settings.tsx
src/
  components/
    HoldingRow.tsx
    ScreenContainer.tsx
    StatCard.tsx
  features/
    auth/
      authService.ts
      supabaseClient.ts
    portfolio/
      mockData.ts
      selectors.ts
  store/
    authStore.ts
    portfolioStore.ts
  theme/
    colors.ts
  types/
    portfolio.ts
  utils/
    format.ts
```

## Run

```bash
npm install
npm run start
```

## Supabase Auth Setup

Create a `.env` file in the project root:

```bash
EXPO_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
EXPO_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
```

Auth currently supports:

- email/password signup
- email/password login
- logout
- persistent sessions (web + mobile)

Notes:

- `EXPO_PUBLIC_*` variables are required for Expo runtime access.

## Cloud Sync (Snapshot-based)

The app remains **local-first** and keeps using AsyncStorage as the primary source for startup and offline access.

Cloud sync stores each user's portfolio as one flexible JSON blob in Supabase.

### Supabase table

Run SQL from `supabase/portfolio_snapshots.sql`.

Table: `portfolio_snapshots`

- `id`
- `user_id`
- `portfolio_json`
- `created_at`
- `updated_at`

### Sync behavior

- Local AsyncStorage state loads immediately on startup.
- After auth + local hydration, latest cloud snapshot sync runs in background.
- All updates persist locally first through the existing Zustand store.
- Local updates are pushed to Supabase after save (debounced), with automatic retry for transient/offline failures.
- When cloud data is newer, local state is replaced from the cloud snapshot.

## Cross-platform targets

```bash
npm run android
npm run ios
npm run web
```

