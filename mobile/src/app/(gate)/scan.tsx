import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { westernDigits } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';
import type { GateResult, Site } from '@/lib/types';
import { GateResultView } from '@/components/GateResultView';
import { Button, Card, ErrorBox, Field, Header, Screen, Segmented, Select, Txt } from '@/components/ui';

export default function Scan() {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const sites = useApi<Site[]>('/sites');
  const [siteId, setSiteId] = useState<number | null>(null);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<GateResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const scanning = useRef(false);
  const activeSite = siteId ?? sites.data?.[0]?.id ?? null;

  async function verify(value: string) {
    if (scanning.current) return;
    scanning.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await api<GateResult>('/gate/scan', { method: 'POST', body: { code: westernDigits(value.trim()), site_id: activeSite, direction } });
      setResult(res);
      setCode('');
    } catch (e) {
      setError(e);
      scanning.current = false;
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    scanning.current = false;
  }

  if (result) {
    return (
      <Screen>
        <GateResultView {...result} />
        <Button label={t.gate.scanAgain} icon="scan-outline" onPress={reset} style={{ marginTop: space.md }} />
      </Screen>
    );
  }

  const cameraReady = permission?.granted;
  return (
    <Screen>
      <Header title={t.gate.scanTitle} />
      {sites.data && sites.data.length > 1 ? (
        <Select label={t.gate.site} value={activeSite} options={sites.data.map((s) => ({ value: s.id, label: s.name }))} onChange={setSiteId} />
      ) : null}
      <Segmented value={direction} onChange={setDirection} options={[{ value: 'in', label: t.gate.in }, { value: 'out', label: t.gate.out }]} />

      {cameraReady ? (
        <View style={styles.cameraBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => verify(data)}
          />
          <View style={styles.frame} pointerEvents="none" />
        </View>
      ) : (
        <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
          <Txt variant="muted" center>{permission && !permission.canAskAgain ? t.gate.cameraDenied : t.gate.scanHint}</Txt>
          {permission?.canAskAgain !== false ? <Button label={t.gate.cameraAllow} icon="camera-outline" onPress={requestPermission} /> : null}
        </Card>
      )}
      {cameraReady ? <Txt variant="small" center style={{ marginVertical: space.sm }}>{t.gate.scanHint}</Txt> : null}

      <Card style={{ marginTop: space.md }}>
        <Field
          label={t.gate.orCode}
          value={code}
          onChangeText={(v) => setCode(westernDigits(v).replace(/[^\d]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          ltr
          style={styles.codeInput}
          onSubmitEditing={() => code.length === 6 && verify(code)}
        />
        <Button label={t.gate.verify} icon="shield-checkmark-outline" onPress={() => verify(code)} disabled={code.length !== 6} loading={busy} />
      </Card>
      {error ? <ErrorBox error={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraBox: { height: 320, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  frame: { position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%', borderWidth: 3, borderColor: colors.white, borderRadius: radius.lg, opacity: 0.8 },
  codeInput: { fontSize: 28, letterSpacing: 8, textAlign: 'center', fontWeight: '700' },
});
