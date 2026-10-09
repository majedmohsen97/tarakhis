import { View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import type { GateLog } from '@/lib/types';
import { Card, Icon, Pill, Row, Txt } from './ui';

export function GateLogRow({ log }: { log: GateLog }) {
  const { t, lang } = useI18n();
  const ok = log.verdict === 'allowed';
  const reasons = log.reasons
    .map((r) => (r.requirement ? `${t.requirements[r.requirement] ?? r.requirement}: ${t.gate.reasons[r.code] ?? r.code}` : t.gate.reasons[r.code] ?? r.code))
    .join(lang === 'ar' ? '، ' : ', ');
  return (
    <Card>
      <Row gap={space.md} align="flex-start">
        <Icon name={ok ? 'checkmark-circle' : 'close-circle'} size={26} color={ok ? colors.good : colors.bad} />
        <View style={{ flex: 1 }}>
          <Txt weight="700">{log.driver_name}</Txt>
          <Txt variant="small">{[log.plate_number, log.site_name, fmtDateTime(log.created_at, lang)].filter(Boolean).join(' · ')}</Txt>
          {reasons ? <Txt variant="small" color={colors.bad}>{reasons}</Txt> : null}
          {log.source === 'public' ? <Txt variant="small">{t.gate.publicScan}</Txt> : log.scanned_by_name ? <Txt variant="small">{log.scanned_by_name}</Txt> : null}
        </View>
        <Pill label={ok ? t.gate.allowed : t.gate.denied} tone={ok ? 'good' : 'bad'} />
      </Row>
    </Card>
  );
}
