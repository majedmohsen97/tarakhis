import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { apiUrl, loadServerUrl } from './api';
import { storage } from './storage';

// Shares the truck's location during an active trip even when the app is in the background or
// the phone is locked (Android shows a persistent notification while this runs). Only works in
// real builds (EAS / development build) — Expo Go and web fall back to foreground tracking.

export const TRIP_LOCATION_TASK = 'tarakhis-trip-location';
const TRIP_KEY = 'tarakhis.activeTrip';
const TOKEN_KEY = 'tarakhis.token';
const PENDING_KEY = 'tarakhis.pendingPoints';
// SecureStore values should stay small (~2 KB), so only the latest unsent points are kept.
const MAX_PENDING = 15;

type Point = { lat: number; lng: number; accuracy: number | null; recorded_at: string };

async function readPending(): Promise<Point[]> {
  try {
    return JSON.parse((await storage.get(PENDING_KEY)) || '[]');
  } catch {
    return [];
  }
}

if (Platform.OS !== 'web') {
  // Must be defined at module load (imported from index.js) so it exists when the OS wakes the app.
  TaskManager.defineTask(TRIP_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
    if (!locations.length) return;
    const [token, tripId] = await Promise.all([storage.get(TOKEN_KEY), storage.get(TRIP_KEY)]);
    if (!token || !tripId) {
      await stopBackgroundTracking();
      return;
    }
    const fresh: Point[] = locations.map((l) => ({
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      accuracy: l.coords.accuracy ?? null,
      recorded_at: new Date(l.timestamp).toISOString(),
    }));
    const points = [...(await readPending()), ...fresh];
    try {
      // The app may have been launched in the background, so load the saved server first.
      await loadServerUrl();
      const res = await fetch(`${apiUrl()}/api/trips/${tripId}/location`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      });
      if (res.ok) {
        await storage.remove(PENDING_KEY);
      } else if ([401, 403, 404, 409].includes(res.status)) {
        // Trip finished/cancelled, consent withdrawn or signed out: stop sharing.
        await stopBackgroundTracking();
      }
    } catch {
      // No signal: keep the newest points and send them with the next update.
      await storage.set(PENDING_KEY, JSON.stringify(points.slice(-MAX_PENDING)));
    }
  });
}

export type BackgroundResult = 'background' | 'foreground-only' | 'denied' | 'unsupported';

export async function startBackgroundTracking(tripId: number, notification: { title: string; body: string }): Promise<BackgroundResult> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    if (!(await TaskManager.isAvailableAsync())) return 'unsupported';
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) return 'denied';
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) return 'foreground-only';
    await storage.set(TRIP_KEY, String(tripId));
    if (!(await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK))) {
      await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 30_000,
        distanceInterval: 50,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.AutomotiveNavigation,
        foregroundService: { notificationTitle: notification.title, notificationBody: notification.body, notificationColor: '#0F6B4A' },
      });
    }
    return 'background';
  } catch {
    // e.g. Expo Go on iOS (no background mode) — the screen falls back to foreground tracking.
    return 'unsupported';
  }
}

export async function stopBackgroundTracking() {
  if (Platform.OS === 'web') return;
  await storage.remove(TRIP_KEY);
  await storage.remove(PENDING_KEY);
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
  } catch {
    // Task was never registered (Expo Go / unsupported device).
  }
}
