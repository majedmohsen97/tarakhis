import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { q } from './db.js';

// Gate passes are Ed25519-signed tokens. The public key is published at /api/pass/public-key so
// gate devices can verify a pass signature even without network access.

let keys;
function loadKeys() {
  if (keys) return keys;
  const file = path.join(config.dataDir, 'pass-keys.json');
  if (process.env.PASS_PRIVATE_KEY) {
    const privateKey = crypto.createPrivateKey(process.env.PASS_PRIVATE_KEY.replace(/\\n/g, '\n'));
    keys = { privateKey, publicKey: crypto.createPublicKey(privateKey) };
  } else if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const privateKey = crypto.createPrivateKey(saved.privateKey);
    keys = { privateKey, publicKey: crypto.createPublicKey(privateKey) };
  } else {
    const pair = crypto.generateKeyPairSync('ed25519');
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) }), { mode: 0o600 });
    keys = pair;
  }
  return keys;
}

export function publicKeyRaw() {
  // Last 32 bytes of the SPKI DER encoding are the raw Ed25519 key.
  const der = loadKeys().publicKey.export({ type: 'spki', format: 'der' });
  return der.subarray(der.length - 32).toString('base64url');
}

export function createPassToken({ driverId, companyId, vehicleId }) {
  const payload = {
    d: driverId,
    c: companyId,
    v: vehicleId ?? null,
    x: Math.floor(Date.now() / 1000) + config.passTtlMinutes * 60,
    n: crypto.randomBytes(6).toString('base64url'),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(body), loadKeys().privateKey).toString('base64url');
  return { token: `${body}.${sig}`, expiresAt: new Date(payload.x * 1000).toISOString() };
}

/** Returns { ok, payload, reason } — reason is 'INVALID' or 'EXPIRED'. */
export function verifyPassToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return { ok: false, reason: 'INVALID' };
  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(body), loadKeys().publicKey, Buffer.from(sig, 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'INVALID' };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'INVALID' };
  }
  if (!payload.x || payload.x < Date.now() / 1000) return { ok: false, reason: 'EXPIRED', payload };
  return { ok: true, payload };
}

/** 6-digit code a guard can type when the camera can't read the QR. */
export function createShortCode(db, { companyId, driverId, token, expiresAt }) {
  q.run(db, 'DELETE FROM pass_codes WHERE expires_at < ? OR driver_id = ?', new Date().toISOString(), driverId);
  for (let i = 0; i < 20; i++) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const exists = q.get(db, 'SELECT 1 FROM pass_codes WHERE code = ?', code);
    if (!exists) {
      q.run(db, 'INSERT INTO pass_codes (code, company_id, driver_id, token, expires_at) VALUES (?,?,?,?,?)', code, companyId, driverId, token, expiresAt);
      return code;
    }
  }
  throw new Error('Could not allocate a pass code');
}

export function tokenFromShortCode(db, companyId, code) {
  const row = q.get(db, 'SELECT token, expires_at FROM pass_codes WHERE code = ? AND company_id = ?', String(code).trim(), companyId);
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return row.token;
}

/** Accepts a raw token, a full verify URL (…/v/<token>) or a 6-digit code. */
export function extractToken(db, companyId, input) {
  const value = String(input || '').trim();
  if (/^\d{6}$/.test(value)) return tokenFromShortCode(db, companyId, value);
  const m = value.match(/\/v\/([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/);
  return m ? m[1] : value;
}
