import crypto from 'node:crypto';
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new HttpError(400, code, message, details);
export const notFound = (what = 'resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = () => new HttpError(403, 'FORBIDDEN', 'You do not have permission for this action');

// ---------- validation ----------

export function str(value, field, { required = false, max = 200, min = 0 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest('VALIDATION', `${field} is required`, { field });
    return null;
  }
  const s = String(value).trim();
  if (s.length < min) throw badRequest('VALIDATION', `${field} must be at least ${min} characters`, { field });
  if (s.length > max) throw badRequest('VALIDATION', `${field} is too long`, { field });
  if (required && !s) throw badRequest('VALIDATION', `${field} is required`, { field });
  return s || null;
}

export function num(value, field, { required = false, min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest('VALIDATION', `${field} is required`, { field });
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw badRequest('VALIDATION', `${field} is invalid`, { field });
  }
  return n;
}

export function oneOf(value, field, options, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest('VALIDATION', `${field} is required`, { field });
    return null;
  }
  if (!options.includes(value)) throw badRequest('VALIDATION', `${field} must be one of: ${options.join(', ')}`, { field });
  return value;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function date(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest('VALIDATION', `${field} is required`, { field });
    return null;
  }
  const s = String(value);
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw badRequest('VALIDATION', `${field} must be a date (YYYY-MM-DD)`, { field });
  }
  return s;
}

export function bool(value) {
  if (value === undefined || value === null || value === '') return null;
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

/** Normalises Saudi mobile numbers to +9665XXXXXXXX. Accepts 05XXXXXXXX, 5XXXXXXXX, 9665..., +9665... */
export function normalizePhone(value, field = 'phone') {
  const digits = String(value ?? '').replace(/[\s\-()]/g, '').replace(/^\+/, '').replace(/^00/, '');
  // Convert Arabic-Indic digits that users may type on Arabic keyboards.
  const western = digits.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  let local = western;
  if (local.startsWith('966')) local = local.slice(3);
  if (local.startsWith('0')) local = local.slice(1);
  if (!/^5\d{8}$/.test(local)) throw badRequest('INVALID_PHONE', 'Enter a Saudi mobile number like 05XXXXXXXX', { field });
  return `+966${local}`;
}

/** Saudi national ID starts with 1, iqama with 2; both are 10 digits. */
export function validateIdNumber(idType, idNumber) {
  if (!idNumber) return null;
  const n = String(idNumber).trim();
  if (!/^\d{10}$/.test(n)) throw badRequest('INVALID_ID_NUMBER', 'ID number must be 10 digits', { field: 'id_number' });
  if (idType === 'national_id' && !n.startsWith('1')) throw badRequest('INVALID_ID_NUMBER', 'National ID starts with 1', { field: 'id_number' });
  if (idType === 'iqama' && !n.startsWith('2')) throw badRequest('INVALID_ID_NUMBER', 'Iqama number starts with 2', { field: 'id_number' });
  return n;
}

// ---------- dates (company time zone, default Asia/Riyadh) ----------

export function todayLocal(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Saudi work weeks start on Sunday. */
export function weekStart(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return addDays(isoDate, -d.getUTCDay());
}

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
}

export const nowIso = () => new Date().toISOString();

// ---------- misc ----------

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function randomPassword() {
  // 10 chars, avoids look-alike characters, easy to read out over the phone.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export const toHalalas = (sar) => Math.round(Number(sar) * 100);
