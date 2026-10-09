import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/lib/i18n';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import type { Trip } from '@/lib/types';
import { Button, Card, Icon, Pill, Row, Txt, stateTone } from './ui';

export function openMap(lat: number, lng: number) {
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
}

export function TripCard({ trip, showDriver = true }: { trip: Trip; showDriver?: boolean }) {
  const { t, lang } = useI18n();
  const stale = trip.minutes_since_update != null && trip.minutes_since_update > 10 && trip.status === 'en_route';
  return (
    <Card onPress={() => router.push(`/trip/${trip.id}`)}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="700">{showDriver ? trip.driver_name : trip.site_name ?? '—'}</Txt>
          <Txt variant="small">{[trip.plate_number, showDriver ? trip.site_name : null].filter(Boolean).join(' · ')}</Txt>
          <Txt variant="small">
            {trip.status === 'completed' || trip.status === 'cancelled'
              ? fmtDateTime(trip.completed_at, lang)
              : trip.arrived_at
                ? `${t.live.arrivedAt} ${fmtTime(trip.arrived_at, lang)} · ${t.live.via[trip.arrival_method ?? ''] ?? ''}`
                : `${t.live.started} ${fmtTime(trip.started_at, lang)}`}
          </Txt>
          {trip.status === 'en_route' && trip.distance_to_site_m != null ? (
            <Txt variant="small">{`${t.live.distance}: ${t.common.km(trip.distance_to_site_m)}`}</Txt>
          ) : null}
          {trip.weight_tons != null ? (
            <Txt variant="small">{[`${trip.weight_tons} ${t.invoices.units.ton}`, trip.ticket_number ? `#${trip.ticket_number}` : null].filter(Boolean).join(' · ')}</Txt>
          ) : null}
          {trip.minutes_since_update != null && (trip.status === 'en_route' || trip.status === 'arrived') ? (
            <Row gap={4}>
              <Icon name="radio-outline" size={14} color={stale ? colors.bad : colors.good} />
              <Txt variant="small" color={stale ? colors.bad : colors.muted}>{`${t.live.lastUpdate}: ${t.common.minutesAgo(trip.minutes_since_update)}`}</Txt>
            </Row>
          ) : null}
        </View>
        <View style={{ alignItems: 'center', gap: space.sm }}>
          <Pill label={t.tripStatus[trip.status]} tone={stateTone(trip.status)} />
          {trip.last_lat != null && trip.last_lng != null && trip.status !== 'completed' ? (
            <Button small variant="secondary" icon="map-outline" label={t.live.map} onPress={() => openMap(trip.last_lat!, trip.last_lng!)} />
          ) : null}
        </View>
      </Row>
    </Card>
  );
}
