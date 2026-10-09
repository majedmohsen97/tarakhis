import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { notify } from '@/lib/dialog';
import { colors, space } from '@/lib/theme';
import { Button, Card, Icon, Row, Txt } from './ui';

/** Explains location sharing and records the driver's consent before the first trip (PDPL). */
export function LocationConsent() {
  const { t, errorText } = useI18n();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);

  async function agree() {
    setBusy(true);
    try {
      await api('/auth/me', { method: 'PATCH', body: { location_consent: true } });
      await refresh();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ padding: space.lg, gap: space.sm }}>
      <Row gap={space.sm}>
        <Icon name="location" size={24} color={colors.primary} />
        <Txt variant="h3" style={{ flex: 1 }}>{t.trip.consentTitle}</Txt>
      </Row>
      {t.trip.consentPoints.map((p) => (
        <Row key={p} gap={space.sm} align="flex-start">
          <Icon name="checkmark-circle-outline" size={18} color={colors.good} />
          <View style={{ flex: 1 }}>
            <Txt variant="small" color={colors.text}>{p}</Txt>
          </View>
        </Row>
      ))}
      <Button label={t.trip.consentAgree} icon="checkmark" onPress={agree} loading={busy} style={{ marginTop: space.sm }} />
    </Card>
  );
}
