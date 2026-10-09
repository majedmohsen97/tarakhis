import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { space } from '@/lib/theme';
import type { Invoice } from '@/lib/types';
import { Button, Card, Empty, ErrorBox, Loading, Pill, Row, Screen, Txt, stateTone } from '@/components/ui';

export default function Invoices() {
  const { t, lang } = useI18n();
  const list = useApi<Invoice[]>('/invoices');

  return (
    <Screen edges={['bottom']} refreshing={list.refreshing} onRefresh={list.reload}>
      <Stack.Screen options={{ title: t.invoices.title }} />
      <Button label={t.invoices.generate} icon="add-circle-outline" onPress={() => router.push('/invoices/new')} style={{ marginBottom: space.md }} />
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.loading ? (
        <Loading />
      ) : list.data?.length ? (
        list.data.map((inv) => (
          <Card key={inv.id} onPress={() => router.push(`/invoices/${inv.id}`)}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="700">{inv.client_name}</Txt>
                <Txt variant="small">{`${inv.number ?? t.invoices.status.draft} · ${fmtDate(inv.week_start, lang)} – ${fmtDate(inv.week_end, lang)}`}</Txt>
                <Txt weight="700">{fmtMoney(inv.total, lang)}</Txt>
              </View>
              <Pill label={t.invoices.status[inv.status]} tone={stateTone(inv.status)} />
            </Row>
          </Card>
        ))
      ) : (
        <Empty text={t.invoices.empty} icon="receipt-outline" />
      )}
    </Screen>
  );
}
