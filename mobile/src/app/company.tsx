import { useState } from 'react';
import { Stack, router } from 'expo-router';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useAuth, isManager } from '@/lib/auth';
import { notify } from '@/lib/dialog';
import { space } from '@/lib/theme';
import type { Company, Doc } from '@/lib/types';
import { DocList } from '@/components/docs';
import { PhoneField } from '@/components/PhoneField';
import { Button, Card, ErrorBox, Field, Loading, Screen, Section } from '@/components/ui';

export default function CompanyScreen() {
  const { t, errorText } = useI18n();
  const { user, refresh } = useAuth();
  const company = useApi<Company>('/company');
  const docs = useApi<Doc[]>('/documents?owner_type=company');
  const [form, setForm] = useState<Partial<Company>>({});
  const [busy, setBusy] = useState(false);
  const c = company.data;
  const editable = isManager(user);

  async function save() {
    setBusy(true);
    try {
      await api('/company', { method: 'PATCH', body: form });
      setForm({});
      company.reload();
      refresh();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof Company, label: string, ltr = false) => (
    <Field label={label} value={String(form[key] ?? c?.[key] ?? '')} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} editable={editable} ltr={ltr} />
  );

  return (
    <Screen edges={['bottom']} refreshing={docs.refreshing} onRefresh={() => { company.reload(); docs.reload(); }}>
      <Stack.Screen options={{ title: t.more.company }} />
      {company.error ? <ErrorBox error={company.error} /> : null}
      {!c ? (
        <Loading />
      ) : (
        <Card style={{ padding: space.lg }}>
          {field('name', t.auth.companyName)}
          {field('cr_number', t.auth.crNumber, true)}
          {field('vat_number', t.company.vat, true)}
          {field('city', t.company.city)}
          <PhoneField kind="any" label={t.company.phone} value={String(form.phone ?? c.phone ?? '')} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} editable={editable} />
          {editable ? <Button label={t.common.save} onPress={save} loading={busy} disabled={!Object.keys(form).length} /> : null}
        </Card>
      )}
      <Section
        title={t.docs.companyDocs}
        action={<Button small icon="cloud-upload-outline" label={t.docs.upload} onPress={() => router.push({ pathname: '/document/new', params: { owner_type: 'company' } })} />}>
        {docs.data ? <DocList docs={docs.data} /> : <Loading />}
      </Section>
    </Screen>
  );
}
