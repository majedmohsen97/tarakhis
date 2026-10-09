import { useI18n } from '@/lib/i18n';
import { Header, Screen } from '@/components/ui';
import { WeekSchedule } from '@/components/WeekSchedule';

/** Weekly plan for gate security: who should arrive today and who already entered. */
export default function GateToday() {
  const { t } = useI18n();
  return (
    <Screen>
      <Header title={t.schedule.expected} />
      <WeekSchedule mode="gate" />
    </Screen>
  );
}
