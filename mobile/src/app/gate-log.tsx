import { useState } from 'react';
import { Stack } from 'expo-router';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { addDays, fmtDate, todayIso } from '@/lib/format';
import type { GateLog } from '@/lib/types';
import { GateLogRow } from '@/components/GateLogRow';
import { Button, Empty, ErrorBox, Loading, Row, Screen, Segmented, Txt } from '@/components/ui';

export default function GateLogScreen() {
  const { t, lang } = useI18n();
  const [date, setDate] = useState(todayIso());
  const [verdict, setVerdict] = useState<'all' | 'allowed' | 'denied'>('all');
  const logs = useApi<GateLog[]>(`/gate/logs?date=${date}${verdict !== 'all' ? `&verdict=${verdict}` : ''}`);

  return (
    <Screen edges={['bottom']} refreshing={logs.refreshing} onRefresh={logs.reload}>
      <Stack.Screen options={{ title: t.gate.logTitle }} />
      <Row justify="space-between" style={{ marginBottom: 8 }}>
        <Button small variant="ghost" icon={lang === 'ar' ? 'chevron-forward' : 'chevron-back'} label="" onPress={() => setDate(addDays(date, -1))} />
        <Txt weight="700">{date === todayIso() ? `${t.common.today} · ${fmtDate(date, lang)}` : fmtDate(date, lang)}</Txt>
        <Button small variant="ghost" icon={lang === 'ar' ? 'chevron-back' : 'chevron-forward'} label="" onPress={() => setDate(addDays(date, 1))} disabled={date >= todayIso()} />
      </Row>
      <Segmented
        value={verdict}
        onChange={setVerdict}
        options={[
          { value: 'all', label: t.common.all },
          { value: 'allowed', label: t.gate.allowed },
          { value: 'denied', label: t.gate.denied },
        ]}
      />
      {logs.error ? <ErrorBox error={logs.error} onRetry={logs.reload} /> : null}
      {logs.loading ? <Loading /> : logs.data?.length ? logs.data.map((l) => <GateLogRow key={l.id} log={l} />) : <Empty text={t.gate.noLogs} icon="scan-outline" />}
    </Screen>
  );
}
