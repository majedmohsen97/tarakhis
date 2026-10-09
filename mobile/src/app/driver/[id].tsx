import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useAuth, isManager } from '@/lib/auth';
import { notify } from '@/lib/dialog';
import { fmtPhone } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import type { Doc, User, Vehicle } from '@/lib/types';
import { DocList, MissingDocs } from '@/components/docs';
import { pickedToUpload } from '@/components/FilePicker';
import { PasswordCard } from '@/components/PasswordCard';
import { PhoneField, localPhone } from '@/components/PhoneField';
import { Avatar, Button, Card, ErrorBox, Field, Loading, Pill, Row, Screen, Section, Select, Txt } from '@/components/ui';

type DriverData = { user: User; documents: Doc[]; missing: string[]; vehicle: Pick<Vehicle, 'id' | 'plate_number' | 'type'> | null };

export default function DriverDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, errorText } = useI18n();
  const { user: me } = useAuth();
  const res = useApi<DriverData>(`/users/${id}`);
  const vehicles = useApi<Vehicle[]>(isManager(me) ? '/vehicles' : null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<User>>({});
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const d = res.data;

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: patch });
      setEditing(false);
      res.reload();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function changePhoto() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (picked.canceled) return;
    try {
      await api(`/users/${id}/photo`, { method: 'POST', form: { file: pickedToUpload(picked.assets[0]) } });
      res.reload();
    } catch (e) {
      notify(errorText(e));
    }
  }

  return (
    <Screen edges={['bottom']} refreshing={res.refreshing} onRefresh={res.reload}>
      <Stack.Screen options={{ title: d?.user.name ?? t.fleet.driverOf }} />
      {res.error ? <ErrorBox error={res.error} onRetry={res.reload} /> : null}
      {!d ? (
        <Loading />
      ) : (
        <>
          <Card>
            <Row gap={space.md} align="flex-start">
              <Avatar name={d.user.name} url={d.user.photo_url} size={72} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="h2">{d.user.name}</Txt>
                <Txt variant="small">{[d.user.nationality, d.user.id_type ? t.docTypes[d.user.id_type] : null, d.user.id_number].filter(Boolean).join(' · ')}</Txt>
                <Txt variant="small">{`${t.fleet.truck}: ${d.vehicle?.plate_number ?? t.fleet.noTruck}`}</Txt>
                {!d.user.active ? <Pill label={t.fleet.inactive} tone="bad" /> : null}
              </View>
            </Row>
            <Row gap={space.sm} wrap style={{ marginTop: space.md }}>
              <Button small variant="secondary" icon="call-outline" label={fmtPhone(d.user.phone)} onPress={() => Linking.openURL(`tel:${d.user.phone}`)} />
              <Button small variant="secondary" icon="logo-whatsapp" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${d.user.phone.replace('+', '')}`)} />
              <Button small variant="secondary" icon="camera-outline" label={t.fleet.setPhoto} onPress={changePhoto} />
            </Row>
          </Card>

          {isManager(me) ? (
            editing ? (
              <Card>
                <Field label={t.auth.yourName} value={form.name ?? d.user.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
                <PhoneField value={form.phone ?? localPhone(d.user.phone)} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
                <Select
                  label={t.fleet.idType}
                  value={(form.id_type ?? d.user.id_type) as string | null}
                  options={[{ value: 'iqama', label: t.docTypes.iqama }, { value: 'national_id', label: t.docTypes.national_id }]}
                  onChange={(v) => setForm((f) => ({ ...f, id_type: v as User['id_type'] }))}
                />
                <Field label={t.fleet.idNumber} value={form.id_number ?? d.user.id_number ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, id_number: v }))} keyboardType="number-pad" ltr />
                <Field label={t.fleet.nationality} value={form.nationality ?? d.user.nationality ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, nationality: v }))} />
                <Select
                  label={t.fleet.truck}
                  value={(form.default_vehicle_id ?? d.user.default_vehicle_id) as number | null}
                  options={(vehicles.data ?? []).filter((v) => v.active).map((v) => ({ value: v.id, label: v.plate_number, hint: v.type ?? undefined }))}
                  onChange={(v) => setForm((f) => ({ ...f, default_vehicle_id: v }))}
                />
                <Row gap={space.sm}>
                  <Button label={t.common.save} onPress={() => save(form)} loading={busy} style={{ flex: 1 }} />
                  <Button label={t.common.cancel} variant="secondary" onPress={() => { setEditing(false); setForm({}); }} style={{ flex: 1 }} />
                </Row>
              </Card>
            ) : (
              <Row gap={space.sm} wrap>
                <Button small variant="secondary" icon="create-outline" label={t.common.edit} onPress={() => setEditing(true)} />
                <Button small variant="secondary" icon="key-outline" label={t.fleet.passwordTitle} onPress={() => setShowPassword((v) => !v)} />
                <Button
                  small
                  variant={d.user.active ? 'danger' : 'secondary'}
                  icon={d.user.active ? 'ban-outline' : 'checkmark-circle-outline'}
                  label={d.user.active ? t.fleet.deactivate : t.fleet.activate}
                  onPress={() => save({ active: !d.user.active })}
                />
              </Row>
            )
          ) : null}

          {isManager(me) && showPassword ? (
            <Section title={t.fleet.passwordTitle}>
              <PasswordCard userId={d.user.id} name={d.user.name} phone={d.user.phone} />
            </Section>
          ) : null}

          <Section
            title={t.docs.title}
            action={<Button small icon="cloud-upload-outline" label={t.docs.upload} onPress={() => router.push({ pathname: '/document/new', params: { owner_type: 'driver', owner_id: String(d.user.id) } })} />}>
            <MissingDocs missing={d.missing} ownerType="driver" ownerId={d.user.id} />
            <DocList docs={d.documents} />
          </Section>
          {d.vehicle ? (
            <Button variant="ghost" icon="bus-outline" label={`${t.fleet.truck}: ${d.vehicle.plate_number}`} onPress={() => router.push(`/vehicle/${d.vehicle!.id}`)} />
          ) : null}
          <Txt variant="small" color={colors.muted} center>{t.roles.driver}</Txt>
        </>
      )}
    </Screen>
  );
}
