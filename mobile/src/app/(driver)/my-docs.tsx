import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { space } from '@/lib/theme';
import type { Alert, Doc } from '@/lib/types';
import { AlertList, DocList } from '@/components/docs';
import { Button, ErrorBox, Header, Loading, Row, Screen, Section } from '@/components/ui';

export default function MyDocs() {
  const { t } = useI18n();
  const { user } = useAuth();
  const docs = useApi<Doc[]>('/documents');
  const alerts = useApi<Alert[]>('/alerts');
  const mine = (docs.data ?? []).filter((d) => d.owner_type === 'driver');
  const truck = (docs.data ?? []).filter((d) => d.owner_type === 'vehicle');

  return (
    <Screen refreshing={docs.refreshing} onRefresh={() => { docs.reload(); alerts.reload(); }}>
      <Header title={t.tabs.docs} />
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Button
          icon="person-outline"
          label={t.docs.upload}
          onPress={() => router.push({ pathname: '/document/new', params: { owner_type: 'driver', owner_id: String(user?.id) } })}
          style={{ flex: 1 }}
        />
        {user?.default_vehicle_id ? (
          <Button
            variant="secondary"
            icon="bus-outline"
            label={t.owners.vehicle}
            onPress={() => router.push({ pathname: '/document/new', params: { owner_type: 'vehicle', owner_id: String(user.default_vehicle_id) } })}
            style={{ flex: 1 }}
          />
        ) : null}
      </Row>
      {alerts.data ? <AlertList alerts={alerts.data} /> : null}
      {docs.error ? <ErrorBox error={docs.error} onRetry={docs.reload} /> : null}
      {docs.loading ? <Loading /> : null}
      <Section title={t.owners.driver}>
        <DocList docs={mine} />
      </Section>
      {truck.length ? (
        <Section title={t.owners.vehicle}>
          <DocList docs={truck} />
        </Section>
      ) : null}
    </Screen>
  );
}
