import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { MANAGERS, OFFICE, ROLES, requireRole, signPath, verifySignedPath } from '../auth.js';
import { ownerCompliance } from '../compliance.js';
import { uploader, resolveUpload, removeUpload } from '../uploads.js';
import { HttpError, str, oneOf, num, bool, normalizePhone, validateIdNumber, randomPassword, notFound, forbidden } from '../util.js';
import { serializeDoc } from './documents.js';

export function serializeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    company_id: u.company_id,
    name: u.name,
    phone: u.phone,
    email: u.email ?? null,
    role: u.role,
    lang: u.lang,
    active: Boolean(u.active),
    id_type: u.id_type ?? null,
    id_number: u.id_number ?? null,
    nationality: u.nationality ?? null,
    license_number: u.license_number ?? null,
    default_vehicle_id: u.default_vehicle_id ?? null,
    photo_url: u.photo_path ? signPath(`/api/users/${u.id}/photo`, 3600) : null,
    location_consent_at: u.location_consent_at ?? null,
    created_at: u.created_at,
  };
}

function readProfile(body, existing = {}) {
  const idType = body.id_type !== undefined ? oneOf(body.id_type, 'id_type', ['national_id', 'iqama']) : existing.id_type ?? null;
  const idNumber = body.id_number !== undefined ? validateIdNumber(idType, str(body.id_number, 'id_number', { max: 10 })) : existing.id_number ?? null;
  return {
    id_type: idType,
    id_number: idNumber,
    nationality: body.nationality !== undefined ? str(body.nationality, 'nationality', { max: 40 }) : existing.nationality ?? null,
    license_number: body.license_number !== undefined ? str(body.license_number, 'license_number', { max: 30 }) : existing.license_number ?? null,
  };
}

