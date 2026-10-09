import { router } from 'expo-router';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { GateLog, Trip } from '@/lib/types';
import { TripCard } from '@/components/TripCard';
import { GateLogRow } from '@/components/GateLogRow';
import { Button, Empty, ErrorBox, Header, Loading, Screen, Section } from '@/components/ui';
import { todayIso } from '@/lib/format';

export default function Live() {
  const { t } = useI18n();
  // Refresh every 20s so the board stays live without pulling.
  const live = useApi<{ active: Trip[]; arrived_today: Trip[] }>('/trips/live', { intervalMs: 20000 });
  const logs = useApi<GateLog[]>(`/gate/logs?date=${todayIso()}`, { intervalMs: 30000 });

  return (
    <Screen refreshing={live.refreshing} onRefresh={() => { live.reload(); logs.reload(); }}>
      <Header title={t.live.title} />
      {live.error ? <ErrorBox error={live.error} onRetry={live.reload} /> : null}
      {!live.data ? (
        <Loading />
      ) : live.data.active.length ? (
        live.data.active.map((trip) => <TripCard key={trip.id} trip={trip} />)
      ) : (
        <Empty text={t.live.none} icon="car-outline" />
      )}
      {live.data?.arrived_today.filter((x) => x.status === 'completed').length ? (
        <Section title={t.live.arrivedToday}>
          {live.data.arrived_today.filter((x) => x.status === 'completed').map((trip) => <TripCard key={trip.id} trip={trip} />)}
        </Section>
      ) : null}
      <Section title={t.live.gateToday} action={<Button small variant="ghost" label={t.common.all} onPress={() => router.push('/gate-log')} />}>
        {logs.data ? (logs.data.length ? logs.data.slice(0, 8).map((l) => <GateLogRow key={l.id} log={l} />) : <Empty text={t.gate.noLogs} icon="scan-outline" />) : <Loading />}
      </Section>
    </Screen>
  );
}
