import { Router } from 'express';
import { q } from '../db.js';
import { config } from '../config.js';
import { OFFICE, MANAGERS, requireRole } from '../auth.js';
import { GATE_REQUIREMENTS, withState } from '../compliance.js';
import { todayLocal, addDays, str } from '../util.js';

export default function dashboardRoutes(db) {
  const r = Router();

  r.get('/dashboard', requireRole(OFFICE), (req, res) => {
    const cid = req.user.company_id;
    const today = todayLocal();
    const soon = addDays(today, config.expiringSoonDays);
    const one = (sql, ...p) => q.get(db, sql, ...p).n;
    res.json({
      today,
      drivers: one("SELECT COUNT(*) AS n FROM users WHERE company_id = ? AND role = 'driver' AND active = 1", cid),
      vehicles: one('SELECT COUNT(*) AS n FROM vehicles WHERE company_id = ? AND active = 1', cid),
      trips: {
        en_route: one("SELECT COUNT(*) AS n FROM trips WHERE company_id = ? AND status = 'en_route'", cid),
        arrived: one("SELECT COUNT(*) AS n FROM trips WHERE company_id = ? AND status = 'arrived'", cid),
        completed_today: one("SELECT COUNT(*) AS n FROM trips WHERE company_id = ? AND status = 'completed' AND date(completed_at, '+3 hours') = ?", cid, today),
        scheduled_today: one('SELECT COALESCE(SUM(planned_trips),0) AS n FROM schedule_entries WHERE company_id = ? AND date = ?', cid, today),
      },
      documents: {
        pending: one("SELECT COUNT(*) AS n FROM documents WHERE company_id = ? AND status = 'pending'", cid),
        expired: one("SELECT COUNT(*) AS n FROM documents WHERE company_id = ? AND status = 'approved' AND expiry_date < ?", cid, today),
        expiring: one("SELECT COUNT(*) AS n FROM documents WHERE company_id = ? AND status = 'approved' AND expiry_date BETWEEN ? AND ?", cid, today, soon),
      },
      gate_today: {
        allowed: one("SELECT COUNT(*) AS n FROM gate_logs WHERE company_id = ? AND verdict = 'allowed' AND date(created_at, '+3 hours') = ?", cid, today),
        denied: one("SELECT COUNT(*) AS n FROM gate_logs WHERE company_id = ? AND verdict = 'denied' AND date(created_at, '+3 hours') = ?", cid, today),
      },
      invoices: {
        draft: one("SELECT COUNT(*) AS n FROM invoices WHERE company_id = ? AND status = 'draft'", cid),
        unpaid_total: one("SELECT COALESCE(SUM(total),0) AS n FROM invoices WHERE company_id = ? AND status = 'approved'", cid),
      },
    });
  });

  /**
   * Things that need action: expired / expiring / pending documents, plus required documents
   * that are missing entirely. Drivers get only their own items.
   */
  r.get('/alerts', (req, res) => {
    const cid = req.user.company_id;
    const today = todayLocal();
    const soon = addDays(today, config.expiringSoonDays);
    const isDriver = req.user.role === 'driver';
    if (!isDriver && !OFFICE.includes(req.user.role)) return res.json([]);

    const docs = q
      .all(
        db,
        `SELECT d.id, d.owner_type, d.owner_id, d.doc_type, d.expiry_date, d.status,
           CASE d.owner_type WHEN 'driver' THEN (SELECT name FROM users WHERE id = d.owner_id)
                             WHEN 'vehicle' THEN (SELECT plate_number FROM vehicles WHERE id = d.owner_id)
                             ELSE (SELECT name FROM companies WHERE id = d.owner_id) END AS owner_name
         FROM documents d WHERE d.company_id = ?
           AND (d.status = 'pending' OR (d.status = 'approved' AND d.expiry_date IS NOT NULL AND d.expiry_date <= ?))
           ${isDriver ? "AND ((d.owner_type = 'driver' AND d.owner_id = ?) OR (d.owner_type = 'vehicle' AND d.owner_id = ?))" : ''}
         ORDER BY d.expiry_date`,
        ...(isDriver ? [cid, soon, req.user.id, req.user.default_vehicle_id ?? -1] : [cid, soon]),
      )
      .map((d) => withState(d, today));

    // Only alert on the newest approved document of each type — an expired one that has been
    // renewed is not an issue.
    const latestExpiry = new Map(
      q
        .all(
          db,
          "SELECT owner_type, owner_id, doc_type, MAX(COALESCE(expiry_date, '9999-12-31')) AS latest FROM documents WHERE company_id = ? AND status = 'approved' GROUP BY owner_type, owner_id, doc_type",
          cid,
        )
        .map((d) => [`${d.owner_type}:${d.owner_id}:${d.doc_type}`, d.latest]),
    );
    const alerts = docs
      .filter((d) => d.state === 'pending' || latestExpiry.get(`${d.owner_type}:${d.owner_id}:${d.doc_type}`) === d.expiry_date)
      .map((d) => ({ kind: d.state, document_id: d.id, owner_type: d.owner_type, owner_id: d.owner_id, owner_name: d.owner_name, doc_type: d.doc_type, expiry_date: d.expiry_date, days_left: d.days_left }));

    // Missing required documents.
    const drivers = isDriver
      ? [{ id: req.user.id, name: req.user.name }]
      : q.all(db, "SELECT id, name FROM users WHERE company_id = ? AND role = 'driver' AND active = 1", cid);
    const vehicles = isDriver
      ? (req.user.default_vehicle_id ? q.all(db, 'SELECT id, plate_number AS name FROM vehicles WHERE id = ?', req.user.default_vehicle_id) : [])
      : q.all(db, 'SELECT id, plate_number AS name FROM vehicles WHERE company_id = ? AND active = 1', cid);
    const have = new Set(
      q.all(db, "SELECT owner_type, owner_id, doc_type FROM documents WHERE company_id = ? AND status IN ('approved','pending')", cid).map((d) => `${d.owner_type}:${d.owner_id}:${d.doc_type}`),
    );
    for (const [ownerType, owners] of [['driver', drivers], ['vehicle', vehicles]]) {
      for (const reqm of GATE_REQUIREMENTS.filter((x) => x.owner[0] === ownerType && x.key !== 'landfill_permit')) {
        for (const o of owners) {
          if (!reqm.types.some((t) => have.has(`${ownerType}:${o.id}:${t}`))) {
            alerts.push({ kind: 'missing', owner_type: ownerType, owner_id: o.id, owner_name: o.name, doc_type: reqm.types[0], requirement: reqm.key });
          }
        }
      }
    }
    if (!isDriver) {
      const hasPermit = q.get(
        db,
        "SELECT 1 FROM documents WHERE company_id = ? AND doc_type = 'landfill_permit' AND status = 'approved' AND (expiry_date IS NULL OR expiry_date >= ?)",
        cid, today,
      );
      if (!hasPermit) alerts.push({ kind: 'missing', owner_type: 'company', owner_id: cid, owner_name: null, doc_type: 'landfill_permit', requirement: 'landfill_permit' });
    }
    const order = { expired: 0, missing: 1, rejected: 2, pending: 3, expiring: 4 };
    alerts.sort((a, b) => order[a.kind] - order[b.kind] || String(a.expiry_date || '').localeCompare(String(b.expiry_date || '')));
    res.json(alerts);
  });

  r.get('/company', (req, res) => {
    res.json(q.get(db, 'SELECT id, name, cr_number, vat_number, city, phone FROM companies WHERE id = ?', req.user.company_id));
  });

  r.patch('/company', requireRole(MANAGERS), (req, res) => {
    const c = q.get(db, 'SELECT * FROM companies WHERE id = ?', req.user.company_id);
    const pick = (k, max) => (req.body[k] !== undefined ? str(req.body[k], k, { max, required: k === 'name' }) : c[k]);
    q.run(db, 'UPDATE companies SET name=?, cr_number=?, vat_number=?, city=?, phone=? WHERE id=?', pick('name', 120), pick('cr_number', 20), pick('vat_number', 20), pick('city', 60), pick('phone', 20), c.id);
    res.json(q.get(db, 'SELECT id, name, cr_number, vat_number, city, phone FROM companies WHERE id = ?', c.id));
  });

  return r;
}
