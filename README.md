# Tarakhis · تراخيص

Permits, gate checks, truck trips and weekly invoices for **waste-hauling companies in Saudi Arabia**, in one Arabic-first mobile app (Arabic / English).

| Who | What they get |
|---|---|
| **Owner / Supervisor / HR** | Dashboard, live truck board, weekly schedule, fleet & staff, document review, weekly invoices (VAT 15%) |
| **Safety & security** | Expiry alerts (30-day warning), review queue for uploaded documents, gate log |
| **Gate guard** | Scan the driver's QR (or type a 6-digit code) → big green/red answer with photo, plate and document checklist; today's expected trucks |
| **Driver** | Rotating gate pass (QR), upload own documents, weekly plan, start trip → live location → automatic arrival at the landfill → finish with weight ticket |
| **Landfill guard without the app** | Scanning the QR with any phone camera opens a public verification page (no ID numbers shown) |

## Project layout

```
server/   Node.js API (Express 5 + built-in SQLite), tests, demo seed
mobile/   Expo (React Native) app — runs on Android, iOS and web
```

## Run it locally

Requires Node.js 22.13+ (tested on Node 24).

```bash
cd server
npm install
npm run seed      # creates a demo company (resets the dev database)
npm run dev       # API on http://localhost:4000
```

In a second terminal:

```bash
cd mobile
npm install
npx expo start    # press w for web, or scan the QR with Expo Go on your phone
```

Demo logins (owner, HR, safety, gate, 4 drivers) are listed at the top of `server/scripts/seed.js`.

**On a real phone:** the phone and computer must be on the same Wi-Fi. The app finds the API automatically through the Expo dev server's address. For a deployed API set `EXPO_PUBLIC_API_URL=https://your-api` before `expo start` / `eas build`.

## Tests

```bash
cd server && npm test           # API tests: auth, roles, tenant isolation, gate verdicts, geofence, invoices
cd mobile && npx tsc --noEmit   # type-check
cd mobile && npx expo lint
```

## How the key pieces work

- **Gate pass** — Ed25519-signed token valid for 15 minutes (`PASS_TTL_MIN`), auto-refreshed in the driver app so screenshots go stale. The verdict is computed **at scan time** from live data, so a licence that expired this morning is caught. Public key: `GET /api/pass/public-key` (for future offline verification on gate devices).
- **Gate requirements** (`server/src/compliance.js`): ID/iqama, driving licence, vehicle registration (istimara), insurance, landfill entry permit (company- or truck-level, optionally per site). Expiring within 30 days = allowed with a warning; expired / missing / under review = denied.
- **Arrival** — recorded automatically when the driver's phone enters the site radius (geofence), when the gate scans the pass, or manually.
- **Invoices** — generated from completed, not-yet-invoiced trips in a week (per trip or per ton), editable while draft, numbered `INV-YYYY-0001` on approval, printable bilingual HTML (print → PDF). Money is stored in halalas.
- **Multi-company** — every query is scoped to the signed-in user's company; tests cover cross-company access.

## Free pilot: run it on your own computer

No hosting bill and no account needed. The server runs on a Windows PC and gets a public HTTPS link from Cloudflare.

1. Install once: Node.js 22.13+ and `winget install --id Cloudflare.cloudflared -e`.
2. Double-click **`start-pilot.cmd`**. The first run asks for the pilot invite code, then prints the link, copies it, and opens it.
3. Phones: open the link in the browser, **or** in the Android app tap *Change* (server) → *Scan connect code* and scan the QR from **More → Connect mobile app**.

- Keep the PC awake while the pilot is running; press Enter in the window to stop.
- The link changes each time you start it (the app's server setting handles this, so no rebuild is needed).
- Pilot data and settings live in `server/pilot-data/` (git-ignored); daily backups are in `server/pilot-data/backups/`. Copy that folder somewhere safe regularly.
- `start-pilot.cmd -Demo` runs the demo company instead; `start-pilot.cmd -Background` + `stop-pilot.cmd` run it without keeping a window open.

## Paid / always-on hosting (Docker, e.g. Render)

`render.yaml` deploys this repository on Render (needs the paid Starter instance for the persistent disk). One container serves the API, the web app (installable on phones via "Add to Home Screen") and the public gate-pass page.

```bash
docker build -t tarakhis .
docker run -d -p 4000:4000 -v tarakhis-data:/data \
  -e JWT_SECRET=<long random string> \
  -e PUBLIC_URL=https://your-domain \
  -e REGISTRATION_CODE=<invite code you give the pilot company> \
  tarakhis
```

- **HTTPS is required** — phones only allow the camera (QR scanning) and location on HTTPS pages. Put the container behind a TLS proxy or use a host that provides HTTPS.
- **Persistent volume** — `/data` holds the database, uploaded documents, the pass-signing key and daily backups (`/data/backups`, last 14 days). Copy backups off the server too.
- **Where to host** — demo data: any Docker host (Render, Railway, Fly.io…). Real driver data: prefer a Saudi region (PDPL).
- Without Docker (a VPS with Node 24): `cd mobile && npm ci && npx expo export -p web`, then `cd server && npm ci --omit=dev && NODE_ENV=production JWT_SECRET=… node src/index.js` (e.g. under pm2 or systemd).

### Android app (APK for drivers)

Background location (keeps sharing while the app is closed) needs the installed app, not the web version.

1. `cd mobile && npx eas-cli@latest login` (free Expo account).
2. `npx eas-cli@latest build -p android --profile preview` → EAS prints a link to download the APK; send it to drivers.
3. On first launch the app asks for the server: scan the QR from **More → Connect mobile app**. (For a fixed server you can instead bake it in with `EXPO_PUBLIC_API_URL` in `eas.json`.)

iPhone: needs an Apple Developer account for TestFlight. Until then iPhone users can use the web link (no background location on the web).

Regenerate icons after changing the design: `cd mobile && node scripts/make-icons.mjs`.

## Before going to production

- [ ] Host in Saudi Arabia and review PDPL obligations (driver IDs, locations and photos are personal data). Drivers already give explicit consent before location sharing (and can withdraw it); add a privacy policy page.
- [ ] Move SQLite → PostgreSQL and uploads → object storage (S3-compatible) once you have more than a few companies.
- [ ] **ZATCA (Fatoora) Phase 2 e-invoicing** — the current invoice is a printable tax-invoice layout only, not a ZATCA-cleared e-invoice (needs UBL XML, cryptographic stamp, QR and Fatoora API integration).
- [ ] Push notifications for expiring documents (`expo-notifications`) and WhatsApp Business messages (weekly plan, reminders).
- [ ] Play Store / App Store release (`--profile production`), including the background-location declaration Google Play requires.
