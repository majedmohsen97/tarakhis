import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { q } from '../db.js';
import { config } from '../config.js';
import { OFFICE, requireRole, signPath } from '../auth.js';
import { evaluateGate } from '../compliance.js';
import { createPassToken, createShortCode, extractToken, verifyPassToken } from '../pass.js';
import { HttpError, num, oneOf, notFound, nowIso, todayLocal } from '../util.js';
import { renderVerifyPage } from '../views/verify.js';

function baseUrl(req) {
  return config.publicUrl || `${req.protocol}://${req.get('host')}`;
}

function passHolder(db, payload) {
  const driver = q.get(
    db,
    `SELECT u.id, u.name, u.photo_path, u.nationality, c.name AS company_name
     FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ? AND u.company_id = ?`,
    payload.d, payload.c,
  );
  if (!driver) return null;
  const vehicle = payload.v ? q.get(db, 'SELECT id, plate_number, type FROM vehicles WHERE id = ? AND company_id = ?', payload.v, payload.c) : null;
  return {
    driver: {
      id: driver.id,
      name: driver.name,
      nationality: driver.nationality,
      photo_url: driver.photo_path ? signPath(`/api/users/${driver.id}/photo`, 600) : null,
    },
    company_name: driver.company_name,
    vehicle,
  };
}

/** Marks the driver's active trip as arrived when a gate scan lets them in. */
function markArrivalFromGate(db, { companyId, driverId, siteId }) {
  const trip = q.get(db, "SELECT id, status FROM trips WHERE company_id = ? AND driver_id = ? AND status IN ('en_route','arrived') ORDER BY started_at DESC LIMIT 1", companyId, driverId);
  if (!trip) return null;
  if (trip.status === 'en_route') {
    q.run(db, "UPDATE trips SET status='arrived', arrived_at=?, arrival_method='gate', site_id=COALESCE(site_id, ?) WHERE id=?", nowIso(), siteId ?? null, trip.id);
  }
  return trip.id;
}

