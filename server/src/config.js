import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader so the server runs without extra dependencies.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^['"]|['"]$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnvFile(path.join(ROOT, '.env'));

const isProd = process.env.NODE_ENV === 'production';
const dataDir = path.resolve(ROOT, process.env.DATA_DIR || 'data');

function devSecret() {
  // Persist a random dev secret so tokens survive restarts during development.
  const file = path.join(dataDir, 'dev-secret.txt');
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'));
  return fs.readFileSync(file, 'utf8').trim();
}

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  root: ROOT,
  isProd,
  port: Number(process.env.PORT || 4000),
  dataDir,
  dbFile: process.env.DB_FILE || path.join(dataDir, 'tarakhis.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  jwtSecret: process.env.JWT_SECRET || devSecret(),
  jwtTtl: process.env.JWT_TTL || '7d',
  // Public base URL printed inside gate-pass QR codes (e.g. https://api.tarakhis.sa).
  // Render sets RENDER_EXTERNAL_URL automatically (https://<service>.onrender.com).
  publicUrl: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  timeZone: process.env.APP_TZ || 'Asia/Riyadh',
  passTtlMinutes: Number(process.env.PASS_TTL_MIN || 15),
  expiringSoonDays: Number(process.env.EXPIRING_SOON_DAYS || 30),
  vatRate: Number(process.env.VAT_RATE || 0.15),
  currency: process.env.CURRENCY || 'SAR',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  // When set, new companies can only register with this invite code (recommended for pilots).
  registrationCode: process.env.REGISTRATION_CODE || '',
  // Built web app (npx expo export -p web) served at "/" so one URL hosts both the app and the API.
  webDist: path.resolve(ROOT, process.env.WEB_DIST || '../mobile/dist'),
  backupDays: Number(process.env.BACKUP_KEEP_DAYS || 14),
};
