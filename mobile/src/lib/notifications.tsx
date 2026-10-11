import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { useAuth } from './auth';
import { useI18n } from './i18n';
import { hasServerPush, registerPushToken, showLocal } from './push';

export type NotificationItem = {
  id: number;
  kind: 'doc_expiry' | 'doc_pending';
  document_id: number | null;
  milestone: string | null;
  doc_type: string;
  owner_type: 'driver' | 'vehicle' | 'company';
  owner_name: string | null;
  expiry_date: string | null;
  days_left: number | null;
  created_at: string;
  read_at: string | null;
};

type Dict = ReturnType<typeof useI18n>['t'];

/** Title and body for a notification, in the current app language. */
export function notificationText(t: Dict, n: NotificationItem) {
  const doc = t.docTypes[n.doc_type] ?? n.doc_type;
  if (n.kind === 'doc_pending') return { title: t.notif.pending, body: [doc, n.owner_name].filter(Boolean).join(' · ') };
  const title = n.days_left != null && n.days_left < 0 ? t.notif.expired(doc) : t.notif.expiresIn(doc, n.days_left ?? 0);
  return { title, body: [n.owner_name, n.expiry_date].filter(Boolean).join(' · ') };
}

type Value = { unread: number; refresh: () => Promise<void> };
const Ctx = createContext<Value>({ unread: 0, refresh: async () => {} });

const POLL_MS = 60_000;

/**
 * Keeps the unread count fresh for the bell badge. When new reminders arrive while the app is
 * open, shows them as device notifications (unless the server already pushes to this phone).
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [unread, setUnread] = useState(0);
  const lastSeen = useRef<string | null>(null);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ unread: number; items: NotificationItem[] }>('/notifications');
      setUnread(res.unread);
      const newest = res.items[0]?.created_at ?? null;
      if (lastSeen.current !== null && !hasServerPush()) {
        const fresh = res.items.filter((n) => !n.read_at && n.created_at > (lastSeen.current as string)).slice(0, 3);
        for (const n of fresh.reverse()) {
          const { title, body } = notificationText(tRef.current, n);
          showLocal(title, body);
        }
      }
      if (newest) lastSeen.current = newest > (lastSeen.current ?? '') ? newest : lastSeen.current;
      else if (lastSeen.current === null) lastSeen.current = '';
    } catch {
      // offline — try again on the next tick
    }
  }, []);

  useEffect(() => {
    if (!user) {
      lastSeen.current = null;
      return undefined;
    }
    registerPushToken();
    const first = setTimeout(refresh, 0);
    const id = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [user, refresh]);

  // Tapping a phone notification opens the notifications screen.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const sub = Notifications.addNotificationResponseReceivedListener(() => router.push('/notifications'));
    return () => sub.remove();
  }, []);

  const value = useMemo(() => ({ unread: user ? unread : 0, refresh }), [unread, refresh, user]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotifications = () => useContext(Ctx);
