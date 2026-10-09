import { useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { notify } from '@/lib/dialog';
import { space } from '@/lib/theme';
import type { Site } from '@/lib/types';
import { Button, Card, Field, Row, Screen, Txt } from '@/components/ui';

/** Add or edit a landfill / transfer station. The radius is the geofence used to detect arrival. */
export default function SiteForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t, errorText } = useI18n();
  const sites = useApi<Site[]>(id ? '/sites' : null);
  const existing = sites.data?.find((x) => String(x.id) === id);
  const base = existing
    ? { name: existing.name, lat: existing.lat != null ? String(existing.lat) : '', lng: existing.lng != null ? String(existing.lng) : '', radius_m: String(existing.radius_m) }
    : { name: '', lat: '', lng: '', radius_m: '400' };
  // Only the fields the user changed; everything else comes from the saved site.
  const [edits, setEdits] = useState<Partial<typeof base>>({});
  const form = { ...base, ...edits };
  const setForm = (fn: (f: typeof base) => typeof base) => setEdits((e) => ({ ...e, ...fn({ ...base, ...e }) }));
  const [busy, setBusy] = useState(false);

  async function useMyLocation() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      notify(t.trip.locationDenied);
      return;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
  }

  async function submit() {
    setBusy(true);
    try {
      const body = { name: form.name, lat: form.lat || null, lng: form.lng || null, radius_m: Number(form.radius_m) || 400 };
      await api(id ? `/sites/${id}` : '/sites', { method: id ? 'PATCH' : 'POST', body });
      router.back();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: id ? form.name || t.fleet.sites : t.fleet.addSite }} />
      <Card style={{ padding: space.lg }}>
        <Field label={t.fleet.siteName} placeholder="مردم ..." value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
        <Row gap={space.sm}>
          <Field label={t.fleet.lat} value={form.lat} onChangeText={(v) => setForm((f) => ({ ...f, lat: v }))} keyboardType="decimal-pad" ltr style={{ minWidth: 120 }} />
          <Field label={t.fleet.lng} value={form.lng} onChangeText={(v) => setForm((f) => ({ ...f, lng: v }))} keyboardType="decimal-pad" ltr style={{ minWidth: 120 }} />
        </Row>
        <Button small variant="secondary" icon="locate-outline" label={t.fleet.useMyLocation} onPress={useMyLocation} style={{ marginBottom: space.md }} />
        <Field label={t.fleet.radius} value={form.radius_m} onChangeText={(v) => setForm((f) => ({ ...f, radius_m: v }))} keyboardType="number-pad" ltr />
        <Txt variant="small" style={{ marginBottom: space.md }}>{t.fleet.radiusHint}</Txt>
        <Button label={t.common.save} onPress={submit} loading={busy} disabled={!form.name} />
      </Card>
    </Screen>
  );
}
