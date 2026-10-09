import { useI18n } from '@/lib/i18n';
import { Header, Screen } from '@/components/ui';
import { WeekSchedule } from '@/components/WeekSchedule';
import { useAuth, isManager } from '@/lib/auth';

export default function Schedule() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <Screen>
      <Header title={t.schedule.title} />
      <WeekSchedule mode={isManager(user) ? 'manage' : 'gate'} />
    </Screen>
  );
}
