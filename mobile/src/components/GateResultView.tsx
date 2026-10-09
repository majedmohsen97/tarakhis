import { StyleSheet, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { fmtDate } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';
import type { GateCheck, GateReason } from '@/lib/types';
import { Avatar, Card, Icon, Pill, Row, Txt, stateTone } from './ui';

type Props = {
  verdict: 'allowed' | 'denied';
  checks: GateCheck[];
  reasons: GateReason[];
  warnings: GateReason[];
  driver?: { name: string; nationality: string | null; photo_url: string | null };
  company_name?: string;
  vehicle?: { plate_number: string; type: string | null } | null;
  compact?: boolean;
};

/** Big green / red answer for the gate guard, plus the document checklist behind it. */
export function GateResultView({ verdict, checks, reasons, warnings, driver, company_name, vehicle, compact }: Props) {
  const { t, lang } = useI18n();
  const ok = verdict === 'allowed';
  const nonDocReasons = reasons.filter((r) => !r.requirement);
  return (
    <View>
      <View style={[styles.banner, { backgroundColor: ok ? colors.good : colors.bad }]}>
        <Row gap={space.md} justify="center">
          <Icon name={ok ? 'checkmark-circle' : 'close-circle'} size={compact ? 28 : 40} color={colors.white} />
          <Txt variant={compact ? 'h2' : 'title'} color={colors.white}>{ok ? (compact ? t.pass.statusOk : t.gate.allowed) : compact ? t.pass.statusBad : t.gate.denied}</Txt>
        </Row>
      </View>

      {driver ? (
        <Card>
          <Row gap={space.md}>
            <Avatar name={driver.name} url={driver.photo_url} size={84} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="h2">{driver.name}</Txt>
              {company_name ? <Txt variant="small">{company_name}</Txt> : null}
              {driver.nationality ? <Txt variant="small">{driver.nationality}</Txt> : null}
              <View style={styles.plate}>
                <Txt weight="800" center>{vehicle?.plate_number ?? '—'}</Txt>
              </View>
            </View>
          </Row>
        </Card>
      ) : null}

      {nonDocReasons.map((r) => (
        <Card key={r.code} tone="bad">
          <Txt color={colors.bad} weight="600">{t.gate.reasons[r.code] ?? r.code}</Txt>
        </Card>
      ))}

      <Card>
        {checks.map((c) => (
          <Row key={c.requirement} justify="space-between" style={styles.check}>
            <View style={{ flex: 1 }}>
              <Txt weight="600">{t.requirements[c.requirement] ?? c.requirement}</Txt>
              {c.expiry_date ? <Txt variant="small">{fmtDate(c.expiry_date, lang)}{c.days_left != null && c.state !== 'valid' ? ` · ${t.common.daysLeft(c.days_left)}` : ''}</Txt> : null}
            </View>
            <Pill label={t.docStates[c.state]} tone={stateTone(c.state)} icon={c.ok ? 'checkmark' : 'close'} />
          </Row>
        ))}
      </Card>

      {warnings.some((w) => w.code === 'NOT_SCHEDULED_TODAY') ? (
        <Card tone="warn">
          <Row gap={space.sm}>
            <Icon name="calendar-outline" color={colors.warn} />
            <Txt color={colors.warn}>{t.gate.notScheduled}</Txt>
          </Row>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm },
  plate: { marginTop: 6, alignSelf: 'flex-start', borderWidth: 2, borderColor: colors.text, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: colors.white },
  check: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
});
