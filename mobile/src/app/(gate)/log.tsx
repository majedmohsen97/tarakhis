import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { todayIso } from '@/lib/format';
import type { GateLog } from '@/lib/types';
import { GateLogRow } from '@/components/GateLogRow';
import { Empty, ErrorBox, Header, Loading, Screen } from '@/components/ui';

export default function GateLogTab() {
  const { t } = useI18n();
  const logs = useApi<GateLog[]>(`/gate/logs?date=${todayIso()}`, { intervalMs: 30000 });
  return (
    <Screen refreshing={logs.refreshing} onRefresh={logs.reload}>
      <Header title={t.gate.logTitle} subtitle={t.common.today} />
      {logs.error ? <ErrorBox error={logs.error} onRetry={logs.reload} /> : null}
      {logs.loading ? <Loading /> : logs.data?.length ? logs.data.map((l) => <GateLogRow key={l.id} log={l} />) : <Empty text={t.gate.noLogs} icon="scan-outline" />}
    </Screen>
  );
}
