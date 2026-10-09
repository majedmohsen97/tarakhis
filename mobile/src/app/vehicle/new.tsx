import { useState } from 'react';
import { Stack, router } from 'expo-router';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { notify } from '@/lib/dialog';
import { space } from '@/lib/theme';
import { Button, Card, Field, Screen } from '@/components/ui';

export default function NewVehicle() {
  const { t, errorText } = useI18n();
  const [form, setForm] = useState({ plate_number: '', type: '', capacity_tons: '' });
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const v = await api<{ id: number }>('/vehicles', { method: 'POST', body: form });
      router.replace(`/vehicle/${v.id}`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t.fleet.addVehicle }} />
      <Card style={{ padding: space.lg }}>
        <Field label={t.fleet.plate} placeholder="أ ب ج 1234" value={form.plate_number} onChangeText={(v) => setForm((f) => ({ ...f, plate_number: v }))} />
        <Field label={t.fleet.type} value={form.type} onChangeText={(v) => setForm((f) => ({ ...f, type: v }))} />
        <Field label={t.fleet.capacity} value={form.capacity_tons} onChangeText={(v) => setForm((f) => ({ ...f, capacity_tons: v }))} keyboardType="decimal-pad" ltr />
        <Button label={t.common.save} onPress={submit} loading={busy} disabled={!form.plate_number} />
      </Card>
    </Screen>
  );
}
