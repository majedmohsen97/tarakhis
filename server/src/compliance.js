import { config } from './config.js';
import { q } from './db.js';
import { todayLocal, daysBetween } from './util.js';

export const DOC_TYPES = {
  driver: ['national_id', 'iqama', 'driving_license', 'health_certificate', 'other'],
  vehicle: ['vehicle_registration', 'insurance', 'operating_card', 'landfill_permit', 'other'],
  company: ['commercial_registration', 'waste_transporter_qualification', 'mwan_license', 'landfill_permit', 'other'],
};

/**
 * What a truck needs to pass the landfill gate. Each requirement is satisfied by ANY of the listed
 * document types on the given owner(s).
 */
export const GATE_REQUIREMENTS = [
  { key: 'identity', owner: ['driver'], types: ['national_id', 'iqama'] },
  { key: 'driving_license', owner: ['driver'], types: ['driving_license'] },
  { key: 'vehicle_registration', owner: ['vehicle'], types: ['vehicle_registration'] },
  { key: 'insurance', owner: ['vehicle'], types: ['insurance'] },
  { key: 'landfill_permit', owner: ['vehicle', 'company'], types: ['landfill_permit'], siteSpecific: true },
];

/** valid | expiring | expired | pending | rejected */
export function docState(doc, today = todayLocal()) {
  if (doc.status === 'rejected') return 'rejected';
  if (doc.status === 'pending') return 'pending';
  if (!doc.expiry_date) return 'valid';
  const left = daysBetween(today, doc.expiry_date);
  if (left < 0) return 'expired';
  if (left <= config.expiringSoonDays) return 'expiring';
  return 'valid';
}

export function withState(doc, today = todayLocal()) {
  const state = docState(doc, today);
  const days_left = doc.expiry_date ? daysBetween(today, doc.expiry_date) : null;
  return { ...doc, state, days_left };
}

const STATE_RANK = { valid: 5, expiring: 4, pending: 3, expired: 2, rejected: 1 };

function bestDoc(docs) {
  // Prefer a usable document; among equals prefer the latest expiry.
  return [...docs].sort((a, b) => {
    const r = STATE_RANK[b.state] - STATE_RANK[a.state];
    if (r) return r;
    return String(b.expiry_date || '9999').localeCompare(String(a.expiry_date || '9999'));
  })[0];
}

/**
 * Evaluates whether a driver (with a vehicle) may enter a site right now.
 * Returns { verdict: 'allowed'|'denied', checks: [...], reasons: [...], warnings: [...] }.
 */
export function evaluateGate(db, { companyId, driverId, vehicleId, siteId }) {
  const today = todayLocal();
  const reasons = [];
  const warnings = [];

  const driver = q.get(db, 'SELECT id, active FROM users WHERE id = ? AND company_id = ? AND role = ?', driverId, companyId, 'driver');
  if (!driver) return { verdict: 'denied', checks: [], reasons: [{ code: 'DRIVER_NOT_FOUND' }], warnings };
  if (!driver.active) reasons.push({ code: 'DRIVER_INACTIVE' });

  let vehicle = null;
  if (vehicleId) {
    vehicle = q.get(db, 'SELECT id, active FROM vehicles WHERE id = ? AND company_id = ?', vehicleId, companyId);
  }
  if (!vehicle) reasons.push({ code: 'NO_VEHICLE' });
  else if (!vehicle.active) reasons.push({ code: 'VEHICLE_INACTIVE' });

  const owners = { driver: driverId, vehicle: vehicle?.id ?? -1, company: companyId };
  const docs = q
    .all(
      db,
      `SELECT id, owner_type, owner_id, doc_type, number, expiry_date, status, site_id FROM documents
       WHERE company_id = ? AND ((owner_type='driver' AND owner_id=?) OR (owner_type='vehicle' AND owner_id=?) OR (owner_type='company' AND owner_id=?))`,
      companyId, owners.driver, owners.vehicle, owners.company,
    )
    .map((d) => withState(d, today));

  const checks = GATE_REQUIREMENTS.map((req) => {
    const candidates = docs.filter(
      (d) => req.owner.includes(d.owner_type) && req.types.includes(d.doc_type) && (!req.siteSpecific || !siteId || !d.site_id || d.site_id === siteId),
    );
    const doc = candidates.length ? bestDoc(candidates) : null;
    const state = doc ? doc.state : 'missing';
    const ok = state === 'valid' || state === 'expiring';
    if (!ok) reasons.push({ code: `DOC_${state.toUpperCase()}`, requirement: req.key, doc_type: doc?.doc_type ?? req.types[0], expiry_date: doc?.expiry_date ?? null });
    else if (state === 'expiring') warnings.push({ code: 'DOC_EXPIRING', requirement: req.key, doc_type: doc.doc_type, expiry_date: doc.expiry_date, days_left: doc.days_left });
    return { requirement: req.key, doc_type: doc?.doc_type ?? req.types[0], state, expiry_date: doc?.expiry_date ?? null, days_left: doc?.days_left ?? null, ok };
  });

  const scheduled = q.get(db, 'SELECT id FROM schedule_entries WHERE company_id = ? AND driver_id = ? AND date = ?', companyId, driverId, today);
  if (!scheduled) warnings.push({ code: 'NOT_SCHEDULED_TODAY' });

  return { verdict: reasons.length ? 'denied' : 'allowed', checks, reasons, warnings };
}

/** Compliance summary for one owner (driver or vehicle) — used on profile screens. */
export function ownerCompliance(db, companyId, ownerType, ownerId) {
  const today = todayLocal();
  const docs = q
    .all(db, 'SELECT * FROM documents WHERE company_id = ? AND owner_type = ? AND owner_id = ? ORDER BY created_at DESC', companyId, ownerType, ownerId)
    .map((d) => withState(d, today));
  const required = GATE_REQUIREMENTS.filter((r) => r.owner.includes(ownerType) && !(ownerType === 'vehicle' && r.key === 'landfill_permit'));
  const missing = required.filter((r) => !docs.some((d) => r.types.includes(d.doc_type) && (d.state === 'valid' || d.state === 'expiring'))).map((r) => r.key);
  return { docs, missing };
}
