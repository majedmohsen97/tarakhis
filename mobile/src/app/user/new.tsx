import { useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/dialog';
import { westernDigits } from '@/lib/format';
import { space } from '@/lib/theme';
import type { Role, User, Vehicle } from '@/lib/types';
import { Button, Card, Field, Screen, Select, Txt } from '@/components/ui';
import { LoginDetails } from '@/components/PasswordCard';

export default function NewUser() {
  const params = useLocalSearchParams<{ role?: Role }>();
  const { t, errorText } = useI18n();
  const { user: me } = useAuth();
  const [role, setRole] = useState<Role>(params.role ?? 'driver');
  const vehicles = useApi<Vehicle[]>('/vehicles');
  const [form, setForm] = useState({ name: '', phone: '', password: '', id_type: 'iqama', id_number: '', nationality: '', license_number: '' });
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ user: User; temp_password: string } | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const roles: Role[] = me?.role === 'owner' ? ['driver', 'gate', 'safety', 'manager', 'owner'] : ['driver', 'gate', 'safety', 'manager'];

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: form.name, phone: westernDigits(form.phone), role, password: form.password || undefined };
      if (role === 'driver') {
        Object.assign(body, { id_type: form.id_type, id_number: westernDigits(form.id_number) || undefined, nationality: form.nationality, license_number: form.license_number, default_vehicle_id: vehicleId });
      }
      const res = await api<{ user: User; temp_password: string }>('/users', { method: 'POST', body });
      // Show the chosen password too, so it can be shared like a generated one.
      setCreated({ user: res.user, temp_password: res.temp_password ?? form.password });
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: created.user.name }} />
        <Card style={{ padding: space.lg, gap: space.sm }}>
          <Txt variant="h2">✔ {created.user.name}</Txt>
          <Txt>{t.roles[created.user.role]}</Txt>
        </Card>
        <LoginDetails name={created.user.name} phone={created.user.phone} password={created.temp_password} />
        <Button
          label={t.common.close}
          onPress={() => (created.user.role === 'driver' ? router.replace(`/driver/${created.user.id}`) : router.back())}
          style={{ marginTop: space.md }}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: role === 'driver' ? t.fleet.addDriver : t.fleet.addUser }} />
      <Card style={{ padding: space.lg }}>
        <Select label={t.fleet.role} value={role} options={roles.map((r) => ({ value: r, label: t.roles[r] }))} onChange={setRole} />
        <Field label={t.auth.yourName} value={form.name} onChangeText={set('name')} />
        <Field label={t.auth.phone} placeholder={t.auth.phoneHint} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" ltr />
        <Field label={t.fleet.passwordOptional} hint={t.fleet.passwordOptionalHint} value={form.password} onChangeText={set('password')} autoCapitalize="none" ltr />
        {role === 'driver' ? (
          <>
            <Select
              label={t.fleet.idType}
              value={form.id_type}
              options={[{ value: 'iqama', label: t.docTypes.iqama }, { value: 'national_id', label: t.docTypes.national_id }]}
              onChange={set('id_type')}
            />
            <Field label={`${t.fleet.idNumber} (${t.common.optional})`} value={form.id_number} onChangeText={set('id_number')} keyboardType="number-pad" maxLength={10} ltr />
            <Field label={`${t.fleet.nationality} (${t.common.optional})`} value={form.nationality} onChangeText={set('nationality')} />
            <Field label={`${t.fleet.license} (${t.common.optional})`} value={form.license_number} onChangeText={set('license_number')} ltr />
            <Select
              label={t.fleet.truck}
              value={vehicleId}
              placeholder={t.fleet.noTruck}
              options={(vehicles.data ?? []).filter((v) => v.active).map((v) => ({ value: v.id, label: v.plate_number, hint: [v.type, v.driver_name].filter(Boolean).join(' · ') }))}
              onChange={setVehicleId}
            />
          </>
        ) : null}
        <Button label={t.common.add} icon="person-add-outline" onPress={submit} loading={busy} disabled={!form.name || !form.phone || (form.password.length > 0 && form.password.length < 8)} />
      </Card>
    </Screen>
  );
}
