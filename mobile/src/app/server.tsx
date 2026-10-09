import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { normalizeServerUrl, pingServer } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { notify } from '@/lib/dialog';
import { colors, radius, space } from '@/lib/theme';
import { Button, Card, Field, Screen, Txt } from '@/components/ui';

/** Connect the app to a company server: paste the link or scan the supervisor's connect QR. */
export default function ServerSettings() {
  const { t } = useI18n();
  const { server, changeServer } = useAuth();
  const [value, setValue] = useState(server);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  async function save(input: string) {
    const url = normalizeServerUrl(input);
    if (!url) {
      setError(t.server.invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!(await pingServer(url))) {
        setError(t.server.unreachable);
        return;
      }
      await changeServer(url);
      notify(t.server.saved);
      router.replace('/login');
    } finally {
      setBusy(false);
      handled.current = false;
    }
  }

  async function startScan() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    handled.current = false;
    setScanning(true);
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t.server.title }} />
      {scanning ? (
        <View style={styles.cameraBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (handled.current) return;
              handled.current = true;
              setScanning(false);
              setValue(data);
              save(data);
            }}
          />
        </View>
      ) : null}
      <Card style={{ padding: space.lg }}>
        <Txt variant="small" style={{ marginBottom: space.md }}>{t.server.noneHint}</Txt>
        {Platform.OS !== 'web' ? (
          <Button
            label={scanning ? t.common.cancel : t.server.scan}
            icon="qr-code-outline"
            variant="secondary"
            onPress={() => (scanning ? setScanning(false) : startScan())}
            style={{ marginBottom: space.md }}
          />
        ) : null}
        <Field
          label={t.server.url}
          placeholder={t.server.placeholder}
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          ltr
          error={error}
        />
        <Button label={t.server.save} icon="checkmark" onPress={() => save(value)} loading={busy} disabled={!value.trim()} />
        {server ? <Txt variant="small" color={colors.warn} style={{ marginTop: space.md }}>{t.server.signOutNote}</Txt> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraBox: { height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', marginBottom: space.md },
});
