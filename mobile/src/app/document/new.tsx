import { useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { api, type UploadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { notify } from '@/lib/dialog';
import { isIsoDate, westernDigits } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import type { OwnerType, Site } from '@/lib/types';
import { DateField } from '@/components/DateField';
import { FilePicker } from '@/components/FilePicker';
import { Button, Card, Field, Screen, Select, Txt } from '@/components/ui';

export default function NewDocument() {
  const params = useLocalSearchParams<{ owner_type?: OwnerType; owner_id?: string; doc_type?: string }>();
  const { t, errorText } = useI18n();
  const { user } = useAuth();
  const ownerType: OwnerType = params.owner_type ?? (user?.role === 'driver' ? 'driver' : 'company');
  const ownerId = params.owner_id ?? (ownerType === 'driver' ? String(user?.id) : undefined);
  const types = useApi<Record<OwnerType, string[]>>('/documents/types');
  const sites = useApi<Site[]>(ownerType !== 'driver' ? '/sites' : null);

  const [docType, setDocType] = useState<string | null>(params.doc_type ?? null);
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [issue, setIssue] = useState('');
  const [siteId, setSiteId] = useState<number | null>(null);
  const [file, setFile] = useState<UploadFile | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = docType && (file || isIsoDate(expiry)) && (!expiry || isIsoDate(expiry)) && (!issue || isIsoDate(issue));

  async function submit() {
    setBusy(true);
    try {
      await api('/documents', {
        method: 'POST',
        form: {
          owner_type: ownerType,
          owner_id: ownerId,
          doc_type: docType,
          number: westernDigits(number),
          expiry_date: expiry,
          issue_date: issue,
          site_id: docType === 'landfill_permit' && siteId ? siteId : undefined,
          file: file ?? undefined,
        },
      });
      if (user?.role === 'driver') notify('✔', t.docs.uploadedPending);
      router.back();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t.docs.upload }} />
      <Card style={{ padding: space.lg }}>
        <Txt variant="small" style={{ marginBottom: space.md }}>{`${t.docs.uploadFor}: ${t.owners[ownerType]}`}</Txt>
        <Select
          label={t.docs.type}
          value={docType}
          options={(types.data?.[ownerType] ?? []).map((v) => ({ value: v, label: t.docTypes[v] ?? v }))}
          onChange={setDocType}
        />
        {docType === 'landfill_permit' && sites.data?.length ? (
          <Select
            label={t.docs.site}
            value={siteId}
            placeholder={t.docs.anySite}
            options={[{ value: 0, label: t.docs.anySite }, ...sites.data.map((s) => ({ value: s.id, label: s.name }))]}
            onChange={setSiteId}
          />
        ) : null}
        <Field label={`${t.docs.number} (${t.common.optional})`} value={number} onChangeText={setNumber} ltr />
        <DateField label={t.docs.expiryDate} value={expiry} onChange={setExpiry} />
        <DateField label={`${t.docs.issueDate} (${t.common.optional})`} value={issue} onChange={setIssue} />
        <Txt variant="label">{t.docs.file}</Txt>
        <FilePicker value={file} onChange={setFile} />
        {user?.role === 'driver' ? <Txt variant="small" color={colors.warn} style={{ marginBottom: space.sm }}>{t.docs.uploadedPending}</Txt> : null}
        <Button label={t.docs.upload} icon="cloud-upload-outline" onPress={submit} loading={busy} disabled={!canSubmit} />
      </Card>
    </Screen>
  );
}
