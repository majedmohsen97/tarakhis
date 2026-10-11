import { q } from './db.js';
import { todayLocal, daysBetween } from './util.js';

// Document expiry reminders. Each document produces at most one notification per milestone per
// recipient, so running the check every hour never repeats a reminder.

export const MILESTONES = [30, 14, 7, 1, 0];

const DOC_NAMES = {
  ar: {
    national_id: 'الهوية الوطنية', iqama: 'الإقامة', driving_license: 'رخصة القيادة', health_certificate: 'الشهادة الصحية',
    vehicle_registration: 'استمارة المركبة', insurance: 'تأمين المركبة', operating_card: 'بطاقة التشغيل', landfill_permit: 'تصريح دخول المردم',
    commercial_registration: 'السجل التجاري', waste_transporter_qualification: 'شهادة تأهيل ناقل النفايات', mwan_license: 'ترخيص المركز الوطني لإدارة النفايات', other: 'مستند',
  },
  en: {
    national_id: 'National ID', iqama: 'Iqama', driving_license: 'Driving licence', health_certificate: 'Health certificate',
    vehicle_registration: 'Vehicle registration', insurance: 'Vehicle insurance', operating_card: 'Operating card', landfill_permit: 'Landfill permit',
    commercial_registration: 'Commercial registration', waste_transporter_qualification: 'Waste transporter qualification', mwan_license: 'MWAN licence', other: 'Document',
  },
};

/** Title and body for a notification in the recipient's language (used for phone push messages). */
export function notificationText(n, lang = 'ar') {
  const ar = lang === 'ar';
  const doc = DOC_NAMES[ar ? 'ar' : 'en'][n.doc_type] || n.doc_type;
  const line = (...parts) => parts.filter(Boolean).join(' · ');
  if (n.kind === 'doc_pending') {
    return { title: ar ? 'مستند جديد بانتظار المراجعة' : 'New document awaiting review', body: line(doc, n.owner_name) };
  }
  if (n.days_left < 0) {
    return { title: ar ? `انتهت صلاحية ${doc}` : `${doc} has expired`, body: line(n.owner_name, n.expiry_date) };
  }
  const when = ar
    ? (n.days_left === 0 ? 'ينتهي اليوم' : n.days_left === 1 ? 'ينتهي غداً' : `ينتهي خلال ${n.days_left === 2 ? "يومين" : n.days_left <= 10 ? `${n.days_left} أيام` : `${n.days_left} يوماً`}`)
    : (n.days_left === 0 ? 'expires today' : n.days_left === 1 ? 'expires tomorrow' : `expires in ${n.days_left} days`);
  return { title: ar ? `${doc}: ${when}` : `${doc} ${when}`, body: line(n.owner_name, n.expiry_date) };
}

function milestoneFor(daysLeft) {
  if (daysLeft < 0) return 'expired';
  const m = [...MILESTONES].sort((a, b) => a - b).find((x) => daysLeft <= x);
  return m === undefined ? null : `d${m}`;
}

function recipients(db, doc) {
  const office = q.all(db, "SELECT id, lang, push_token FROM users WHERE company_id = ? AND active = 1 AND role IN ('owner','manager','safety')", doc.company_id);
  const extra = [];
  if (doc.owner_type === 'driver') {
    const person = q.get(db, 'SELECT id, lang, push_token FROM users WHERE id = ? AND active = 1', doc.owner_id);
    if (person) extra.push(person);
  } else if (doc.owner_type === 'vehicle') {
    extra.push(...q.all(db, "SELECT id, lang, push_token FROM users WHERE default_vehicle_id = ? AND active = 1 AND role = 'driver'", doc.owner_id));
  }
  const seen = new Map();
  for (const u of [...office, ...extra]) seen.set(u.id, u);
  return [...seen.values()];
}

function ownerName(db, doc) {
  if (doc.owner_type === 'driver') return q.get(db, 'SELECT name FROM users WHERE id = ?', doc.owner_id)?.name ?? null;
  if (doc.owner_type === 'vehicle') return q.get(db, 'SELECT plate_number FROM vehicles WHERE id = ?', doc.owner_id)?.plate_number ?? null;
  return null;
}

/** Inserts a notification for each recipient; returns the newly created rows (for push). */
function insert(db, doc, users, fields) {
  const created = [];
  for (const u of users) {
    const info = q.run(
      db,
      `INSERT OR IGNORE INTO notifications (company_id, user_id, kind, document_id, milestone, doc_type, owner_type, owner_id, owner_name, expiry_date, days_left)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      doc.company_id, u.id, fields.kind, doc.id, fields.milestone, doc.doc_type, doc.owner_type, doc.owner_id, fields.owner_name, doc.expiry_date, fields.days_left,
    );
    if (info.changes) created.push({ ...fields, doc_type: doc.doc_type, expiry_date: doc.expiry_date, user: u });
  }
  return created;
}

/** Checks every approved document with an expiry date and creates due reminders. */
export function generateExpiryNotifications(db, today = todayLocal()) {
  const docs = q.all(db, "SELECT * FROM documents WHERE status = 'approved' AND expiry_date IS NOT NULL");
  // Only the newest document of each kind counts — a renewed iqama silences the old one.
  const latest = new Map();
  for (const d of docs) {
    const key = `${d.company_id}:${d.owner_type}:${d.owner_id}:${d.doc_type}:${d.site_id ?? ''}`;
    const cur = latest.get(key);
    if (!cur || d.expiry_date > cur.expiry_date) latest.set(key, d);
  }
  const created = [];
  for (const doc of latest.values()) {
    const days = daysBetween(today, doc.expiry_date);
    const milestone = milestoneFor(days);
    if (!milestone) continue;
    created.push(...insert(db, doc, recipients(db, doc), { kind: 'doc_expiry', milestone, owner_name: ownerName(db, doc), days_left: days }));
  }
  return created;
}

/** Tells office staff that someone uploaded a document that needs review. */
export function notifyPendingDocument(db, doc) {
  const office = q.all(db, "SELECT id, lang, push_token FROM users WHERE company_id = ? AND active = 1 AND role IN ('owner','manager','safety')", doc.company_id);
  return insert(db, doc, office, { kind: 'doc_pending', milestone: 'pending', owner_name: ownerName(db, doc), days_left: null });
}

/**
 * Sends phone push messages through Expo's push service for users who registered a device
 * (Android app builds). Failures are logged and never block the caller.
 */
export async function sendPush(created, fetchImpl = globalThis.fetch) {
  const messages = created
    .filter((n) => n.user.push_token && /^Expo(nent)?PushToken\[/.test(n.user.push_token))
    .map((n) => {
      const { title, body } = notificationText(n, n.user.lang === 'en' ? 'en' : 'ar');
      return { to: n.user.push_token, title, body, sound: 'default', data: { screen: 'notifications' } };
    });
  for (let i = 0; i < messages.length; i += 100) {
    try {
      await fetchImpl('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    } catch (err) {
      console.error('Push send failed:', err.message);
    }
  }
  return messages.length;
}
