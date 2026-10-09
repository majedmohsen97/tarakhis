import { Router } from 'express';
import { q, tx } from '../db.js';
import { config } from '../config.js';
import { MANAGERS, OFFICE, requireRole, signPath, verifySignedPath } from '../auth.js';
import { HttpError, str, num, date, oneOf, notFound, nowIso, weekStart, addDays, todayLocal, toHalalas } from '../util.js';
import { renderInvoicePage } from '../views/invoice.js';

function recalc(db, invoiceId) {
  const inv = q.get(db, 'SELECT vat_rate FROM invoices WHERE id = ?', invoiceId);
  const subtotal = q.get(db, 'SELECT COALESCE(SUM(amount),0) AS s FROM invoice_lines WHERE invoice_id = ?', invoiceId).s;
  const vat = Math.round(subtotal * inv.vat_rate);
  q.run(db, 'UPDATE invoices SET subtotal=?, vat_amount=?, total=?, updated_at=? WHERE id=?', subtotal, vat, subtotal + vat, nowIso(), invoiceId);
}

function loadInvoice(db, companyId, id) {
  const inv = q.get(
    db,
    `SELECT i.*, cu.name AS created_by_name, au.name AS approved_by_name FROM invoices i
     LEFT JOIN users cu ON cu.id = i.created_by LEFT JOIN users au ON au.id = i.approved_by
     WHERE i.id = ? AND i.company_id = ?`,
    id, companyId,
  );
  if (!inv) throw notFound('Invoice');
  const lines = q.all(db, 'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY position, id', inv.id);
  return { ...inv, lines, print_url: signPath(`/api/invoices/${inv.id}/html`, 3600) };
}