export default function gateRoutes(db) {
  const r = Router();

  // Driver's own gate pass (QR). Rotates every few minutes so screenshots go stale.
  r.get('/pass', requireRole('driver'), (req, res) => {
    const vehicleId = req.query.vehicle_id ? num(req.query.vehicle_id, 'vehicle_id', { integer: true }) : req.user.default_vehicle_id;
    if (vehicleId && !q.get(db, 'SELECT 1 FROM vehicles WHERE id = ? AND company_id = ?', vehicleId, req.user.company_id)) throw notFound('Vehicle');
    const { token, expiresAt } = createPassToken({ driverId: req.user.id, companyId: req.user.company_id, vehicleId });
    const code = createShortCode(db, { companyId: req.user.company_id, driverId: req.user.id, token, expiresAt });
    const status = evaluateGate(db, { companyId: req.user.company_id, driverId: req.user.id, vehicleId });
    res.json({ token, code, expires_at: expiresAt, qr_value: `${baseUrl(req)}/v/${token}`, status, ...passHolder(db, { d: req.user.id, c: req.user.company_id, v: vehicleId }) });
  });

  // Gate staff scan a QR (or type the 6-digit code) and get a live verdict.
  r.post('/scan', requireRole('gate', OFFICE), (req, res) => {
    const cid = req.user.company_id;
    const token = extractToken(db, cid, req.body.code);
    if (!token) throw new HttpError(404, 'PASS_NOT_FOUND', 'Code not found or expired');
    const check = verifyPassToken(token);
    if (!check.ok) throw new HttpError(400, check.reason === 'EXPIRED' ? 'PASS_EXPIRED' : 'PASS_INVALID', check.reason === 'EXPIRED' ? 'This pass has expired — ask the driver to refresh it' : 'Not a valid Tarakhis pass');
    if (check.payload.c !== cid) throw new HttpError(403, 'OTHER_COMPANY', 'This pass belongs to another company');
    const siteId = num(req.body.site_id, 'site_id', { integer: true });
    if (siteId != null && !q.get(db, 'SELECT 1 FROM sites WHERE id = ? AND company_id = ?', siteId, cid)) throw notFound('Site');
    const direction = oneOf(req.body.direction, 'direction', ['in', 'out']) || 'in';

    const result = evaluateGate(db, { companyId: cid, driverId: check.payload.d, vehicleId: check.payload.v, siteId });
    const tripId = result.verdict === 'allowed' && direction === 'in' ? markArrivalFromGate(db, { companyId: cid, driverId: check.payload.d, siteId }) : null;
    const log = q.run(
      db,
      'INSERT INTO gate_logs (company_id, driver_id, vehicle_id, site_id, trip_id, verdict, reasons, direction, source, scanned_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
      cid, check.payload.d, check.payload.v, siteId, tripId, result.verdict, JSON.stringify(result.reasons), direction, 'app', req.user.id,
    );
    res.json({ log_id: Number(log.lastInsertRowid), ...result, trip_id: tripId, ...passHolder(db, check.payload) });
  });

  r.get('/logs', requireRole('gate', OFFICE), (req, res) => {
    const cid = req.user.company_id;
    const date = req.query.date ? String(req.query.date) : null;
    const where = ['g.company_id = ?'];
    const params = [cid];
    if (req.user.role === 'gate') { where.push('g.scanned_by = ?'); params.push(req.user.id); }
    // Saudi Arabia is UTC+3 all year (no daylight saving).
    if (date) { where.push("date(g.created_at, '+3 hours') = ?"); params.push(date); }
    const verdict = oneOf(req.query.verdict, 'verdict', ['allowed', 'denied']);
    if (verdict) { where.push('g.verdict = ?'); params.push(verdict); }
    const rows = q.all(
      db,
      `SELECT g.*, u.name AS driver_name, v.plate_number, s.name AS site_name, sb.name AS scanned_by_name
       FROM gate_logs g JOIN users u ON u.id = g.driver_id LEFT JOIN vehicles v ON v.id = g.vehicle_id
       LEFT JOIN sites s ON s.id = g.site_id LEFT JOIN users sb ON sb.id = g.scanned_by
       WHERE ${where.join(' AND ')} ORDER BY g.created_at DESC LIMIT 200`,
      ...params,
    );
    res.json(rows.map((g) => ({ ...g, reasons: JSON.parse(g.reasons) })));
  });

  return r;
}

/** Public verification (no login) — any phone camera that scans the QR lands here. */
export function publicVerifyRoutes(db) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });

  function verify(token) {
    const check = verifyPassToken(token);
    if (!check.ok) return { valid: false, reason: check.reason };
    const holder = passHolder(db, check.payload);
    if (!holder) return { valid: false, reason: 'INVALID' };
    const result = evaluateGate(db, { companyId: check.payload.c, driverId: check.payload.d, vehicleId: check.payload.v });
    q.run(
      db,
      'INSERT INTO gate_logs (company_id, driver_id, vehicle_id, verdict, reasons, source) VALUES (?,?,?,?,?,?)',
      check.payload.c, check.payload.d, check.payload.v, result.verdict, JSON.stringify(result.reasons), 'public',
    );
    // Public view shows document states and expiry dates, never ID numbers.
    return { valid: true, verdict: result.verdict, checks: result.checks, reasons: result.reasons, warnings: result.warnings, expires_at: new Date(check.payload.x * 1000).toISOString(), checked_at: nowIso(), today: todayLocal(), ...holder };
  }

  r.get('/api/verify/:token', limiter, (req, res) => res.json(verify(req.params.token)));

  r.get('/v/:token', limiter, (req, res) => {
    const lang = req.query.lang === 'en' ? 'en' : 'ar';
    res.set('Cache-Control', 'no-store');
    res.type('html').send(renderVerifyPage(verify(req.params.token), lang, req.params.token));
  });

  return r;
}
