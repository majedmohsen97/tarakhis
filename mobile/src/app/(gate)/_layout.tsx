import { RoleGuard } from '@/components/RoleGuard';
import { TabsForRole } from '@/components/TabsForRole';
import { useI18n } from '@/lib/i18n';

export default function GateLayout() {
  const { t } = useI18n();
  return (
    <RoleGuard roles={['gate']}>
      <TabsForRole
        tabs={[
          { name: 'scan', title: t.tabs.scan, icon: 'scan-outline' },
          { name: 'today', title: t.schedule.expected, icon: 'calendar-outline' },
          { name: 'log', title: t.tabs.log, icon: 'list-outline' },
          { name: 'gate-account', title: t.tabs.profile, icon: 'person-circle-outline' },
        ]}
      />
    </RoleGuard>
  );
}
