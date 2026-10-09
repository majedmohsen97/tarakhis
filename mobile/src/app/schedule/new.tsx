import { useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { notify } from '@/lib/dialog';
import { isIsoDate, todayIso } from '@/lib/format';
import { space } from '@/lib/theme';
import type { Site, User, Vehicle } from '@/lib/types';
import { DateField } from '@/components/DateField';
import { Button, Card, Field, Screen, Segmented, Select } from '@/components/ui';

export default function NewScheduleEntry() {
  const params = useLocalSearchParams<{ date?: string }>();
  const { t, errorText } = useI18n();
  const drivers = useApi<User[]>('/users?role=driver');
  const vehicles = useApi<Vehicle[]>('/vehicles');
  const sites = useApi<Site[]>('/sites');
  const [date, setDate] = useState(params.date ?? todayIso());
  const [driverId, setDriverId] = useState<number | null>(null);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [siteId, setSiteId] = useState<number | null>(null);
  const [shift, setShift] = useState<'morning' | 'evening' | 'night'>('morning');
  const [trips, setTrips] = useState('1');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api('/schedule', { method: 'POST', body: { date, driver_id: driverId, vehicle_id: vehicleId, site_id: siteId, shift, planned_trips: Number(trips) || 1, notes } });
      router.back();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t.schedule.add }} />
      <Card style={{ padding: space.lg }}>
        <DateField label={t.schedule.date} value={date} onChange={setDate} />
        <Select
          label={t.schedule.driver}
          value={driverId}
          options={(drivers.data ?? []).filter((d) => d.active).map((d) => ({ value: d.id, label: d.name }))}
          onChange={(id) => {
            setDriverId(id);
            // Default to the driver's assigned truck.
            const d = drivers.data?.find((x) => x.id === id);
            if (d?.default_vehicle_id) setVehicleId(d.default_vehicle_id);
          }}
        />
        <Select label={t.schedule.vehicle} value={vehicleId} options={(vehicles.data ?? []).filter((v) => v.active).map((v) => ({ value: v.id, label: v.plate_number }))} onChange={setVehicleId} />
        <Select label={t.schedule.site} value={siteId} options={(sites.data ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))} onChange={setSiteId} />
        <Segmented
          value={shift}
          onChange={setShift}
          options={(['morning', 'evening', 'night'] as const).map((s) => ({ value: s, label: t.schedule.shifts[s] }))}
        />
        <Field label={t.schedule.plannedTrips} value={trips} onChangeText={setTrips} keyboardType="number-pad" ltr />
        <Field label={`${t.docs.notes} (${t.common.optional})`} value={notes} onChangeText={setNotes} />
        <Button label={t.common.save} onPress={submit} loading={busy} disabled={!driverId || !isIsoDate(date)} />
      </Card>
    </Screen>
  );
}
