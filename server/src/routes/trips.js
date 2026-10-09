import { Router } from 'express';
import { q, tx } from '../db.js';
import { MANAGERS, OFFICE, requireRole, signPath, verifySignedPath } from '../auth.js';
import { uploader, resolveUpload, removeUpload } from '../uploads.js';
import { HttpError, str, num, date, oneOf, notFound, forbidden, nowIso, haversineMeters, todayLocal } from '../util.js';

const TRIP_SELECT = `
  SELECT t.*, u.name AS driver_name, u.phone AS driver_phone, v.plate_number, s.name AS site_name,
         s.lat AS site_lat, s.lng AS site_lng, s.radius_m AS site_radius_m
  FROM trips t JOIN users u ON u.id = t.driver_id
  LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN sites s ON s.id = t.site_id`;

export function serializeTrip(t) {
  const minutesSinceUpdate = t.last_location_at ? Math.round((Date.now() - Date.parse(t.last_location_at)) / 60000) : null;
  const distance = t.last_lat != null && t.site_lat != null ? Math.round(haversineMeters(t.last_lat, t.last_lng, t.site_lat, t.site_lng)) : null;
  const { ticket_path, ...rest } = t;
  return {
    ...rest,
    minutes_since_update: minutesSinceUpdate,
    distance_to_site_m: distance,
    ticket_url: ticket_path ? signPath(`/api/trips/${t.id}/ticket`, 3600) : null,
  };
}

