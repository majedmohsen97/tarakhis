import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { q } from './db.js';
import { HttpError, forbidden } from './util.js';

export const ROLES = ['owner', 'manager', 'safety', 'gate', 'driver'];
export const MANAGERS = ['owner', 'manager'];
export const OFFICE = ['owner', 'manager', 'safety'];

export function signToken(user) {
  return jwt.sign({ sub: user.id, cid: user.company_id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtTtl,
    algorithm: 'HS256',
  });
}

/** Loads the current user on every request so deactivation and role changes apply immediately. */
export function authenticate(db) {
  return (req, _res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in required'));
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return next(new HttpError(401, 'UNAUTHENTICATED', 'Session expired, please sign in again'));
    }
    const user = q.get(
      db,
      'SELECT id, company_id, name, phone, role, lang, active, default_vehicle_id, location_consent_at FROM users WHERE id = ?',
      payload.sub,
    );
    if (!user || !user.active || user.company_id !== payload.cid) {
      return next(new HttpError(401, 'UNAUTHENTICATED', 'Account is not active'));
    }
    req.user = user;
    next();
  };
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.flat().includes(req.user?.role)) return next(forbidden());
  next();
};

// ---------- signed URLs for files and printable pages ----------
// Images and PDFs are opened by <Image>/browser tabs that cannot send Authorization headers,
// so list responses include short-lived HMAC-signed URLs instead.

function hmac(value) {
  return crypto.createHmac('sha256', config.jwtSecret).update(value).digest('base64url');
}

export function signPath(pathname, ttlSeconds = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${pathname}?exp=${exp}&sig=${hmac(`${pathname}|${exp}`)}`;
}

export function verifySignedPath(req) {
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig || '');
  if (!exp || !sig || exp < Date.now() / 1000) return false;
  const expected = hmac(`${req.baseUrl}${req.path}|${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
