import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { api } from './api';
import { startBackgroundTracking, stopBackgroundTracking } from './backgroundLocation';
import type { Trip } from './types';

type Point = { lat: number; lng: number; accuracy: number | null; recorded_at: string };
export type TrackingStatus = 'off' | 'on' | 'background' | 'denied';

/**
 * Shares the driver's location while a trip is active.
 * - Native builds with "Always" permission: background task (keeps working when the app is closed).
 * - Otherwise (web, Expo Go, "While using" permission): foreground watcher while this screen is open.
 * Points are buffered and sent in batches, so short signal drops on the road don't lose data.
 */
export function useTripTracking(trip: Trip | null, onUpdate: (t: Trip) => void, notification: { title: string; body: string }) {
  const [status, setStatus] = useState<TrackingStatus>('off');
  const buffer = useRef<Point[]>([]);
  const lastSent = useRef(0);
  const active = trip && (trip.status === 'en_route' || trip.status === 'arrived') ? trip.id : null;
  const onUpdateRef = useRef(onUpdate);
  const notificationRef = useRef(notification);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    notificationRef.current = notification;
  }, [onUpdate, notification]);

  useEffect(() => {
    if (!active) {
      // Trip finished or cancelled: make sure the background task is not left running.
      stopBackgroundTracking();
      return undefined;
    }
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    async function flush(force = false) {
      if (!buffer.current.length) return;
      if (!force && Date.now() - lastSent.current < 20_000) return;
      const points = buffer.current.splice(0, buffer.current.length);
      lastSent.current = Date.now();
      try {
        const updated = await api<Trip>(`/trips/${active}/location`, { method: 'POST', body: { points } });
        onUpdateRef.current(updated);
      } catch {
        // Keep the points for the next attempt (bounded so memory can't grow forever).
        buffer.current = [...points, ...buffer.current].slice(-200);
      }
    }

    (async () => {
      const bg = await startBackgroundTracking(active, notificationRef.current);
      if (cancelled) return;
      if (bg === 'background') {
        setStatus('background');
        return;
      }
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!perm.granted) {
        setStatus('denied');
        return;
      }
      setStatus('on');
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: 15_000 },
        (loc) => {
          buffer.current.push({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? null, recorded_at: new Date(loc.timestamp).toISOString() });
          flush(buffer.current.length === 1 && lastSent.current === 0);
        },
      );
      if (cancelled) sub.remove();
    })().catch(() => setStatus('denied'));

    const timer = setInterval(() => flush(true), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub?.remove();
      flush(true);
    };
  }, [active]);

  async function sendNow() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted || !active) return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const updated = await api<Trip>(`/trips/${active}/location`, {
      method: 'POST',
      body: { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy },
    });
    onUpdateRef.current(updated);
    return updated;
  }

  return { status: active ? status : 'off', sendNow };
}