export default function tripRoutes(db) {
  const r = Router();
  const ticketUpload = uploader();

  const getTrip = (req, id) => {
    const t = q.get(db, `${TRIP_SELECT} WHERE t.id = ? AND t.company_id = ?`, id, req.user.company_id);
    if (!t) throw notFound('Trip');
    if (req.user.role === 'driver' && t.driver_id !== req.user.id) throw notFound('Trip');
    return t;
  };

  // Office: filter by date range / driver / status. Drivers: their own trips.
  r.get('/', (req, res) => {
    const cid = req.user.company_id;
    const where = ['t.company_id = ?'];
    const params = [cid];
    if (req.user.role === 'driver') { where.push('t.driver_id = ?'); params.push(req.user.id); }
    else if (!OFFICE.includes(req.user.role)) throw forbidden();
    const from = date(req.query.from, 'from');
    const to = date(req.query.to, 'to');
    // Riyadh is UTC+3; compare on local dates.
    if (from) { where.push("date(t.started_at, '+3 hours') >= ?"); params.push(from); }
    if (to) { where.push("date(t.started_at, '+3 hours') <= ?"); params.push(to); }
    const driverId = num(req.query.driver_id, 'driver_id', { integer: true });
    if (driverId != null && req.user.role !== 'driver') { where.push('t.driver_id = ?'); params.push(driverId); }
    const status = oneOf(req.query.status, 'status', ['en_route', 'arrived', 'completed', 'cancelled', 'active']);
    if (status === 'active') where.push("t.status IN ('en_route','arrived')");
    else if (status) { where.push('t.status = ?'); params.push(status); }
    const rows = q.all(db, `${TRIP_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.started_at DESC LIMIT 300`, ...params);
    res.json(rows.map(serializeTrip));
  });

  // Live board: trucks currently on the road or at the site.
  r.get('/live', requireRole(OFFICE, 'gate'), (req, res) => {
    const rows = q.all(db, `${TRIP_SELECT} WHERE t.company_id = ? AND t.status IN ('en_route','arrived') ORDER BY t.started_at`, req.user.company_id);
    const arrivedToday = q.all(
      db,
      `${TRIP_SELECT} WHERE t.company_id = ? AND t.arrived_at IS NOT NULL AND date(t.arrived_at, '+3 hours') = ? ORDER BY t.arrived_at DESC`,
      req.user.company_id, todayLocal(),
    );
    res.json({ active: rows.map(serializeTrip), arrived_today: arrivedToday.map(serializeTrip) });
  });

  r.get('/:id', (req, res) => {
    const t = getTrip(req, Number(req.params.id));
    const points = q.all(db, 'SELECT lat, lng, accuracy, recorded_at FROM trip_locations WHERE trip_id = ? ORDER BY recorded_at', t.id);
    res.json({ trip: serializeTrip(t), points });
  });

  r.post('/start', requireRole('driver'), (req, res) => {
    const cid = req.user.company_id;
    const active = q.get(db, "SELECT id FROM trips WHERE driver_id = ? AND status IN ('en_route','arrived')", req.user.id);
    if (active) throw new HttpError(409, 'TRIP_IN_PROGRESS', 'Finish your current trip first', { trip_id: active.id });
    const scheduleId = num(req.body.schedule_entry_id, 'schedule_entry_id', { integer: true });
    let entry = null;
    if (scheduleId != null) {
      entry = q.get(db, 'SELECT * FROM schedule_entries WHERE id = ? AND company_id = ? AND driver_id = ?', scheduleId, cid, req.user.id);
      if (!entry) throw notFound('Schedule entry');
    }
    const vehicleId = num(req.body.vehicle_id, 'vehicle_id', { integer: true }) ?? entry?.vehicle_id ?? req.user.default_vehicle_id;
    if (vehicleId && !q.get(db, 'SELECT 1 FROM vehicles WHERE id = ? AND company_id = ? AND active = 1', vehicleId, cid)) throw notFound('Vehicle');
    const siteId = num(req.body.site_id, 'site_id', { integer: true }) ?? entry?.site_id ?? null;
    if (siteId && !q.get(db, 'SELECT 1 FROM sites WHERE id = ? AND company_id = ?', siteId, cid)) throw notFound('Site');
    const info = q.run(
      db,
      'INSERT INTO trips (company_id, driver_id, vehicle_id, site_id, schedule_entry_id, status, load_type, started_at) VALUES (?,?,?,?,?,?,?,?)',
      cid, req.user.id, vehicleId ?? null, siteId, entry?.id ?? null, 'en_route', str(req.body.load_type, 'load_type', { max: 60 }), nowIso(),
    );
    const t = getTrip(req, Number(info.lastInsertRowid));
    res.status(201).json(serializeTrip(t));
  });

  // Driver phone posts its location every ~30s while a trip is active. Entering the site's
  // geofence marks the trip as arrived automatically.
  r.post('/:id/location', requireRole('driver'), (req, res) => {
    if (!req.user.location_consent_at) throw new HttpError(403, 'LOCATION_CONSENT_REQUIRED', 'The driver has not agreed to location sharing');
    const t = getTrip(req, Number(req.params.id));
    if (!['en_route', 'arrived'].includes(t.status)) throw new HttpError(409, 'TRIP_NOT_ACTIVE', 'This trip is not active');
    const points = Array.isArray(req.body.points) ? req.body.points.slice(0, 100) : [req.body];
    const at = nowIso();
    let last = null;
    tx(db, () => {
      for (const p of points) {
        const lat = num(p.lat, 'lat', { required: true, min: -90, max: 90 });
        const lng = num(p.lng, 'lng', { required: true, min: -180, max: 180 });
        const recordedAt = p.recorded_at && !Number.isNaN(Date.parse(p.recorded_at)) ? new Date(p.recorded_at).toISOString() : at;
        q.run(db, 'INSERT INTO trip_locations (trip_id, lat, lng, accuracy, recorded_at) VALUES (?,?,?,?,?)', t.id, lat, lng, num(p.accuracy, 'accuracy', { min: 0 }), recordedAt);
        last = { lat, lng, recordedAt };
      }
      q.run(db, 'UPDATE trips SET last_lat=?, last_lng=?, last_location_at=? WHERE id=?', last.lat, last.lng, last.recordedAt, t.id);
      if (t.status === 'en_route' && t.site_lat != null && haversineMeters(last.lat, last.lng, t.site_lat, t.site_lng) <= t.site_radius_m) {
        q.run(db, "UPDATE trips SET status='arrived', arrived_at=?, arrival_method='geofence' WHERE id=?", last.recordedAt, t.id);
      }
    });
    res.json(serializeTrip(getTrip(req, t.id)));
  });

  r.post('/:id/arrive', requireRole('driver', MANAGERS), (req, res) => {
    const t = getTrip(req, Number(req.params.id));
    if (t.status !== 'en_route') throw new HttpError(409, 'TRIP_NOT_EN_ROUTE', 'Trip is not on the way');
    q.run(db, "UPDATE trips SET status='arrived', arrived_at=?, arrival_method=? WHERE id=?", nowIso(), req.user.role === 'driver' ? 'driver' : 'manager', t.id);
    res.json(serializeTrip(getTrip(req, t.id)));
  });

  // Completing a trip records the landfill weight ticket (number, weight and an optional photo).
  r.post('/:id/complete', requireRole('driver', MANAGERS), ticketUpload.single('ticket'), (req, res) => {
    try {
      const t = getTrip(req, Number(req.params.id));
      if (!['en_route', 'arrived'].includes(t.status)) throw new HttpError(409, 'TRIP_NOT_ACTIVE', 'This trip is not active');
      const now = nowIso();
      q.run(
        db,
        "UPDATE trips SET status='completed', completed_at=?, arrived_at=COALESCE(arrived_at, ?), arrival_method=COALESCE(arrival_method, 'on_complete'), weight_tons=?, ticket_number=?, ticket_path=COALESCE(?, ticket_path), ticket_mime=COALESCE(?, ticket_mime), notes=? WHERE id=?",
        now, now, num(req.body.weight_tons, 'weight_tons', { min: 0, max: 200 }), str(req.body.ticket_number, 'ticket_number', { max: 40 }),
        req.file?.filename ?? null, req.file?.mimetype ?? null, str(req.body.notes, 'notes', { max: 500 }), t.id,
      );
      res.json(serializeTrip(getTrip(req, t.id)));
    } catch (err) {
      if (req.file) removeUpload(req.file.filename);
      throw err;
    }
  });

  r.post('/:id/cancel', requireRole('driver', MANAGERS), (req, res) => {
    const t = getTrip(req, Number(req.params.id));
    if (!['en_route', 'arrived'].includes(t.status)) throw new HttpError(409, 'TRIP_NOT_ACTIVE', 'This trip is not active');
    q.run(db, "UPDATE trips SET status='cancelled', completed_at=?, notes=COALESCE(?, notes) WHERE id=?", nowIso(), str(req.body.reason, 'reason', { max: 300 }), t.id);
    res.json(serializeTrip(getTrip(req, t.id)));
  });

  // Office staff can correct weight/ticket data before invoicing.
  r.patch('/:id', requireRole(MANAGERS), (req, res) => {
    const t = getTrip(req, Number(req.params.id));
    if (t.invoice_id) {
      const inv = q.get(db, 'SELECT status FROM invoices WHERE id = ?', t.invoice_id);
      if (inv && inv.status !== 'draft') throw new HttpError(409, 'TRIP_INVOICED', 'This trip is on an approved invoice');
    }
    q.run(
      db,
      'UPDATE trips SET weight_tons=?, ticket_number=?, notes=? WHERE id=?',
      req.body.weight_tons !== undefined ? num(req.body.weight_tons, 'weight_tons', { min: 0, max: 200 }) : t.weight_tons,
      req.body.ticket_number !== undefined ? str(req.body.ticket_number, 'ticket_number', { max: 40 }) : t.ticket_number,
      req.body.notes !== undefined ? str(req.body.notes, 'notes', { max: 500 }) : t.notes,
      t.id,
    );
    res.json(serializeTrip(getTrip(req, t.id)));
  });

  return r;
}

export function tripTicketRoute(db) {
  const r = Router();
  r.get('/:id/ticket', (req, res) => {
    if (!verifySignedPath(req)) throw new HttpError(403, 'LINK_EXPIRED', 'Link expired');
    const t = q.get(db, 'SELECT ticket_path, ticket_mime FROM trips WHERE id = ?', Number(req.params.id));
    const file = resolveUpload(t?.ticket_path);
    if (!file) throw notFound('Ticket');
    res.type(t.ticket_mime || 'application/octet-stream');
    res.sendFile(file);
  });
  return r;
}
