import { useState } from 'react';
import { Linking } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { api, absoluteUrl } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useAuth, isOffice } from '@/lib/auth';
import { confirm, notify } from '@/lib/dialog';
import { fmtDate, fmtHijri, isIsoDate } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';
import type { Doc } from '@/lib/types';
import { DateField } from '@/components/DateField';
import { Button, Card, Divider, ErrorBox, Field, Loading, Pill, Row, Screen, Txt, stateTone } from '@/components/ui';

export default function DocumentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, errorText } = useI18n();
  const { user } = useAuth();
  // There's no single-document endpoint for drivers, so read it from the list they can see.
  const list = useApi<Doc[]>('/documents');
  const doc = list.data?.find((d) => String(d.id) === id) ?? null;
  const [expiry, setExpiry] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const office = isOffice(user);

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/documents/${id}`, { method: 'PATCH', body: patch });
      list.reload();
      setExpiry(null);
      setNotes(null);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirm(t.common.delete, doc ? t.docTypes[doc.doc_type] : '', t.common.delete, t.common.cancel, true))) return;
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      router.back();
    } catch (e) {
      notify(errorText(e));
    }
  }

  const fileUrl = absoluteUrl(doc?.file_url);
  const isImage = doc?.file_mime?.startsWith('image/');

  return (
    <Screen edges={['bottom']} refreshing={list.refreshing} onRefresh={list.reload}>
      <Stack.Screen options={{ title: doc ? t.docTypes[doc.doc_type] ?? doc.doc_type : t.docs.title }} />
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {!doc ? (
        list.loading ? <Loading /> : <Txt variant="muted" center>{t.common.none}</Txt>
      ) : (
        <>
          <Card>
            <Row justify="space-between">
              <Txt variant="h2" style={{ flex: 1 }}>{t.docTypes[doc.doc_type] ?? doc.doc_type}</Txt>
              <Pill label={t.docStates[doc.state]} tone={stateTone(doc.state)} />
            </Row>
            {doc.owner_name ? <Txt variant="muted">{`${t.owners[doc.owner_type]}: ${doc.owner_name}`}</Txt> : null}
            <Divider />
            <Info label={t.docs.number} value={doc.number ?? '—'} />
            <Info label={t.docs.issueDate} value={fmtDate(doc.issue_date, lang)} />
            <Info label={t.docs.expiryDate} value={`${fmtDate(doc.expiry_date, lang)}${doc.expiry_date ? ` · ${fmtHijri(doc.expiry_date, lang) ?? ''}` : ''}`} />
            {doc.days_left != null ? <Info label="" value={t.common.daysLeft(doc.days_left)} color={doc.days_left < 0 ? colors.bad : doc.state === 'expiring' ? colors.warn : colors.good} /> : null}
            {doc.notes ? <Info label={t.docs.notes} value={doc.notes} /> : null}
          </Card>

          {fileUrl ? (
            <Card>
              {isImage ? <Image source={{ uri: fileUrl }} style={{ width: '100%', height: 320, borderRadius: radius.md, backgroundColor: colors.bg }} contentFit="contain" /> : null}
              <Button variant="secondary" icon="open-outline" label={t.docs.viewFile} onPress={() => Linking.openURL(fileUrl)} style={{ marginTop: isImage ? space.sm : 0 }} />
            </Card>
          ) : null}

          {office ? (
            <Card>
              <Row gap={space.sm} style={{ marginBottom: space.md }}>
                <Button label={t.docs.approve} icon="checkmark" variant="good" onPress={() => update({ status: 'approved' })} disabled={doc.status === 'approved'} loading={busy} style={{ flex: 1 }} />
                <Button label={t.docs.reject} icon="close" variant="danger" onPress={() => update({ status: 'rejected', notes: notes ?? doc.notes })} disabled={doc.status === 'rejected'} style={{ flex: 1 }} />
              </Row>
              <DateField label={t.docs.expiryDate} value={expiry ?? doc.expiry_date ?? ''} onChange={setExpiry} />
              <Field label={t.docs.notes} value={notes ?? doc.notes ?? ''} onChangeText={setNotes} multiline />
              <Button
                label={t.common.save}
                variant="secondary"
                onPress={() => update({ ...(expiry != null ? { expiry_date: expiry } : {}), ...(notes != null ? { notes } : {}) })}
                disabled={(expiry == null && notes == null) || (expiry != null && expiry !== '' && !isIsoDate(expiry))}
              />
              <Button label={t.common.delete} icon="trash-outline" variant="ghost" onPress={remove} style={{ marginTop: space.sm }} />
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Info({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Row justify="space-between" style={{ paddingVertical: 4 }}>
      <Txt variant="muted">{label}</Txt>
      <Txt weight="600" color={color} style={{ flexShrink: 1 }}>{value}</Txt>
    </Row>
  );
}
