import { useState } from 'react';
import { View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useAuth, isManager } from '@/lib/auth';
import { notify } from '@/lib/dialog';
import { colors, space } from '@/lib/theme';
import type { Doc, Vehicle } from '@/lib/types';
import { DocList, MissingDocs } from '@/components/docs';
import { Button, Card, ErrorBox, Field, Icon, Loading, Pill, Row, Screen, Section, Txt } from '@/components/ui';

type VehicleData = { vehicle: Vehicle; documents: Doc[]; missing: string[] };

export default function VehicleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, errorText } = useI18n();
  const { user } = useAuth();
  const res = useApi<VehicleData>(`/vehicles/${id}`);
  const [form, setForm] = useState<Partial<Vehicle> | null>(null);
  const [busy, setBusy] = useState(false);
  const v = res.data?.vehicle;

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/vehicles/${id}`, { method: 'PATCH', body: patch });
      setForm(null);
      res.reload();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']} refreshing={res.refreshing} onRefresh={res.reload}>
      <Stack.Screen options={{ title: v?.plate_number ?? t.fleet.vehicles }} />
      {res.error ? <ErrorBox error={res.error} onRetry={res.reload} /> : null}
      {!v ? (
        <Loading />
      ) : (
        <>
          <Card>
            <Row gap={space.md}>
              <Icon name="bus" size={40} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Txt variant="h2">{v.plate_number}</Txt>
                <Txt variant="small">{[v.type, v.capacity_tons ? `${v.capacity_tons} t` : null].filter(Boolean).join(' · ')}</Txt>
              </View>
              {!v.active ? <Pill label={t.fleet.inactive} tone="bad" /> : null}
            </Row>
          </Card>
          {isManager(user) ? (
            form ? (
              <Card>
                <Field label={t.fleet.plate} value={form.plate_number ?? v.plate_number} onChangeText={(x) => setForm((f) => ({ ...f, plate_number: x }))} />
                <Field label={t.fleet.type} value={form.type ?? v.type ?? ''} onChangeText={(x) => setForm((f) => ({ ...f, type: x }))} />
                <Field label={t.fleet.capacity} value={String(form.capacity_tons ?? v.capacity_tons ?? '')} onChangeText={(x) => setForm((f) => ({ ...f, capacity_tons: x as any }))} keyboardType="decimal-pad" ltr />
                <Row gap={space.sm}>
                  <Button label={t.common.save} onPress={() => save(form)} loading={busy} style={{ flex: 1 }} />
                  <Button label={t.common.cancel} variant="secondary" onPress={() => setForm(null)} style={{ flex: 1 }} />
                </Row>
              </Card>
            ) : (
              <Row gap={space.sm}>
                <Button small variant="secondary" icon="create-outline" label={t.common.edit} onPress={() => setForm({})} />
                <Button small variant={v.active ? 'danger' : 'secondary'} label={v.active ? t.fleet.deactivate : t.fleet.activate} onPress={() => save({ active: !v.active })} />
              </Row>
            )
          ) : null}
          <Section
            title={t.docs.title}
            action={<Button small icon="cloud-upload-outline" label={t.docs.upload} onPress={() => router.push({ pathname: '/document/new', params: { owner_type: 'vehicle', owner_id: String(v.id) } })} />}>
            <MissingDocs missing={res.data!.missing} ownerType="vehicle" ownerId={v.id} />
            <DocList docs={res.data!.documents} />
          </Section>
        </>
      )}
    </Screen>
  );
}