export default function userRoutes(db) {
  const r = Router();
  const photoUpload = uploader({ imagesOnly: true });

  const findUser = (req, id) => {
    const u = q.get(db, 'SELECT * FROM users WHERE id = ? AND company_id = ?', id, req.user.company_id);
    if (!u) throw notFound('User');
    return u;
  };

  const checkVehicle = (req, vehicleId) => {
    if (vehicleId == null) return null;
    const v = q.get(db, 'SELECT id FROM vehicles WHERE id = ? AND company_id = ?', vehicleId, req.user.company_id);
    if (!v) throw notFound('Vehicle');
    return v.id;
  };

  r.get('/', requireRole(OFFICE, 'gate'), (req, res) => {
    const role = oneOf(req.query.role, 'role', ROLES);
    const rows = role
      ? q.all(db, 'SELECT * FROM users WHERE company_id = ? AND role = ? ORDER BY active DESC, name', req.user.company_id, role)
      : q.all(db, 'SELECT * FROM users WHERE company_id = ? ORDER BY role, active DESC, name', req.user.company_id);
    const docIssues = new Map(
      q.all(
        db,
        `SELECT owner_id, COUNT(*) AS n FROM documents WHERE company_id = ? AND owner_type = 'driver'
         AND (status != 'approved' OR (expiry_date IS NOT NULL AND expiry_date < date('now'))) GROUP BY owner_id`,
        req.user.company_id,
      ).map((x) => [x.owner_id, x.n]),
    );
    // Gate staff only need names and photos, not ID numbers.
    const isGate = req.user.role === 'gate';
    res.json(
      rows.map((u) => {
        const s = { ...serializeUser(u), doc_issues: docIssues.get(u.id) || 0 };
        if (isGate) delete s.id_number;
        return s;
      }),
    );
  });

  r.post('/', requireRole(MANAGERS), (req, res) => {
    const role = oneOf(req.body.role, 'role', ROLES, { required: true });
    if (role === 'owner' && req.user.role !== 'owner') throw forbidden();
    const name = str(req.body.name, 'name', { required: true, max: 80 });
    const phone = normalizePhone(req.body.phone);
    if (q.get(db, 'SELECT 1 FROM users WHERE phone = ?', phone)) throw new HttpError(409, 'PHONE_TAKEN', 'This phone number is already registered');
    const tempPassword = req.body.password ? str(req.body.password, 'password', { min: 8, max: 100 }) : randomPassword();
    const profile = readProfile(req.body);
    const vehicleId = checkVehicle(req, num(req.body.default_vehicle_id, 'default_vehicle_id', { integer: true }));
    const info = q.run(
      db,
      `INSERT INTO users (company_id, name, phone, email, password_hash, role, lang, id_type, id_number, nationality, license_number, default_vehicle_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      req.user.company_id, name, phone, str(req.body.email, 'email', { max: 120 }), bcrypt.hashSync(tempPassword, 10), role,
      oneOf(req.body.lang, 'lang', ['ar', 'en']) || 'ar', profile.id_type, profile.id_number, profile.nationality, profile.license_number, vehicleId,
    );
    const user = q.get(db, 'SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
    // The temporary password is returned once so the manager can share it with the new user.
    res.status(201).json({ user: serializeUser(user), temp_password: req.body.password ? null : tempPassword });
  });

  r.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!OFFICE.includes(req.user.role) && req.user.id !== id) throw forbidden();
    const u = findUser(req, id);
    const body = { user: serializeUser(u) };
    if (u.role === 'driver') {
      const c = ownerCompliance(db, req.user.company_id, 'driver', u.id);
      body.documents = c.docs.map(serializeDoc);
      body.missing = c.missing;
      body.vehicle = u.default_vehicle_id ? q.get(db, 'SELECT id, plate_number, type FROM vehicles WHERE id = ?', u.default_vehicle_id) : null;
    }
    res.json(body);
  });

  r.patch('/:id', requireRole(MANAGERS), (req, res) => {
    const u = findUser(req, Number(req.params.id));
    if (u.role === 'owner' && req.user.role !== 'owner') throw forbidden();
    const role = req.body.role !== undefined ? oneOf(req.body.role, 'role', ROLES) : u.role;
    if (role === 'owner' && req.user.role !== 'owner') throw forbidden();
    if (u.id === req.user.id && (role !== u.role || bool(req.body.active) === 0)) {
      throw new HttpError(400, 'CANNOT_CHANGE_SELF', 'You cannot change your own role or disable yourself');
    }
    let phone = u.phone;
    if (req.body.phone !== undefined) {
      phone = normalizePhone(req.body.phone);
      if (phone !== u.phone && q.get(db, 'SELECT 1 FROM users WHERE phone = ?', phone)) throw new HttpError(409, 'PHONE_TAKEN', 'This phone number is already registered');
    }
    const profile = readProfile(req.body, u);
    const vehicleId = req.body.default_vehicle_id !== undefined ? checkVehicle(req, num(req.body.default_vehicle_id, 'default_vehicle_id', { integer: true })) : u.default_vehicle_id;
    const active = bool(req.body.active);
    q.run(
      db,
      `UPDATE users SET name=?, phone=?, email=?, role=?, active=?, id_type=?, id_number=?, nationality=?, license_number=?, default_vehicle_id=? WHERE id=?`,
      req.body.name !== undefined ? str(req.body.name, 'name', { required: true, max: 80 }) : u.name,
      phone,
      req.body.email !== undefined ? str(req.body.email, 'email', { max: 120 }) : u.email,
      role,
      active ?? u.active,
      profile.id_type, profile.id_number, profile.nationality, profile.license_number, vehicleId, u.id,
    );
    res.json({ user: serializeUser(q.get(db, 'SELECT * FROM users WHERE id = ?', u.id)) });
  });

  r.post('/:id/reset-password', requireRole(MANAGERS), (req, res) => {
    const u = findUser(req, Number(req.params.id));
    if (u.role === 'owner' && req.user.role !== 'owner') throw forbidden();
    const temp = randomPassword();
    q.run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(temp, 10), u.id);
    res.json({ temp_password: temp });
  });

  // Driver photo shown to gate staff. Drivers may set their own; office staff may set anyone's.
  r.post('/:id/photo', photoUpload.single('file'), (req, res) => {
    const id = Number(req.params.id);
    if (!MANAGERS.includes(req.user.role) && req.user.role !== 'safety' && req.user.id !== id) {
      if (req.file) removeUpload(req.file.filename);
      throw forbidden();
    }
    const u = findUser(req, id);
    if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Choose a photo to upload');
    removeUpload(u.photo_path);
    q.run(db, 'UPDATE users SET photo_path = ? WHERE id = ?', req.file.filename, u.id);
    res.json({ user: serializeUser(q.get(db, 'SELECT * FROM users WHERE id = ?', u.id)) });
  });

  return r;
}

/** Public (signed-URL) photo route, mounted before authentication. */
export function userPhotoRoute(db) {
  const r = Router();
  r.get('/:id/photo', (req, res) => {
    if (!verifySignedPath(req)) throw new HttpError(403, 'LINK_EXPIRED', 'Link expired');
    const u = q.get(db, 'SELECT photo_path FROM users WHERE id = ?', Number(req.params.id));
    const file = resolveUpload(u?.photo_path);
    if (!file) throw notFound('Photo');
    res.set('Cache-Control', 'private, max-age=600');
    res.sendFile(file);
  });
  return r;
}
