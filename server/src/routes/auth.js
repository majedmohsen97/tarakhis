import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { q, tx } from '../db.js';
import { config } from '../config.js';
import { authenticate, signToken } from '../auth.js';
import { HttpError, str, normalizePhone, oneOf, badRequest } from '../util.js';
import { serializeUser } from './users.js';

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export default function authRoutes(db) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

  // Creates a new hauling company and its owner account.
  r.post('/register', limiter, (req, res) => {
    if (config.registrationCode && String(req.body.invite_code || '').trim() !== config.registrationCode) {
      throw new HttpError(403, 'INVITE_CODE_INVALID', 'A valid invite code is required to register');
    }
    const companyName = str(req.body.company_name, 'company_name', { required: true, max: 120 });
    const name = str(req.body.name, 'name', { required: true, max: 80 });
    const phone = normalizePhone(req.body.phone);
    const password = str(req.body.password, 'password', { required: true, min: 8, max: 100 });
    if (q.get(db, 'SELECT 1 FROM users WHERE phone = ?', phone)) throw new HttpError(409, 'PHONE_TAKEN', 'This phone number is already registered');
    const lang = oneOf(req.body.lang, 'lang', ['ar', 'en']) || 'ar';

    const user = tx(db, () => {
      const c = q.run(
        db,
        'INSERT INTO companies (name, cr_number, vat_number, city) VALUES (?,?,?,?)',
        companyName, str(req.body.cr_number, 'cr_number', { max: 20 }), str(req.body.vat_number, 'vat_number', { max: 20 }), str(req.body.city, 'city', { max: 60 }),
      );
      const u = q.run(
        db,
        'INSERT INTO users (company_id, name, phone, password_hash, role, lang) VALUES (?,?,?,?,?,?)',
        c.lastInsertRowid, name, phone, bcrypt.hashSync(password, 10), 'owner', lang,
      );
      return q.get(db, 'SELECT * FROM users WHERE id = ?', u.lastInsertRowid);
    });
    res.status(201).json({ token: signToken(user), user: serializeUser(user) });
  });

  r.post('/login', limiter, (req, res) => {
    let phone;
    try {
      phone = normalizePhone(req.body.phone);
    } catch {
      throw new HttpError(401, 'BAD_CREDENTIALS', 'Wrong phone number or password');
    }
    const password = String(req.body.password || '');
    const user = q.get(db, 'SELECT * FROM users WHERE phone = ?', phone);
    // Compare against a dummy hash for unknown phones so response time doesn't reveal registered numbers.
    const passwordOk = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !passwordOk) {
      throw new HttpError(401, 'BAD_CREDENTIALS', 'Wrong phone number or password');
    }
    if (!user.active) throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled by your company');
    res.json({ token: signToken(user), user: serializeUser(user) });
  });

  r.get('/me', authenticate(db), (req, res) => {
    const user = q.get(db, 'SELECT * FROM users WHERE id = ?', req.user.id);
    const company = q.get(db, 'SELECT id, name, cr_number, vat_number, city, phone FROM companies WHERE id = ?', req.user.company_id);
    res.json({ user: serializeUser(user), company });
  });

  r.patch('/me', authenticate(db), (req, res) => {
    const lang = oneOf(req.body.lang, 'lang', ['ar', 'en']);
    if (lang) q.run(db, 'UPDATE users SET lang = ? WHERE id = ?', lang, req.user.id);
    // Drivers must agree before their location is shared during trips (PDPL).
    if (req.body.location_consent === true) q.run(db, 'UPDATE users SET location_consent_at = ? WHERE id = ?', new Date().toISOString(), req.user.id);
    if (req.body.location_consent === false) q.run(db, 'UPDATE users SET location_consent_at = NULL WHERE id = ?', req.user.id);
    res.json({ user: serializeUser(q.get(db, 'SELECT * FROM users WHERE id = ?', req.user.id)) });
  });

  // Registers this phone for push notifications (Expo push token from the Android/iOS app).
  r.post('/me/push-token', authenticate(db), (req, res) => {
    const token = req.body?.token ? str(req.body.token, 'token', { max: 200 }) : null;
    if (token && !/^Expo(nent)?PushToken\[.+\]$/.test(token)) throw badRequest('VALIDATION', 'Invalid push token');
    // A device belongs to one account at a time.
    if (token) q.run(db, 'UPDATE users SET push_token = NULL WHERE push_token = ? AND id != ?', token, req.user.id);
    q.run(db, 'UPDATE users SET push_token = ? WHERE id = ?', token, req.user.id);
    res.json({ ok: true });
  });

  r.post('/me/password', authenticate(db), (req, res) => {
    const user = q.get(db, 'SELECT * FROM users WHERE id = ?', req.user.id);
    if (!bcrypt.compareSync(String(req.body.current_password || ''), user.password_hash)) {
      throw badRequest('BAD_CREDENTIALS', 'Current password is wrong');
    }
    const next = str(req.body.new_password, 'new_password', { required: true, min: 8, max: 100 });
    q.run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(next, 10), user.id);
    res.json({ ok: true });
  });

  return r;
}
