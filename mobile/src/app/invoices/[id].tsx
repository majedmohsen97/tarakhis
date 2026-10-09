import { useState } from 'react';
import { Linking, Pressable, TextInput, View, StyleSheet } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { api, absoluteUrl } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { confirm, notify } from '@/lib/dialog';
import { fmtDate, fmtMoney } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';
import type { Invoice, InvoiceLine } from '@/lib/types';
import { Button, Card, Divider, ErrorBox, Icon, Loading, Pill, Row, Screen, Section, Txt, stateTone, useDir } from '@/components/ui';

type EditLine = { id?: number; description: string; quantity: string; unit: InvoiceLine['unit']; unit_price: string };

const toEdit = (l: InvoiceLine): EditLine => ({ id: l.id, description: l.description, quantity: String(l.quantity), unit: l.unit, unit_price: (l.unit_price / 100).toFixed(2) });

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, errorText } = useI18n();
  const { textAlign } = useDir();
  const res = useApi<Invoice>(`/invoices/${id}`);
  const inv = res.data;
  // Local edits; null means "show what the server has".
  const [edits, setEdits] = useState<EditLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const serverLines = inv?.lines?.map(toEdit) ?? null;
  const lines = edits ?? serverLines;
  const setLines = (fn: (ls: EditLine[] | null) => EditLine[]) => setEdits((e) => fn(e ?? serverLines));

  const draft = inv?.status === 'draft';
  const dirty = Boolean(edits && serverLines && JSON.stringify(serverLines) !== JSON.stringify(edits));
  const liveSubtotal = Math.round((lines ?? []).reduce((s, l) => s + (Number(l.quantity) || 0) * Math.round((Number(l.unit_price) || 0) * 100), 0));
  const liveVat = Math.round(liveSubtotal * (inv?.vat_rate ?? 0.15));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await res.reload();
      setEdits(null);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(() =>
      api(`/invoices/${id}`, {
        method: 'PATCH',
        body: { lines: (lines ?? []).map((l) => ({ id: l.id, description: l.description, quantity: Number(l.quantity), unit: l.unit, unit_price: Number(l.unit_price) })) },
      }),
    );

  async function approve() {
    if (!(await confirm(t.invoices.approve, `${inv?.client_name} · ${fmtMoney(inv?.total ?? 0, lang)}`, t.common.confirm, t.common.cancel))) return;
    run(() => api(`/invoices/${id}/approve`, { method: 'POST' }));
  }

  async function remove() {
    if (!(await confirm(t.invoices.deleteDraft, inv?.client_name ?? '', t.common.delete, t.common.cancel, true))) return;
    try {
      await api(`/invoices/${id}`, { method: 'DELETE' });
      router.back();
    } catch (e) {
      notify(errorText(e));
    }
  }

  const update = (i: number, patch: Partial<EditLine>) => setLines((ls) => (ls ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Screen edges={['bottom']} refreshing={res.refreshing} onRefresh={res.reload}>
      <Stack.Screen options={{ title: inv?.number ?? t.invoices.status.draft }} />
      {res.error ? <ErrorBox error={res.error} onRetry={res.reload} /> : null}
      {!inv || !lines ? (
        <Loading />
      ) : (
        <>
          <Card>
            <Row justify="space-between">
              <Txt variant="h2" style={{ flex: 1 }}>{inv.client_name}</Txt>
              <Pill label={t.invoices.status[inv.status]} tone={stateTone(inv.status)} />
            </Row>
            <Txt variant="small">{`${t.invoices.week}: ${fmtDate(inv.week_start, lang)} – ${fmtDate(inv.week_end, lang)}`}</Txt>
            {inv.client_vat_number ? <Txt variant="small">{`${t.invoices.clientVat}: ${inv.client_vat_number}`}</Txt> : null}
            <Divider />
            <Row justify="space-between"><Txt variant="muted">{t.invoices.subtotal}</Txt><Txt>{fmtMoney(draft ? liveSubtotal : inv.subtotal, lang)}</Txt></Row>
            <Row justify="space-between"><Txt variant="muted">{t.invoices.vat}</Txt><Txt>{fmtMoney(draft ? liveVat : inv.vat_amount, lang)}</Txt></Row>
            <Row justify="space-between"><Txt weight="800">{t.invoices.total}</Txt><Txt weight="800" color={colors.primary}>{fmtMoney(draft ? liveSubtotal + liveVat : inv.total, lang)}</Txt></Row>
          </Card>

          <Row gap={space.sm} wrap>
            <Button small variant="secondary" icon="print-outline" label={t.invoices.print} onPress={() => inv.print_url && Linking.openURL(absoluteUrl(inv.print_url)!)} />
            {draft ? <Button small icon="checkmark-done" label={t.invoices.approve} onPress={approve} disabled={dirty || busy} /> : null}
            {inv.status === 'approved' ? <Button small variant="good" icon="cash-outline" label={t.invoices.markPaid} onPress={() => run(() => api(`/invoices/${id}/mark-paid`, { method: 'POST' }))} /> : null}
            {draft ? <Button small variant="danger" icon="trash-outline" label={t.invoices.deleteDraft} onPress={remove} /> : null}
          </Row>

          <Section title={`${t.invoices.lines} (${lines.length})`} action={draft && dirty ? <Button small label={t.common.save} onPress={save} loading={busy} /> : undefined}>
            {lines.map((l, i) => (
              <Card key={l.id ?? `new-${i}`}>
                {draft ? (
                  <>
                    <TextInput style={[styles.input, { textAlign }]} value={l.description} onChangeText={(v) => update(i, { description: v })} placeholder={t.invoices.description} multiline />
                    <Row gap={space.sm} style={{ marginTop: space.sm }}>
                      <View style={{ flex: 1 }}>
                        <Txt variant="small">{`${t.invoices.qty} (${t.invoices.units[l.unit]})`}</Txt>
                        <TextInput style={styles.input} value={l.quantity} onChangeText={(v) => update(i, { quantity: v })} keyboardType="decimal-pad" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt variant="small">{`${t.invoices.price} (${t.common.sar})`}</Txt>
                        <TextInput style={styles.input} value={l.unit_price} onChangeText={(v) => update(i, { unit_price: v })} keyboardType="decimal-pad" />
                      </View>
                      <Pressable onPress={() => setLines((ls) => (ls ?? []).filter((_, j) => j !== i))} hitSlop={10} style={{ paddingTop: 18 }} accessibilityLabel={t.common.delete}>
                        <Icon name="trash-outline" size={20} color={colors.bad} />
                      </Pressable>
                    </Row>
                  </>
                ) : (
                  <Row justify="space-between" align="flex-start">
                    <Txt variant="small" style={{ flex: 1 }}>{l.description}</Txt>
                    <Txt weight="600">{fmtMoney(Math.round(Number(l.quantity) * Math.round(Number(l.unit_price) * 100)), lang)}</Txt>
                  </Row>
                )}
              </Card>
            ))}
            {draft ? (
              <Button
                variant="secondary"
                icon="add"
                label={t.invoices.addLine}
                onPress={() => setLines((ls) => [...(ls ?? []), { description: '', quantity: '1', unit: 'item', unit_price: '0' }])}
              />
            ) : null}
          </Section>
          <Txt variant="small" center style={{ marginTop: space.lg }}>{t.invoices.zatcaNote}</Txt>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: colors.text, backgroundColor: colors.bg },
});
