import { Router } from 'express';
import { q, tx } from '../db.js';
import { MANAGERS, OFFICE, requireRole } from '../auth.js';
import { HttpError, str, num, date, oneOf, notFound, forbidden, todayLocal, weekStart, addDays } from '../util.js';

const ENTRY_SELECT = `
  SELECT e.*, u.name AS driver_name, u.phone AS driver_phone, v.plate_number, s.name AS site_name,
    (SELECT COUNT(*) FROM trips t WHERE t.schedule_entry_id = e.id AND t.status = 'completed') AS completed_trips,
    (SELECT COUNT(*) FROM gate_logs g WHERE g.driver_id = e.driver_id AND g.verdict = 'allowed' AND date(g.created_at, '+3 hours') = e.date) AS gate_entries
  FROM schedule_entries e JOIN users u ON u.id = e.driver_id
  LEFT JOIN vehicles v ON v.id = e.vehicle_id LEFT JOIN sites s ON s.id = e.site_id`;

/** The weekly plan (Sunday–Saturday) shared with drivers and gate security. */
export default function scheduleRoutes(db) {
  const r = Router();

  function weekRange(req) {
    const start = weekStart(date(req.query.week_start, 'week_start') || todayLocal());
    return { start, end: addDays(start, 6) };
  }

  function validateRefs(cid, { driver_id, vehicle_id, site_id }) {
    if (!q.get(db, "SELECT 1 FROM users WHERE id = ? AND company_id = ? AND role = 'driver'", driver_id, cid)) throw notFound('Driver');
    if (vehicle_id != null && !q.get(db, 'SELECT 1 FROM vehicles WHERE id = ? AND company_id = ?', vehicle_id, cid)) throw notFound('Vehicle');
    if (site_id != null && !q.get(db, 'SELECT 1 FROM sites WHERE id = ? AND company_id = ?', site_id, cid)) throw notFound('Site');
  }

  // Office and gate staff see the whole company plan; drivers see only their own rows.
  r.get('/', (req, res) => {
    const { start, end } = weekRange(req);
    const where = ['e.company_id = ?', 'e.date BETWEEN ? AND ?'];
    const params = [req.user.company_id, start, end];
    if (req.user.role === 'driver') { where.push('e.driver_id = ?'); params.push(req.user.id); }
    else if (![...OFFICE, 'gate'].includes(req.user.role)) throw forbidden();
    const entries = q.all(db, `${ENTRY_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.date, e.shift, u.name`, ...params);
    res.json({ week_start: start, week_end: end, today: todayLocal(), entries });
  });

  r.post('/', requireRole(MANAGERS), (req, res) => {
    const entry = {
      date: date(req.body.date, 'date', { required: true }),
      driver_id: num(req.body.driver_id, 'driver_id', { required: true, integer: true }),
      vehicle_id: num(req.body.vehicle_id, 'vehicle_id', { integer: true }),
      site_id: num(req.body.site_id, 'site_id', { integer: true }),
      shift: oneOf(req.body.shift, 'shift', ['morning', 'evening', 'night']) || 'morning',
      planned_trips: num(req.body.planned_trips, 'planned_trips', { integer: true, min: 1, max: 50 }) ?? 1,
      notes: str(req.body.notes, 'notes', { max: 300 }),
    };
    if (entry.vehicle_id == null) {
      entry.vehicle_id = q.get(db, 'SELECT default_vehicle_id FROM users WHERE id = ? AND company_id = ?', entry.driver_id, req.user.company_id)?.default_vehicle_id ?? null;
    }
    validateRefs(req.user.company_id, entry);
    if (q.get(db, 'SELECT 1 FROM schedule_entries WHERE company_id = ? AND driver_id = ? AND date = ? AND shift = ?', req.user.company_id, entry.driver_id, entry.date, entry.shift)) {
      throw new HttpError(409, 'ALREADY_SCHEDULED', 'This driver is already scheduled for that shift');
    }
    const info = q.run(
      db,
      'INSERT INTO schedule_entries (company_id, date, driver_id, vehicle_id, site_id, shift, planned_trips, notes) VALUES (?,?,?,?,?,?,?,?)',
      req.user.company_id, entry.date, entry.driver_id, entry.vehicle_id, entry.site_id, entry.shift, entry.planned_trips, entry.notes,
    );
    res.status(201).json(q.get(db, `${ENTRY_SELECT} WHERE e.id = ?`, info.lastInsertRowid));
  });

  r.patch('/:id', requireRole(MANAGERS), (req, res) => {
    const e = q.get(db, 'SELECT * FROM schedule_entries WHERE id = ? AND company_id = ?', Number(req.params.id), req.user.company_id);
    if (!e) throw notFound('Schedule entry');
    const next = {
      date: req.body.date !== undefined ? date(req.body.date, 'date', { required: true }) : e.date,
      driver_id: req.body.driver_id !== undefined ? num(req.body.driver_id, 'driver_id', { required: true, integer: true }) : e.driver_id,
      vehicle_id: req.body.vehicle_id !== undefined ? num(req.body.vehicle_id, 'vehicle_id', { integer: true }) : e.vehicle_id,
      site_id: req.body.site_id !== undefined ? num(req.body.site_id, 'site_id', { integer: true }) : e.site_id,
      shift: req.body.shift !== undefined ? oneOf(req.body.shift, 'shift', ['morning', 'evening', 'night'], { required: true }) : e.shift,
      planned_trips: req.body.planned_trips !== undefined ? num(req.body.planned_trips, 'planned_trips', { required: true, integer: true, min: 1, max: 50 }) : e.planned_trips,
      notes: req.body.notes !== undefined ? str(req.body.notes, 'notes', { max: 300 }) : e.notes,
    };
    validateRefs(req.user.company_id, next);
    q.run(
      db,
      'UPDATE schedule_entries SET date=?, driver_id=?, vehicle_id=?, site_id=?, shift=?, planned_trips=?, notes=? WHERE id=?',
      next.date, next.driver_id, next.vehicle_id, next.site_id, next.shift, next.planned_trips, next.notes, e.id,
    );
    res.json(q.get(db, `${ENTRY_SELECT} WHERE e.id = ?`, e.id));
  });

  r.delete('/:id', requireRole(MANAGERS), (req, res) => {
    const e = q.get(db, 'SELECT id FROM schedule_entries WHERE id = ? AND company_id = ?', Number(req.params.id), req.user.company_id);
    if (!e) throw notFound('Schedule entry');
    tx(db, () => {
      q.run(db, 'UPDATE trips SET schedule_entry_id = NULL WHERE schedule_entry_id = ?', e.id);
      q.run(db, 'DELETE FROM schedule_entries WHERE id = ?', e.id);
    });
    res.json({ ok: true });
  });

  // Plan ahead: copy a whole week onto another week (skips rows that already exist).
  r.post('/copy-week', requireRole(MANAGERS), (req, res) => {
    const from = weekStart(date(req.body.from_week_start, 'from_week_start', { required: true }));
    const to = weekStart(date(req.body.to_week_start, 'to_week_start', { required: true }));
    if (from === to) throw new HttpError(400, 'SAME_WEEK', 'Choose a different target week');
    const cid = req.user.company_id;
    const offset = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
    let copied = 0;
    tx(db, () => {
      for (const e of q.all(db, 'SELECT * FROM schedule_entries WHERE company_id = ? AND date BETWEEN ? AND ?', cid, from, addDays(from, 6))) {
        const newDate = addDays(e.date, offset);
        if (q.get(db, 'SELECT 1 FROM schedule_entries WHERE company_id = ? AND driver_id = ? AND date = ? AND shift = ?', cid, e.driver_id, newDate, e.shift)) continue;
        q.run(
          db,
          'INSERT INTO schedule_entries (company_id, date, driver_id, vehicle_id, site_id, shift, planned_trips, notes) VALUES (?,?,?,?,?,?,?,?)',
          cid, newDate, e.driver_id, e.vehicle_id, e.site_id, e.shift, e.planned_trips, e.notes,
        );
        copied++;
      }
    });
    res.json({ copied, week_start: to });
  });

  return r;
}
