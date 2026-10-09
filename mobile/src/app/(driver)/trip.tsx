import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { api, type UploadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { confirm, notify } from '@/lib/dialog';
import { fmtTime, todayIso, westernDigits } from '@/lib/format';
import { useTripTracking } from '@/lib/tracking';
import { colors, space } from '@/lib/theme';
import type { ScheduleEntry, Site, Trip } from '@/lib/types';
import { FilePicker } from '@/components/FilePicker';
import { LocationConsent } from '@/components/LocationConsent';
import { useAuth } from '@/lib/auth';
import { TripCard } from '@/components/TripCard';
import { Button, Card, Divider, ErrorBox, Field, Header, Icon, Loading, Pill, Row, Screen, Section, Select, Txt, stateTone } from '@/components/ui';

export default function TripScreen() {
  const { t, lang, errorText } = useI18n();
  const trips = useApi<Trip[]>('/trips');
  const sites = useApi<Site[]>('/sites');
  const schedule = useApi<{ entries: ScheduleEntry[] }>(`/schedule?week_start=${todayIso()}`);
  const [override, setOverride] = useState<Trip | null>(null);
  const [busy, setBusy] = useState(false);

  const fromList = trips.data?.find((x) => x.status === 'en_route' || x.status === 'arrived') ?? null;
  const active = override && fromList && override.id === fromList.id ? override : fromList;
  const onUpdate = useCallback((u: Trip) => setOverride(u), []);
  const { user } = useAuth();
  const consented = Boolean(user?.location_consent_at);
  const tracking = useTripTracking(consented ? active : null, onUpdate, { title: t.trip.notifTitle, body: t.trip.notifBody });
  const sharing = tracking.status === 'on' || tracking.status === 'background';

  const todayEntry = schedule.data?.entries.find((e) => e.date === todayIso()) ?? null;
  const [siteId, setSiteId] = useState<number | null>(null);
  const [loadType, setLoadType] = useState('');
  const [weight, setWeight] = useState('');
  const [ticketNo, setTicketNo] = useState('');
  const [ticket, setTicket] = useState<UploadFile | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setOverride(null);
      trips.reload();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(() =>
      api('/trips/start', {
        method: 'POST',
        body: { site_id: siteId ?? todayEntry?.site_id ?? undefined, schedule_entry_id: todayEntry?.id, load_type: loadType || undefined },
      }),
    );

  const complete = () =>
    run(async () => {
      await api(`/trips/${active!.id}/complete`, { method: 'POST', form: { weight_tons: westernDigits(weight), ticket_number: ticketNo, ticket: ticket ?? undefined } });
      setWeight('');
      setTicketNo('');
      setTicket(null);
      notify(t.trip.done);
    });

  async function cancel() {
    if (!(await confirm(t.trip.cancel, active?.site_name ?? '', t.common.confirm, t.common.no, true))) return;
    run(() => api(`/trips/${active!.id}/cancel`, { method: 'POST', body: {} }));
  }

  const history = (trips.data ?? []).filter((x) => x.status === 'completed' || x.status === 'cancelled').slice(0, 10);

  return (
    <Screen refreshing={trips.refreshing} onRefresh={trips.reload}>
      <Header title={t.tabs.trip} />
      {trips.error ? <ErrorBox error={trips.error} onRetry={trips.reload} /> : null}
      {trips.loading ? (
        <Loading />
      ) : active ? (
        <>
          <Card>
            <Row justify="space-between">
              <Txt variant="h2" style={{ flex: 1 }}>{active.site_name ?? '—'}</Txt>
              <Pill label={t.tripStatus[active.status]} tone={stateTone(active.status)} />
            </Row>
            <Txt variant="small">{`${active.plate_number ?? ''} · ${t.live.started} ${fmtTime(active.started_at, lang)}`}</Txt>
            {active.arrived_at ? <Txt variant="small">{`${t.live.arrivedAt} ${fmtTime(active.arrived_at, lang)} · ${t.live.via[active.arrival_method ?? ''] ?? ''}`}</Txt> : null}
            {active.distance_to_site_m != null && active.status === 'en_route' ? <Txt weight="600">{`${t.live.distance}: ${t.common.km(active.distance_to_site_m)}`}</Txt> : null}
            <Divider />
            {consented ? (
              <>
                <Row gap={space.sm}>
                  <Icon name={sharing ? 'radio' : 'radio-outline'} color={sharing ? colors.good : colors.bad} />
                  <Txt variant="small" color={sharing ? colors.good : colors.bad} style={{ flex: 1 }}>
                    {tracking.status === 'background'
                      ? t.trip.trackingBackground
                      : tracking.status === 'on'
                        ? t.trip.tracking
                        : tracking.status === 'denied'
                          ? t.trip.locationDenied
                          : t.trip.trackingOff}
                  </Txt>
                </Row>
                {tracking.status === 'on' ? <Txt variant="small">{t.trip.keepOpen}</Txt> : null}
              </>
            ) : null}
            {consented ? (
              <Button
                small
                variant="secondary"
                icon="locate-outline"
                label={t.trip.sendLocation}
                onPress={() => tracking.sendNow().catch((e) => notify(errorText(e)))}
                style={{ marginTop: space.sm, alignSelf: 'stretch' }}
              />
            ) : null}
          </Card>
          {!consented ? <LocationConsent /> : null}

          {active.status === 'en_route' ? (
            <Button variant="secondary" icon="flag-outline" label={t.trip.arrivedManual} onPress={() => run(() => api(`/trips/${active.id}/arrive`, { method: 'POST' }))} loading={busy} style={{ marginBottom: space.sm }} />
          ) : null}

          <Section title={t.trip.complete}>
            <Card style={{ padding: space.lg }}>
              <Field label={t.trip.weight} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" ltr />
              <Field label={t.trip.ticketNumber} value={ticketNo} onChangeText={setTicketNo} ltr />
              <Txt variant="label">{t.trip.ticketPhoto}</Txt>
              <FilePicker value={ticket} onChange={setTicket} imagesOnly />
              <Button label={t.trip.complete} icon="checkmark-done" variant="good" onPress={complete} loading={busy} />
            </Card>
          </Section>
          <Button label={t.trip.cancel} variant="ghost" onPress={cancel} />
        </>
      ) : !consented ? (
        <LocationConsent />
      ) : (
        <Card style={{ padding: space.lg }}>
          <Txt variant="muted" style={{ marginBottom: space.md }}>{t.trip.startHint}</Txt>
          {todayEntry ? (
            <Card tone="info">
              <Txt variant="small">{t.trip.fromSchedule}</Txt>
              <Txt weight="700">{[todayEntry.site_name, todayEntry.plate_number, t.schedule.trips(todayEntry.completed_trips, todayEntry.planned_trips)].filter(Boolean).join(' · ')}</Txt>
            </Card>
          ) : null}
          <Select
            label={t.trip.site}
            value={siteId ?? todayEntry?.site_id ?? null}
            options={(sites.data ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))}
            onChange={setSiteId}
          />
          <Field label={`${t.trip.loadType} (${t.common.optional})`} value={loadType} onChangeText={setLoadType} />
          <Button label={t.trip.start} icon="play" onPress={start} loading={busy} />
        </Card>
      )}

      {history.length ? (
        <Section title={t.trip.history}>
          <View>
            {history.map((x) => (
              <TripCard key={x.id} trip={x} showDriver={false} />
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
