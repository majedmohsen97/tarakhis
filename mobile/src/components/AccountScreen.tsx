import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { notify } from '@/lib/dialog';
import { fmtPhone } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { Avatar, Button, Card, Field, Header, Row, Screen, Section, Segmented, Txt } from './ui';

export function AccountScreen({ inStack = false }: { inStack?: boolean }) {
  const { t, lang, setLang, errorText } = useI18n();
  const { user, company, logout, refresh } = useAuth();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function changePassword() {
    setBusy(true);
    try {
      await api('/auth/me/password', { method: 'POST', body: { current_password: pw.current, new_password: pw.next } });
      setPw({ current: '', next: '' });
      notify('✔', t.auth.changePassword);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={inStack ? ['bottom'] : ['top']}>
      {inStack ? null : <Header title={t.tabs.profile} />}
      <Card>
        <Row gap={space.md}>
          <Avatar name={user.name} url={user.photo_url} size={56} />
          <View style={{ flex: 1 }}>
            <Txt weight="700">{user.name}</Txt>
            <Txt variant="small">{`${t.roles[user.role]} · ${company?.name ?? ''}`}</Txt>
          </View>
        </Row>
        <Txt variant="small" style={{ marginTop: space.sm }}>{fmtPhone(user.phone)}</Txt>
      </Card>

      <Section title={t.more.language}>
        <Segmented
          value={lang}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(l) => {
            setLang(l);
            api('/auth/me', { method: 'PATCH', body: { lang: l } }).catch(() => {});
          }}
        />
      </Section>

      {user.role === 'driver' && user.location_consent_at ? (
        <Section title={t.auth.locationSharing}>
          <Card>
            <Row justify="space-between">
              <Txt color={colors.good} weight="600">{`✔ ${t.auth.consentGiven}`}</Txt>
              <Button
                small
                variant="danger"
                label={t.auth.withdraw}
                onPress={async () => {
                  try {
                    await api('/auth/me', { method: 'PATCH', body: { location_consent: false } });
                    await refresh();
                  } catch (e) {
                    notify(errorText(e));
                  }
                }}
              />
            </Row>
          </Card>
        </Section>
      ) : null}

      <Section title={t.auth.changePassword}>
        <Card>
          <Field label={t.auth.currentPassword} secureTextEntry value={pw.current} onChangeText={(v) => setPw((p) => ({ ...p, current: v }))} />
          <Field label={t.auth.newPassword} hint={t.auth.passwordHint} secureTextEntry value={pw.next} onChangeText={(v) => setPw((p) => ({ ...p, next: v }))} />
          <Button label={t.common.save} variant="secondary" onPress={changePassword} loading={busy} disabled={!pw.current || pw.next.length < 8} />
        </Card>
      </Section>

      <Button
        label={t.auth.logout}
        icon="log-out-outline"
        variant="danger"
        style={{ marginTop: space.xl }}
        onPress={async () => {
          await logout();
          router.replace('/login');
        }}
      />
      <Txt variant="small" center style={{ marginTop: space.lg, color: colors.muted }}>Tarakhis v0.1</Txt>
    </Screen>
  );
}
