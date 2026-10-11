import { Router } from 'express';
import { q } from '../db.js';
import { OFFICE, requireRole, signPath, verifySignedPath } from '../auth.js';
import { DOC_TYPES, withState } from '../compliance.js';
import { config } from '../config.js';
import { uploader, resolveUpload, removeUpload } from '../uploads.js';
import { notifyPendingDocument, sendPush } from '../notify.js';
import { runReminders } from './notifications.js';
import { HttpError, str, oneOf, date, num, notFound, forbidden, todayLocal, addDays, nowIso } from '../util.js';

export function serializeDoc(d) {
  return {
    id: d.id,
    owner_type: d.owner_type,
    owner_id: d.owner_id,
    owner_name: d.owner_name ?? null,
    doc_type: d.doc_type,
    number: d.number,
    issue_date: d.issue_date,
    expiry_date: d.expiry_date,
    site_id: d.site_id,
    status: d.status,
    state: d.state,
    days_left: d.days_left,
    notes: d.notes,
    file_url: d.file_path ? signPath(`/api/documents/${d.id}/file`, 3600) : null,
    file_mime: d.file_mime,
    file_name: d.file_name,
    created_at: d.created_at,
    reviewed_at: d.reviewed_at,
  };
}

const OWNER_NAME_SQL = `
  CASE d.owner_type
    WHEN 'driver' THEN (SELECT name FROM users WHERE id = d.owner_id)
    WHEN 'vehicle' THEN (SELECT plate_number FROM vehicles WHERE id = d.owner_id)
    ELSE (SELECT name FROM companies WHERE id = d.owner_id)
  END`;

