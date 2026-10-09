import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { api, apiUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { colors, radius, space } from '@/lib/theme';
import { Button, Card, Loading, Screen, Txt } from '@/components/ui';

/** Shows the server address as a QR code so drivers and guards can connect their phones. */
export default function Connect() {
  const { t } = useI18n();
  // Prefer the server's public link (e.g. the Cloudflare URL) over the address this page was
  // opened with, which may be localhost on the office computer.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    api<{ public_url: string | null }>('/config')
      .then((c) => setUrl(c.public_url || apiUrl()))
      .catch(() => setUrl(apiUrl()));
  }, []);

  async function share() {
    if (!url) return;
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) await nav.share({ title: 'Tarakhis', url }).catch(() => {});
      else await nav?.clipboard?.writeText(url).catch(() => {});
      return;
    }
    await Share.share({ message: url });
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t.connect.title }} />
      {!url ? (
        <Loading />
      ) : (
        <>
          <Card style={styles.card}>
            <Txt center>{t.connect.hint}</Txt>
            <View style={styles.qr}>
              <QRCode value={url} size={240} color={colors.text} backgroundColor={colors.white} />
            </View>
            <Txt variant="small" center>{t.connect.linkHint}</Txt>
            <Txt weight="700" center selectable style={{ writingDirection: 'ltr' }}>{url}</Txt>
            <Button label={t.connect.share} icon="share-social-outline" variant="secondary" onPress={share} style={{ marginTop: space.sm, alignSelf: 'stretch' }} />
          </Card>
          {url.includes('trycloudflare.com') ? (
            <Card tone="warn">
              <Txt color={colors.warn}>{t.connect.changes}</Txt>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  qr: { padding: space.md, backgroundColor: colors.white, borderRadius: radius.md, marginVertical: space.sm },
});
