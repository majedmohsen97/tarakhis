import { useState } from 'react';
import { Platform, View, StyleSheet, Pressable } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { westernDigits } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { Button, Card, Field, Icon, Row, Screen, Txt } from '@/components/ui';
import { LanguageToggle } from '@/components/LanguageToggle';

export default function Login() {
  const { t, errorText } = useI18n();
  const { login, server } = useAuth();
  const host = server ? server.replace(/^https?:\/\//, '') : '';
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(westernDigits(phone), password);
      router.replace('/');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Row justify="flex-end">
        <LanguageToggle />
      </Row>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Icon name="shield-checkmark" size={40} color={colors.white} />
        </View>
        <Txt variant="title" center style={{ fontSize: 30, lineHeight: 40 }}>{t.appName}</Txt>
        <Txt variant="muted" center>{t.tagline}</Txt>
      </View>
      {!server ? (
        <Card tone="warn" style={{ padding: space.lg, gap: space.sm }}>
          <Txt weight="700" color={colors.warn}>{t.server.none}</Txt>
          <Txt variant="small">{t.server.noneHint}</Txt>
          <Button label={t.server.title} icon="link-outline" onPress={() => router.push('/server')} />
        </Card>
      ) : null}
      <Card style={{ padding: space.lg }}>
        <Field label={t.auth.phone} placeholder={t.auth.phoneHint} keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone} ltr />
        <Field label={t.auth.password} secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} autoComplete="password" />
        {error ? <Txt color={colors.bad} style={{ marginBottom: space.sm }}>{error}</Txt> : null}
        <Button label={t.auth.login} onPress={submit} loading={busy} disabled={!phone || !password || !server} />
      </Card>
      {Platform.OS !== 'web' && server ? (
        <Row justify="center" gap={space.sm}>
          <Txt variant="small" numberOfLines={1} style={{ flexShrink: 1 }}>{`${t.server.current}: ${host}`}</Txt>
          <Button small variant="ghost" label={t.server.change} onPress={() => router.push('/server')} />
        </Row>
      ) : null}
      <Link href="/register" asChild>
        <Pressable style={{ padding: space.md }}>
          <Txt center color={colors.primary} weight="600">{t.auth.noAccount}</Txt>
        </Pressable>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.sm, marginTop: space.xl, marginBottom: space.xl },
  logo: { width: 76, height: 76, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