/** Weekly invoices built from completed trips, editable by HR/supervisors before approval. */
export default function invoiceRoutes(db) {
  const r = Router();

  r.get('/', requireRole(OFFICE), (req, res) => {
    const status = oneOf(req.query.status, 'status', ['draft', 'approved', 'paid']);
    const rows = status
      ? q.all(db, 'SELECT * FROM invoices WHERE company_id = ? AND status = ? ORDER BY week_start DESC, id DESC', req.user.company_id, status)
      : q.all(db, 'SELECT * FROM invoices WHERE company_id = ? ORDER BY week_start DESC, id DESC', req.user.company_id);
    res.json(rows);
  });

  // Preview the completed, not-yet-invoiced trips for a week before generating.
  r.get('/uninvoiced', requireRole(OFFICE), (req, res) => {
    const start = weekStart(date(req.query.week_start, 'week_start') || todayLocal());
    const trips = q.all(
      db,
      `SELECT t.id, t.completed_at, t.weight_tons, t.ticket_number, u.name AS driver_name, v.plate_number, s.name AS site_name
       FROM trips t JOIN users u ON u.id = t.driver_id LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN sites s ON s.id = t.site_id
       WHERE t.company_id = ? AND t.status = 'completed' AND t.invoice_id IS NULL AND date(t.completed_at, '+3 hours') BETWEEN ? AND ?
       ORDER BY t.completed_at`,
      req.user.company_id, start, addDays(start, 6),
    );
    res.json({ week_start: start, week_end: addDays(start, 6), trips });
  });

  r.post('/generate', requireRole(MANAGERS), (req, res) => {
    const cid = req.user.company_id;
    const start = weekStart(date(req.body.week_start, 'week_start', { required: true }));
    const end = addDays(start, 6);
    const clientName = str(req.body.client_name, 'client_name', { required: true, max: 120 });
    const pricing = oneOf(req.body.pricing, 'pricing', ['per_trip', 'per_ton'], { required: true });
    const unitPrice = toHalalas(num(req.body.unit_price, 'unit_price', { required: true, min: 0, max: 1_000_000 }));
    const siteId = num(req.body.site_id, 'site_id', { integer: true });

    const trips = q.all(
      db,
      `SELECT t.*, u.name AS driver_name, v.plate_number, s.name AS site_name FROM trips t
       JOIN users u ON u.id = t.driver_id LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN sites s ON s.id = t.site_id
       WHERE t.company_id = ? AND t.status = 'completed' AND t.invoice_id IS NULL
         AND date(t.completed_at, '+3 hours') BETWEEN ? AND ? ${siteId != null ? 'AND t.site_id = ?' : ''}
       ORDER BY t.completed_at`,
      ...[cid, start, end, ...(siteId != null ? [siteId] : [])],
    );
    if (!trips.length) throw new HttpError(400, 'NO_TRIPS', 'No completed trips to invoice for this week');
    if (pricing === 'per_ton') {
      const missing = trips.filter((t) => t.weight_tons == null).map((t) => t.id);
      if (missing.length) throw new HttpError(400, 'MISSING_WEIGHTS', 'Some trips have no weight recorded', { trip_ids: missing });
    }

    const id = tx(db, () => {
      const info = q.run(
        db,
        'INSERT INTO invoices (company_id, client_name, client_vat_number, week_start, week_end, currency, vat_rate, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
        cid, clientName, str(req.body.client_vat_number, 'client_vat_number', { max: 20 }), start, end, config.currency, config.vatRate,
        str(req.body.notes, 'notes', { max: 500 }), req.user.id,
      );
      const invoiceId = Number(info.lastInsertRowid);
      trips.forEach((t, i) => {
        const day = new Date(t.completed_at).toLocaleDateString('en-CA', { timeZone: config.timeZone });
        const qty = pricing === 'per_ton' ? t.weight_tons : 1;
        const desc = [`${day}`, t.plate_number, t.driver_name, t.site_name, t.ticket_number ? `#${t.ticket_number}` : null].filter(Boolean).join(' · ');
        q.run(
          db,
          'INSERT INTO invoice_lines (invoice_id, trip_id, description, quantity, unit, unit_price, amount, position) VALUES (?,?,?,?,?,?,?,?)',
          invoiceId, t.id, desc, qty, pricing === 'per_ton' ? 'ton' : 'trip', unitPrice, Math.round(qty * unitPrice), i,
        );
        q.run(db, 'UPDATE trips SET invoice_id = ? WHERE id = ?', invoiceId, t.id);
      });
      recalc(db, invoiceId);
      return invoiceId;
    });
    res.status(201).json(loadInvoice(db, cid, id));
  });

  r.get('/:id', requireRole(OFFICE), (req, res) => res.json(loadInvoice(db, req.user.company_id, Number(req.params.id))));

  // Edit header and lines of a draft. `lines` replaces all lines when provided.
  r.patch('/:id', requireRole(MANAGERS), (req, res) => {
    const inv = loadInvoice(db, req.user.company_id, Number(req.params.id));
    if (inv.status !== 'draft') throw new HttpError(409, 'INVOICE_LOCKED', 'Only draft invoices can be edited');
    tx(db, () => {
      q.run(
        db,
        'UPDATE invoices SET client_name=?, client_vat_number=?, notes=? WHERE id=?',
        req.body.client_name !== undefined ? str(req.body.client_name, 'client_name', { required: true, max: 120 }) : inv.client_name,
        req.body.client_vat_number !== undefined ? str(req.body.client_vat_number, 'client_vat_number', { max: 20 }) : inv.client_vat_number,
        req.body.notes !== undefined ? str(req.body.notes, 'notes', { max: 500 }) : inv.notes,
        inv.id,
      );
      if (Array.isArray(req.body.lines)) {
        const existingTrips = new Map(inv.lines.map((l) => [l.id, l.trip_id]));
        const keptTrips = new Set();
        q.run(db, 'DELETE FROM invoice_lines WHERE invoice_id = ?', inv.id);
        req.body.lines.slice(0, 500).forEach((l, i) => {
          const qty = num(l.quantity, 'quantity', { required: true, min: 0, max: 100000 });
          const price = toHalalas(num(l.unit_price, 'unit_price', { required: true, min: 0, max: 1_000_000 }));
          const tripId = l.id != null ? existingTrips.get(Number(l.id)) ?? null : null;
          if (tripId) keptTrips.add(tripId);
          q.run(
            db,
            'INSERT INTO invoice_lines (invoice_id, trip_id, description, quantity, unit, unit_price, amount, position) VALUES (?,?,?,?,?,?,?,?)',
            inv.id, tripId, str(l.description, 'description', { required: true, max: 300 }), qty,
            oneOf(l.unit, 'unit', ['trip', 'ton', 'item']) || 'item', price, Math.round(qty * price), i,
          );
        });
        // Trips whose lines were removed become available for another invoice.
        for (const tripId of existingTrips.values()) {
          if (tripId && !keptTrips.has(tripId)) q.run(db, 'UPDATE trips SET invoice_id = NULL WHERE id = ?', tripId);
        }
      }
      recalc(db, inv.id);
    });
    res.json(loadInvoice(db, req.user.company_id, inv.id));
  });

  r.post('/:id/approve', requireRole(MANAGERS), (req, res) => {
    const inv = loadInvoice(db, req.user.company_id, Number(req.params.id));
    if (inv.status !== 'draft') throw new HttpError(409, 'INVOICE_LOCKED', 'Invoice is already approved');
    if (!inv.lines.length) throw new HttpError(400, 'EMPTY_INVOICE', 'Add at least one line');
    tx(db, () => {
      const year = todayLocal().slice(0, 4);
      const last = q.get(db, "SELECT number FROM invoices WHERE company_id = ? AND number LIKE ? ORDER BY number DESC LIMIT 1", req.user.company_id, `INV-${year}-%`);
      const seq = last ? Number(last.number.split('-')[2]) + 1 : 1;
      q.run(db, "UPDATE invoices SET status='approved', number=?, approved_by=?, approved_at=?, updated_at=? WHERE id=?", `INV-${year}-${String(seq).padStart(4, '0')}`, req.user.id, nowIso(), nowIso(), inv.id);
    });
    res.json(loadInvoice(db, req.user.company_id, inv.id));
  });

  r.post('/:id/mark-paid', requireRole(MANAGERS), (req, res) => {
    const inv = loadInvoice(db, req.user.company_id, Number(req.params.id));
    if (inv.status !== 'approved') throw new HttpError(409, 'INVOICE_NOT_APPROVED', 'Approve the invoice first');
    q.run(db, "UPDATE invoices SET status='paid', paid_at=?, updated_at=? WHERE id=?", nowIso(), nowIso(), inv.id);
    res.json(loadInvoice(db, req.user.company_id, inv.id));
  });

  r.delete('/:id', requireRole(MANAGERS), (req, res) => {
    const inv = loadInvoice(db, req.user.company_id, Number(req.params.id));
    if (inv.status !== 'draft') throw new HttpError(409, 'INVOICE_LOCKED', 'Only draft invoices can be deleted');
    tx(db, () => {
      q.run(db, 'UPDATE trips SET invoice_id = NULL WHERE invoice_id = ?', inv.id);
      q.run(db, 'DELETE FROM invoices WHERE id = ?', inv.id);
    });
    res.json({ ok: true });
  });

  return r;
}

/** Printable invoice page (signed link), mounted before authentication. */
export function invoiceHtmlRoute(db) {
  const r = Router();
  r.get('/:id/html', (req, res) => {
    if (!verifySignedPath(req)) throw new HttpError(403, 'LINK_EXPIRED', 'Link expired');
    const inv = q.get(db, 'SELECT * FROM invoices WHERE id = ?', Number(req.params.id));
    if (!inv) throw notFound('Invoice');
    const lines = q.all(db, 'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY position, id', inv.id);
    const company = q.get(db, 'SELECT * FROM companies WHERE id = ?', inv.company_id);
    res.set('Cache-Control', 'no-store');
    // Allow the page's inline styles and its single print button handler.
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src-attr 'unsafe-inline'; img-src 'self' data:");
    res.type('html').send(renderInvoicePage({ inv, lines, company }));
  });
  return r;
}