export default function documentRoutes(db) {
  const r = Router();
  const upload = uploader();

  function assertOwner(req, ownerType, ownerId) {
    const cid = req.user.company_id;
    const exists =
      ownerType === 'driver'
        ? q.get(db, 'SELECT 1 FROM users WHERE id = ? AND company_id = ?', ownerId, cid)
        : ownerType === 'vehicle'
          ? q.get(db, 'SELECT 1 FROM vehicles WHERE id = ? AND company_id = ?', ownerId, cid)
          : ownerId === cid;
    if (!exists) throw notFound(ownerType);
  }

  // Drivers see their own documents (and their assigned vehicle's); office staff see everything.
  r.get('/', (req, res) => {
    const cid = req.user.company_id;
    const where = ['d.company_id = ?'];
    const params = [cid];
    if (!OFFICE.includes(req.user.role)) {
      // Drivers and gate staff see their own documents (and their assigned truck's).
      where.push("((d.owner_type = 'driver' AND d.owner_id = ?) OR (d.owner_type = 'vehicle' AND d.owner_id = ?))");
      params.push(req.user.id, req.user.default_vehicle_id ?? -1);
    }
    const ownerType = oneOf(req.query.owner_type, 'owner_type', ['driver', 'vehicle', 'company']);
    if (ownerType) { where.push('d.owner_type = ?'); params.push(ownerType); }
    const ownerId = num(req.query.owner_id, 'owner_id', { integer: true });
    if (ownerId != null) { where.push('d.owner_id = ?'); params.push(ownerId); }
    const status = oneOf(req.query.status, 'status', ['pending', 'approved', 'rejected']);
    if (status) { where.push('d.status = ?'); params.push(status); }
    // filter=attention → pending, expired or expiring soon
    if (req.query.filter === 'attention') {
      where.push("(d.status = 'pending' OR (d.status = 'approved' AND d.expiry_date IS NOT NULL AND d.expiry_date <= ?))");
      params.push(addDays(todayLocal(), config.expiringSoonDays));
    }
    const rows = q.all(
      db,
      `SELECT d.*, ${OWNER_NAME_SQL} AS owner_name FROM documents d WHERE ${where.join(' AND ')}
       ORDER BY CASE d.status WHEN 'pending' THEN 0 ELSE 1 END, d.expiry_date IS NULL, d.expiry_date, d.created_at DESC LIMIT 500`,
      ...params,
    );
    const today = todayLocal();
    res.json(rows.map((d) => serializeDoc(withState(d, today))));
  });

  r.get('/types', (_req, res) => res.json(DOC_TYPES));

  r.post('/', upload.single('file'), (req, res) => {
    try {
      const ownerType = oneOf(req.body.owner_type, 'owner_type', ['driver', 'vehicle', 'company'], { required: true });
      const ownerId = ownerType === 'company' ? req.user.company_id : num(req.body.owner_id, 'owner_id', { required: true, integer: true });
      const isOffice = OFFICE.includes(req.user.role);
      if (!isOffice) {
        // Drivers can only upload for themselves or their assigned truck.
        const own = (ownerType === 'driver' && ownerId === req.user.id) || (ownerType === 'vehicle' && ownerId === req.user.default_vehicle_id);
        if (!own) throw forbidden();
      }
      assertOwner(req, ownerType, ownerId);
      const docType = oneOf(req.body.doc_type, 'doc_type', DOC_TYPES[ownerType], { required: true });
      const siteId = num(req.body.site_id, 'site_id', { integer: true });
      if (siteId != null && !q.get(db, 'SELECT 1 FROM sites WHERE id = ? AND company_id = ?', siteId, req.user.company_id)) throw notFound('Site');
      const expiry = date(req.body.expiry_date, 'expiry_date');
      const issue = date(req.body.issue_date, 'issue_date');
      if (!req.file && !expiry) throw new HttpError(400, 'FILE_OR_EXPIRY_REQUIRED', 'Attach a file or enter the expiry date');
      // Uploads by safety/HR staff are trusted as reviewed; driver uploads wait for review.
      const status = isOffice ? 'approved' : 'pending';
      const info = q.run(
        db,
        `INSERT INTO documents (company_id, owner_type, owner_id, doc_type, number, issue_date, expiry_date, site_id, file_path, file_mime, file_name, status, notes, uploaded_by, reviewed_by, reviewed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        req.user.company_id, ownerType, ownerId, docType, str(req.body.number, 'number', { max: 40 }), issue, expiry, siteId,
        req.file?.filename ?? null, req.file?.mimetype ?? null, req.file ? str(req.file.originalname, 'file_name', { max: 200 }) : null,
        status, str(req.body.notes, 'notes', { max: 500 }), req.user.id, isOffice ? req.user.id : null, isOffice ? nowIso() : null,
      );
      const doc = q.get(db, `SELECT d.*, ${OWNER_NAME_SQL} AS owner_name FROM documents d WHERE d.id = ?`, info.lastInsertRowid);
      // Office is told about uploads waiting for review; a document that is already close to
      // expiry gets its reminder right away instead of at the next hourly check.
      if (status === 'pending') sendPush(notifyPendingDocument(db, doc)).catch(() => {});
      else runReminders(db);
      res.status(201).json(serializeDoc(withState(doc)));
    } catch (err) {
      if (req.file) removeUpload(req.file.filename);
      throw err;
    }
  });

  r.patch('/:id', requireRole(OFFICE), (req, res) => {
    const d = q.get(db, 'SELECT * FROM documents WHERE id = ? AND company_id = ?', Number(req.params.id), req.user.company_id);
    if (!d) throw notFound('Document');
    const status = req.body.status !== undefined ? oneOf(req.body.status, 'status', ['pending', 'approved', 'rejected']) : d.status;
    const reviewed = status !== d.status;
    q.run(
      db,
      'UPDATE documents SET status=?, number=?, issue_date=?, expiry_date=?, notes=?, reviewed_by=?, reviewed_at=? WHERE id=?',
      status,
      req.body.number !== undefined ? str(req.body.number, 'number', { max: 40 }) : d.number,
      req.body.issue_date !== undefined ? date(req.body.issue_date, 'issue_date') : d.issue_date,
      req.body.expiry_date !== undefined ? date(req.body.expiry_date, 'expiry_date') : d.expiry_date,
      req.body.notes !== undefined ? str(req.body.notes, 'notes', { max: 500 }) : d.notes,
      reviewed ? req.user.id : d.reviewed_by,
      reviewed ? nowIso() : d.reviewed_at,
      d.id,
    );
    const doc = q.get(db, `SELECT d.*, ${OWNER_NAME_SQL} AS owner_name FROM documents d WHERE d.id = ?`, d.id);
    runReminders(db);
    res.json(serializeDoc(withState(doc)));
  });

  r.delete('/:id', requireRole(OFFICE), (req, res) => {
    const d = q.get(db, 'SELECT * FROM documents WHERE id = ? AND company_id = ?', Number(req.params.id), req.user.company_id);
    if (!d) throw notFound('Document');
    q.run(db, 'DELETE FROM documents WHERE id = ?', d.id);
    removeUpload(d.file_path);
    res.json({ ok: true });
  });

  return r;
}

/** Signed-URL file download, mounted before authentication. */
export function documentFileRoute(db) {
  const r = Router();
  r.get('/:id/file', (req, res) => {
    if (!verifySignedPath(req)) throw new HttpError(403, 'LINK_EXPIRED', 'Link expired');
    const d = q.get(db, 'SELECT file_path, file_mime, file_name FROM documents WHERE id = ?', Number(req.params.id));
    const file = resolveUpload(d?.file_path);
    if (!file) throw notFound('File');
    res.set('Cache-Control', 'private, max-age=600');
    res.type(d.file_mime || 'application/octet-stream');
    res.sendFile(file);
  });
  return r;
}
