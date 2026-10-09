import { useState } from 'react';
import { Stack, router } from 'expo-router';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { notify } from '@/lib/dialog';
import { addDays, fmtDate, todayIso, weekStartOf } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import type { Invoice } from '@/lib/types';
import { Button, Card, Field, Row, Screen, Segmented, Txt } from '@/components/ui';

type Uninvoiced = { week_start: string; week_end: string; trips: { id: number; weight_tons: number | null }[] };

export default function NewInvoice() {
  const { t, lang, errorText } = useI18n();
  // Default to last week — invoices are usually issued after the week closes.
  const [week, setWeek] = useState(addDays(weekStartOf(todayIso()), -7));
  const preview = useApi<Uninvoiced>(`/invoices/uninvoiced?week_start=${week}`);
  const [client, setClient] = useState('');
  const [clientVat, setClientVat] = useState('');
  const [pricing, setPricing] = useState<'per_trip' | 'per_ton'>('per_ton');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const trips = preview.data?.trips ?? [];
  const tons = trips.reduce((s, x) => s + (x.weight_tons ?? 0), 0);
  const estimate = (pricing === 'per_ton' ? tons : trips.length) * (Number(price) || 0);

  async function submit() {
    setBusy(true);
    try {
      const inv = await api<Invoice>('/invoices/generate', {
        method: 'POST',
        body: { week_start: week, client_name: client, client_vat_number: clientVat, pricing, unit_price: Number(price) },
      });
      router.replace(`/invoices/${inv.id}`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t.invoices.generate }} />
      <Card style={{ padding: space.lg }}>
        <Txt variant="label">{t.invoices.week}</Txt>
        <Row justify="space-between" style={{ marginBottom: space.sm }}>
          <Button small variant="ghost" icon={lang === 'ar' ? 'chevron-forward' : 'chevron-back'} label="" onPress={() => setWeek(addDays(week, -7))} />
          <Txt weight="700">{`${fmtDate(week, lang)} – ${fmtDate(addDays(week, 6), lang)}`}</Txt>
          <Button small variant="ghost" icon={lang === 'ar' ? 'chevron-back' : 'chevron-forward'} label="" onPress={() => setWeek(addDays(week, 7))} />
        </Row>
        <Card tone={trips.length ? 'info' : 'neutral'}>
          <Txt weight="600">{t.invoices.tripsReady(trips.length)}</Txt>
          {trips.length ? <Txt variant="small">{`${tons.toFixed(2)} t`}</Txt> : null}
        </Card>
        <Field label={t.invoices.client} placeholder="أمانة منطقة الرياض" value={client} onChangeText={setClient} />
        <Field label={`${t.invoices.clientVat} (${t.common.optional})`} value={clientVat} onChangeText={setClientVat} keyboardType="number-pad" ltr />
        <Txt variant="label">{t.invoices.pricing}</Txt>
        <Segmented
          value={pricing}
          onChange={setPricing}
          options={[
            { value: 'per_ton', label: t.invoices.perTon },
            { value: 'per_trip', label: t.invoices.perTrip },
          ]}
        />
        <Field label={t.invoices.unitPrice} value={price} onChangeText={setPrice} keyboardType="decimal-pad" ltr />
        {estimate > 0 ? (
          <Txt color={colors.primary} weight="700" style={{ marginBottom: space.md }}>
            {`${t.invoices.subtotal}: ${(estimate).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t.common.sar}`}
          </Txt>
        ) : null}
        <Button label={t.invoices.generate} onPress={submit} loading={busy} disabled={!client || !price || !trips.length} />
      </Card>
    </Screen>
  );
}
