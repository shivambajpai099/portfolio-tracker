# Portfolio Tracker (Expo)

Simple, local-first portfolio tracking app architecture for Android, iOS, and Web.

## Tech Stack

- Expo + TypeScript
- Expo Router
- Zustand + AsyncStorage persistence
- NativeWind (Tailwind utility classes)

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
    portfolio/
      mockData.ts
      selectors.ts
  store/
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

## Cross-platform targets

```bash
npm run android
npm run ios
npm run web
```

