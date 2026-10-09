import { useEffect, useState } from 'react';
import { api, apiUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { notify, shareText } from '@/lib/dialog';
import { fmtPhone } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { Button, Card, Field, Row, Txt } from './ui';

/** The server's public link (what employees open), falling back to this app's own address. */
export function usePublicLink() {
  const [link, setLink] = useState(apiUrl());
  useEffect(() => {
    api<{ public_url: string | null }>('/config')
      .then((c) => c.public_url && setLink(c.public_url))
      .catch(() => {});
  }, []);
  return link;
}

/** Shows a password once it is set, with a button to send the login details (WhatsApp, SMS…). */
export function LoginDetails({ name, phone, password }: { name: string; phone: string; password: string }) {
  const { t } = useI18n();
  const link = usePublicLink();
  return (
    <Card tone="good" style={{ gap: space.sm }}>
      <Txt variant="label">{t.fleet.passwordTitle}</Txt>
      <Txt variant="title" selectable style={{ letterSpacing: 2, writingDirection: 'ltr' }}>{password}</Txt>
      <Txt variant="small" color={colors.warn}>{t.fleet.tempPasswordHint}</Txt>
      <Button
        label={t.fleet.shareLogin}
        icon="share-social-outline"
        variant="secondary"
        onPress={async () => {
          const res = await shareText(t.fleet.loginMessage(name, fmtPhone(phone), password, link));
          if (res === 'copied') notify(t.fleet.copied);
        }}
      />
    </Card>
  );
}

/** Lets a manager set a chosen password for an employee, or generate a temporary one. */
export function PasswordCard({ userId, name, phone }: { userId: number; name: string; phone: string }) {
  const { t, errorText } = useI18n();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(chosen: string | null) {
    setBusy(true);
    try {
      const res = await api<{ temp_password: string | null }>(`/users/${userId}/reset-password`, {
        method: 'POST',
        body: chosen ? { password: chosen } : {},
      });
      setResult(chosen ?? res.temp_password);
      setValue('');
      if (chosen) notify(t.fleet.passwordSaved);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <Txt variant="small" style={{ marginBottom: space.sm }}>{t.fleet.passwordHelp}</Txt>
        <Field label={t.auth.newPassword} hint={t.auth.passwordHint} value={value} onChangeText={setValue} autoCapitalize="none" ltr />
        <Row gap={space.sm}>
          <Button label={t.fleet.setPassword} icon="key-outline" onPress={() => submit(value)} loading={busy} disabled={value.length < 8} style={{ flex: 1 }} />
          <Button label={t.fleet.generateTemp} variant="secondary" onPress={() => submit(null)} disabled={busy} style={{ flex: 1 }} />
        </Row>
      </Card>
      {result ? <LoginDetails name={name} phone={phone} password={result} /> : null}
    </>
  );
}
