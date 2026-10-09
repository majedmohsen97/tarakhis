import { Router } from 'express';
import { q } from '../db.js';
import { MANAGERS, OFFICE, requireRole } from '../auth.js';
import { ownerCompliance } from '../compliance.js';
import { HttpError, str, num, bool, notFound } from '../util.js';
import { serializeDoc } from './documents.js';

/** Vehicles (trucks) and sites (landfills / transfer stations with a geofence). */
export function vehicleRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => {
    const rows = q.all(
      db,
      `SELECT v.*, (SELECT name FROM users u WHERE u.default_vehicle_id = v.id AND u.active = 1 LIMIT 1) AS driver_name
       FROM vehicles v WHERE v.company_id = ? ORDER BY v.active DESC, v.plate_number`,
      req.user.company_id,
    );
    res.json(rows.map((v) => ({ ...v, active: Boolean(v.active) })));
  });

  r.post('/', requireRole(MANAGERS), (req, res) => {
    const plate = str(req.body.plate_number, 'plate_number', { required: true, max: 20 });
    if (q.get(db, 'SELECT 1 FROM vehicles WHERE company_id = ? AND plate_number = ?', req.user.company_id, plate)) {
      throw new HttpError(409, 'PLATE_TAKEN', 'A truck with this plate already exists');
    }
    const info = q.run(
      db,
      'INSERT INTO vehicles (company_id, plate_number, type, capacity_tons) VALUES (?,?,?,?)',
      req.user.company_id, plate, str(req.body.type, 'type', { max: 40 }), num(req.body.capacity_tons, 'capacity_tons', { min: 0, max: 200 }),
    );
    res.status(201).json(q.get(db, 'SELECT * FROM vehicles WHERE id = ?', info.lastInsertRowid));
  });

  r.get('/:id', requireRole(OFFICE, 'driver'), (req, res) => {
    const v = q.get(db, 'SELECT * FROM vehicles WHERE id = ? AND company_id = ?', Number(req.params.id), req.user.company_id);
    if (!v) throw notFound('Vehicle');
    if (req.user.role === 'driver' && req.user.default_vehicle_id !== v.id) throw notFound('Vehicle');
    const c = ownerCompliance(db, req.user.company_id, 'vehicle', v.id);
    res.json({ vehicle: { ...v, active: Boolean(v.active) }, documents: c.docs.map(serializeDoc), missing: c.missing });
  });

  r.patch('/:id', requireRole(MANAGERS), (req, res) => {
    const v = q.get(db, 'SELECT * FROM vehicles WHERE id = ? AND company_id = ?', Number(req.params.id), req.user.company_id);
    if (!v) throw notFound('Vehicle');
    const plate = req.body.plate_number !== undefined ? str(req.body.plate_number, 'plate_number', { required: true, max: 20 }) : v.plate_number;
    if (plate !== v.plate_number && q.get(db, 'SELECT 1 FROM vehicles WHERE company_id = ? AND plate_number = ?', req.user.company_id, plate)) {
      throw new HttpError(409, 'PLATE_TAKEN', 'A truck with this plate already exists');
    }
    q.run(
      db,
      'UPDATE vehicles SET plate_number=?, type=?, capacity_tons=?, active=? WHERE id=?',
      plate,
      req.body.type !== undefined ? str(req.body.type, 'type', { max: 40 }) : v.type,
      req.body.capacity_tons !== undefined ? num(req.body.capacity_tons, 'capacity_tons', { min: 0, max: 200 }) : v.capacity_tons,
      bool(req.body.active) ?? v.active,
      v.id,
    );
    res.json(q.get(db, 'SELECT * FROM vehicles WHERE id = ?', v.id));
  });

  return r;
}

export function siteRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(q.all(db, 'SELECT * FROM sites WHERE company_id = ? ORDER BY active DESC, name', req.user.company_id).map((s) => ({ ...s, active: Boolean(s.active) })));
  });

  const readSite = (body, s = {}) => ({
    name: body.name !== undefined ? str(body.name, 'name', { required: true, max: 80 }) : s.name,
    lat: body.lat !== undefined ? num(body.lat, 'lat', { min: -90, max: 90 }) : s.lat ?? null,
    lng: body.lng !== undefined ? num(body.lng, 'lng', { min: -180, max: 180 }) : s.lng ?? null,
    radius_m: body.radius_m !== undefined ? num(body.radius_m, 'radius_m', { min: 50, max: 5000, integer: true }) : s.radius_m ?? 400,
  });

  r.post('/', requireRole(MANAGERS), (req, res) => {
    const s = readSite(req.body);
    if (!s.name) throw new HttpError(400, 'VALIDATION', 'name is required', { field: 'name' });
    const info = q.run(db, 'INSERT INTO sites (company_id, name, lat, lng, radius_m) VALUES (?,?,?,?,?)', req.user.company_id, s.name, s.lat, s.lng, s.radius_m);
    res.status(201).json(q.get(db, 'SELECT * FROM sites WHERE id = ?', info.lastInsertRowid));
  });

  r.patch('/:id', requireRole(MANAGERS), (req, res) => {
    const existing = q.get(db, 'SELECT * FROM sites WHERE id = ? AND company_id = ?', Number(req.params.id), req.user.company_id);
    if (!existing) throw notFound('Site');
    const s = readSite(req.body, existing);
    q.run(db, 'UPDATE sites SET name=?, lat=?, lng=?, radius_m=?, active=? WHERE id=?', s.name, s.lat, s.lng, s.radius_m, bool(req.body.active) ?? existing.active, existing.id);
    res.json(q.get(db, 'SELECT * FROM sites WHERE id = ?', existing.id));
  });

  return r;
}
