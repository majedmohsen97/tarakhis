import { Router } from 'express';
import { q } from '../db.js';
import { generateExpiryNotifications, sendPush } from '../notify.js';

/** Creates due reminders and pushes them to phones in the background. */
export function runReminders(db) {
  try {
    const created = generateExpiryNotifications(db);
    if (created.length) sendPush(created).catch(() => {});
    return created.length;
  } catch (err) {
    console.error('Reminder check failed:', err.message);
    return 0;
  }
}

export default function notificationRoutes(db) {
  const r = Router();

  // Latest notifications for the signed-in user, newest first.
  r.get('/', (req, res) => {
    const items = q.all(
      db,
      `SELECT id, kind, document_id, milestone, doc_type, owner_type, owner_id, owner_name, expiry_date, days_left, created_at, read_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
      req.user.id,
    );
    const unread = q.get(db, 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user.id).n;
    res.json({ unread, items });
  });

  r.get('/unread-count', (req, res) => {
    res.json({ unread: q.get(db, 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user.id).n });
  });

  // Mark specific notifications ({ ids: [...] }) or all of them ({}) as read.
  r.post('/read', (req, res) => {
    const now = new Date().toISOString();
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 200) : null;
    if (ids?.length) {
      for (const id of ids) q.run(db, 'UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now, id, req.user.id);
    } else {
      q.run(db, 'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now, req.user.id);
    }
    res.json({ ok: true });
  });

  return r;
}
