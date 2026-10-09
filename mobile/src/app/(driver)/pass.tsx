import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { colors, radius, space } from '@/lib/theme';
import type { Pass } from '@/lib/types';
import { GateResultView } from '@/components/GateResultView';
import { Button, Card, ErrorBox, Header, Loading, Row, Screen, Txt } from '@/components/ui';

const CACHE_KEY = 'tarakhis.lastPass';

/** The driver's rotating gate pass: QR for scanning + a 6-digit fallback code. */
export default function PassScreen() {
  const { t } = useI18n();
  const { user, company } = useAuth();
  const [pass, setPass] = useState<Pass | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    try {
      const p = await api<Pass>('/gate/pass');
      setPass(p);
      setOffline(false);
      setError(null);
      storage.set(CACHE_KEY, JSON.stringify(p));
      // Fetch a fresh pass a minute before this one expires.
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => loadRef.current(), Math.max(5_000, Date.parse(p.expires_at) - Date.now() - 60_000));
    } catch (e: any) {
      if (e?.code === 'NETWORK') {
        const cached = await storage.get(CACHE_KEY);
        if (cached) {
          setPass(JSON.parse(cached));
          setOffline(true);
          return;
        }
      }
      setError(e);
    }
  }, []);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      const tick = setInterval(() => setNow(Date.now()), 1000);
      return () => {
        clearInterval(tick);
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
      };
    }, [load]),
  );

  const msLeft = pass ? Date.parse(pass.expires_at) - now : 0;
  const mm = Math.max(0, Math.floor(msLeft / 60000));
  const ss = Math.max(0, Math.floor((msLeft % 60000) / 1000));

  return (
    <Screen onRefresh={load}>
      <Header title={t.pass.title} subtitle={company?.name} />
      {error ? <ErrorBox error={error} onRetry={load} /> : null}
      {!pass ? (
        !error ? <Loading /> : null
      ) : (
        <>
          <Card style={styles.qrCard}>
            <Txt weight="700" center>{user?.name}</Txt>
            {pass.vehicle ? <Txt variant="small" center>{`${t.pass.vehicle}: ${pass.vehicle.plate_number}`}</Txt> : null}
            <View style={styles.qr}>
              <QRCode value={pass.qr_value} size={230} color={colors.text} backgroundColor={colors.white} ecl="M" />
            </View>
            <Txt variant="small" center>{t.pass.code}</Txt>
            <Txt center style={styles.code} selectable>{pass.code}</Txt>
            <Row justify="center" gap={6}>
              <Txt variant="small" center color={offline ? colors.warn : colors.muted}>
                {offline ? t.pass.offline : t.pass.refreshesIn(`${mm}:${String(ss).padStart(2, '0')}`)}
              </Txt>
            </Row>
            <Txt variant="small" center>{t.pass.show}</Txt>
          </Card>
          <GateResultView compact verdict={pass.status.verdict} checks={pass.status.checks} reasons={pass.status.reasons} warnings={pass.status.warnings} />
          {pass.status.verdict === 'denied' ? (
            <Card tone="warn">
              <Txt color={colors.warn}>{t.pass.fix}</Txt>
              <Button small variant="secondary" icon="cloud-upload-outline" label={t.docs.upload} onPress={() => router.push('/my-docs')} style={{ marginTop: space.sm }} />
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrCard: { alignItems: 'center', paddingVertical: space.lg, gap: 4 },
  qr: { padding: space.md, backgroundColor: colors.white, borderRadius: radius.md, marginVertical: space.sm },
  code: { fontSize: 34, fontWeight: '800', letterSpacing: 8, color: colors.primary, lineHeight: 42 },
});
