import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from './api';

// Device notifications:
// - Android/iOS builds: real push from the server (works when the app is closed) once the app has
//   an EAS project id; otherwise local notifications while the app runs.
// - Web: browser notifications while the page is open.

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
}

let pushToken: string | null = null;
/** True when the server can push to this device, so local duplicates are not needed. */
export const hasServerPush = () => pushToken !== null;

const hasWebNotifications = () => typeof globalThis.Notification !== 'undefined';

async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', { name: 'Tarakhis', importance: Notifications.AndroidImportance.HIGH });
  }
}

export async function getPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') {
    if (!hasWebNotifications()) return 'unsupported';
    const p = globalThis.Notification.permission;
    return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'default';
  }
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain ? 'default' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Sends this device's push token to the server (no-op on web, Expo Go or without an EAS project). */
export async function registerPushToken() {
  if (Platform.OS === 'web') return;
  try {
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId || !(await Notifications.getPermissionsAsync()).granted) return;
    await ensureChannel();
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/auth/me/push-token', { method: 'POST', body: { token: data } });
    pushToken = data;
  } catch {
    // Expo Go (no remote push on Android) or offline — local notifications still work.
  }
}

/** Stops pushes to this device for the account that is signing out. */
export async function unregisterPushToken() {
  if (!pushToken) return;
  pushToken = null;
  await api('/auth/me/push-token', { method: 'POST', body: { token: null } }).catch(() => {});
}

export async function enableNotifications(): Promise<PermissionState> {
  if (Platform.OS === 'web') {
    if (!hasWebNotifications()) return 'unsupported';
    const r = await globalThis.Notification.requestPermission();
    return r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'default';
  }
  try {
    await ensureChannel();
    const r = await Notifications.requestPermissionsAsync();
    if (!r.granted) return r.canAskAgain ? 'default' : 'denied';
    await registerPushToken();
    return 'granted';
  } catch {
    return 'unsupported';
  }
}

/** Shows a notification immediately on this device (used while the app is open). */
export async function showLocal(title: string, body: string) {
  if (Platform.OS === 'web') {
    if (hasWebNotifications() && globalThis.Notification.permission === 'granted') {
      new globalThis.Notification(title, { body, icon: '/icons/icon-192.png' });
    }
    return;
  }
  try {
    if ((await Notifications.getPermissionsAsync()).granted) {
      await Notifications.scheduleNotificationAsync({ content: { title, body, data: { screen: 'notifications' } }, trigger: null });
    }
  } catch {
    // ignore
  }
}
