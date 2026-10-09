import { useI18n } from '@/lib/i18n';
import { Header, Screen } from '@/components/ui';
import { WeekSchedule } from '@/components/WeekSchedule';

export default function DriverWeek() {
  const { t } = useI18n();
  return (
    <Screen>
      <Header title={t.tabs.week} />
      <WeekSchedule mode="driver" />
    </Screen>
  );
}
