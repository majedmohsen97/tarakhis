import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { space } from '@/lib/theme';
import type { Alert } from '@/lib/types';
import { AlertList } from '@/components/docs';
import { Button, ErrorBox, Header, Loading, Row, Screen, Section, Stat } from '@/components/ui';
import { LanguageToggle } from '@/components/LanguageToggle';

type Dashboard = {
  today: string;
  drivers: number;
  vehicles: number;
  trips: { en_route: number; arrived: number; completed_today: number; scheduled_today: number };
  documents: { pending: number; expired: number; expiring: number };
  gate_today: { allowed: number; denied: number };
  invoices: { draft: number; unpaid_total: number };
};

export default function Home() {
  const { t, lang } = useI18n();
  const { company, user } = useAuth();
  const dash = useApi<Dashboard>('/dashboard', { intervalMs: 30000 });
  const alerts = useApi<Alert[]>('/alerts');
  const d = dash.data;

  return (
    <Screen refreshing={dash.refreshing} onRefresh={() => { dash.reload(); alerts.reload(); }}>
      <Header title={company?.name ?? t.appName} subtitle={d ? `${t.common.today} · ${fmtDate(d.today, lang)}` : undefined} right={<LanguageToggle />} />
      {dash.error ? <ErrorBox error={dash.error} onRetry={dash.reload} /> : null}
      {!d ? (
        <Loading />
      ) : (
        <>
          <Row wrap gap={space.sm}>
            <Stat label={t.dash.enRoute} value={d.trips.en_route} icon="navigate" tone="warn" onPress={() => router.push('/live')} />
            <Stat label={t.dash.arrived} value={d.trips.arrived} icon="flag" tone="info" onPress={() => router.push('/live')} />
            <Stat label={t.dash.completedToday} value={`${d.trips.completed_today}/${d.trips.scheduled_today}`} icon="checkmark-done" tone="good" onPress={() => router.push('/schedule')} />
            <Stat label={t.dash.gateDenied} value={d.gate_today.denied} icon="hand-left" tone={d.gate_today.denied ? 'bad' : 'neutral'} onPress={() => router.push('/gate-log')} />
          </Row>
          <Section title={t.docs.title}>
            <Row wrap gap={space.sm}>
              <Stat label={t.dash.docsExpired} value={d.documents.expired} icon="close-circle" tone={d.documents.expired ? 'bad' : 'good'} onPress={() => router.push('/documents')} />
              <Stat label={t.dash.docsExpiring} value={d.documents.expiring} icon="warning" tone={d.documents.expiring ? 'warn' : 'good'} onPress={() => router.push('/documents')} />
              <Stat label={t.dash.docsPending} value={d.documents.pending} icon="time" tone={d.documents.pending ? 'warn' : 'good'} onPress={() => router.push('/documents')} />
            </Row>
          </Section>
          {user?.role !== 'safety' ? (
            <Section title={t.invoices.title}>
              <Row wrap gap={space.sm}>
                <Stat label={t.dash.draftInvoices} value={d.invoices.draft} icon="create-outline" onPress={() => router.push('/invoices')} />
                <Stat label={t.dash.unpaid} value={fmtMoney(d.invoices.unpaid_total, lang)} icon="cash-outline" onPress={() => router.push('/invoices')} />
              </Row>
            </Section>
          ) : null}
        </>
      )}
      <Section title={t.alerts.title} action={<Button small variant="ghost" label={t.common.all} onPress={() => router.push('/documents')} />}>
        {alerts.data ? <AlertList alerts={alerts.data} limit={6} /> : alerts.error ? <ErrorBox error={alerts.error} /> : <Loading />}
      </Section>
      <View style={{ height: space.lg }} />
    </Screen>
  );
}
