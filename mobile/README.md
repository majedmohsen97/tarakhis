# Tarakhis mobile app

Expo Router app (Android / iOS / web). See the main [README](../README.md) for setup.

```bash
npm install
npx expo start
```

- Screens live in `src/app/` — `(office)`, `(gate)` and `(driver)` are the role-based tab groups.
- Arabic/English text: `src/lib/i18n.tsx`. Layout direction is handled in-app (`useDir`, `<Row>`, `<Txt>`), so switching language is instant on every platform.
- API base URL: `EXPO_PUBLIC_API_URL`, otherwise the dev machine on port 4000 (`src/lib/api.ts`).
