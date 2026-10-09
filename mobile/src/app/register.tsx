import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { westernDigits } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { Button, Card, Field, Screen, Txt } from '@/components/ui';
import { PhoneField, isSaudiMobile } from '@/components/PhoneField';

export default function Register() {
  const { t, lang, errorText } = useI18n();
  const { register } = useAuth();
  const [form, setForm] = useState({ company_name: '', cr_number: '', name: '', phone: '', password: '', invite_code: '' });
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Pilot servers can require an invite code (REGISTRATION_CODE on the server).
  useEffect(() => {
    api<{ registration_requires_code: boolean }>('/config')
      .then((c) => setNeedsCode(c.registration_requires_code))
      .catch(() => {});
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await register({ ...form, phone: westernDigits(form.phone), cr_number: westernDigits(form.cr_number), lang });
      router.replace('/');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Card style={{ padding: space.lg }}>
        {needsCode ? (
          <Field label={t.auth.inviteCode} hint={t.auth.inviteHint} value={form.invite_code} onChangeText={set('invite_code')} autoCapitalize="characters" ltr />
        ) : null}
        <Field label={t.auth.companyName} value={form.company_name} onChangeText={set('company_name')} />
        <Field label={`${t.auth.crNumber} (${t.common.optional})`} value={form.cr_number} onChangeText={set('cr_number')} keyboardType="number-pad" ltr />
        <Field label={t.auth.yourName} value={form.name} onChangeText={set('name')} autoComplete="name" />
        <PhoneField value={form.phone} onChange={set('phone')} />
        <Field label={t.auth.password} hint={t.auth.passwordHint} value={form.password} onChangeText={set('password')} secureTextEntry />
        {error ? <Txt color={colors.bad} style={{ marginBottom: space.sm }}>{error}</Txt> : null}
        <Button
          label={t.auth.createAccount}
          onPress={submit}
          loading={busy}
          disabled={!form.company_name || !form.name || !isSaudiMobile(form.phone) || form.password.length < 8 || (needsCode && !form.invite_code)}
        />
      </Card>
    </Screen>
  );
}
