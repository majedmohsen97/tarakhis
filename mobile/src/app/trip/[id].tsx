import { Linking, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { absoluteUrl } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';
import type { Trip } from '@/lib/types';
import { openMap } from '@/components/TripCard';
import { Button, Card, Divider, ErrorBox, Icon, Loading, Pill, Row, Screen, Section, Txt, stateTone } from '@/components/ui';

type Point = { lat: number; lng: number; accuracy: number | null; recorded_at: string };

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const res = useApi<{ trip: Trip; points: Point[] }>(`/trips/${id}`, { intervalMs: 20000 });
  const trip = res.data?.trip;
  const ticket = absoluteUrl(trip?.ticket_url);

  return (
    <Screen edges={['bottom']} refreshing={res.refreshing} onRefresh={res.reload}>
      <Stack.Screen options={{ title: trip ? `${trip.driver_name} · ${trip.plate_number ?? ''}` : '…' }} />
      {res.error ? <ErrorBox error={res.error} onRetry={res.reload} /> : null}
      {!trip ? (
        <Loading />
      ) : (
        <>
          <Card>
            <Row justify="space-between">
              <Txt variant="h2" style={{ flex: 1 }}>{trip.site_name ?? '—'}</Txt>
              <Pill label={t.tripStatus[trip.status]} tone={stateTone(trip.status)} />
            </Row>
            <Divider />
            <Step icon="play-circle" label={t.live.started} value={fmtDateTime(trip.started_at, lang)} done />
            <Step icon="flag" label={t.live.arrivedAt} value={trip.arrived_at ? `${fmtTime(trip.arrived_at, lang)} · ${t.live.via[trip.arrival_method ?? ''] ?? ''}` : '—'} done={Boolean(trip.arrived_at)} />
            <Step icon="checkmark-done-circle" label={t.tripStatus.completed} value={trip.completed_at ? fmtTime(trip.completed_at, lang) : '—'} done={trip.status === 'completed'} />
            {trip.weight_tons != null ? <Txt style={{ marginTop: space.sm }}>{`${t.trip.weight}: ${trip.weight_tons}`}</Txt> : null}
            {trip.ticket_number ? <Txt>{`${t.trip.ticketNumber}: ${trip.ticket_number}`}</Txt> : null}
            {trip.load_type ? <Txt variant="small">{`${t.trip.loadType}: ${trip.load_type}`}</Txt> : null}
          </Card>
          <Row gap={space.sm}>
            <Button variant="secondary" icon="call-outline" label={t.schedule.driver} onPress={() => Linking.openURL(`tel:${trip.driver_phone}`)} style={{ flex: 1 }} />
            {trip.last_lat != null ? <Button variant="secondary" icon="map-outline" label={t.live.map} onPress={() => openMap(trip.last_lat!, trip.last_lng!)} style={{ flex: 1 }} /> : null}
          </Row>
          {ticket ? (
            <Section title={t.trip.ticketPhoto}>
              <Image source={{ uri: ticket }} style={{ width: '100%', height: 300, borderRadius: radius.md, backgroundColor: colors.line }} contentFit="contain" />
            </Section>
          ) : null}
          {res.data!.points.length ? (
            <Section title={`GPS (${res.data!.points.length})`}>
              {res.data!.points.slice(-10).reverse().map((p, i) => (
                <Card key={`${p.recorded_at}-${i}`} onPress={() => openMap(p.lat, p.lng)}>
                  <Row justify="space-between">
                    <Txt variant="small">{fmtTime(p.recorded_at, lang)}</Txt>
                    <Txt variant="small">{`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</Txt>
                  </Row>
                </Card>
              ))}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Step({ icon, label, value, done }: { icon: 'play-circle' | 'flag' | 'checkmark-done-circle'; label: string; value: string; done: boolean }) {
  return (
    <Row gap={space.md} style={{ paddingVertical: 6 }}>
      <Icon name={icon} size={22} color={done ? colors.good : colors.line} />
      <View style={{ flex: 1 }}>
        <Txt variant="small">{label}</Txt>
        <Txt weight="600">{value}</Txt>
      </View>
    </Row>
  );
}
