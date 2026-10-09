import { RoleGuard } from '@/components/RoleGuard';
import { TabsForRole } from '@/components/TabsForRole';
import { useI18n } from '@/lib/i18n';

export default function DriverLayout() {
  const { t } = useI18n();
  return (
    <RoleGuard roles={['driver']}>
      <TabsForRole
        tabs={[
          { name: 'pass', title: t.tabs.pass, icon: 'qr-code-outline' },
          { name: 'trip', title: t.tabs.trip, icon: 'navigate-outline' },
          { name: 'week', title: t.tabs.week, icon: 'calendar-outline' },
          { name: 'my-docs', title: t.tabs.docs, icon: 'folder-open-outline' },
          { name: 'driver-account', title: t.tabs.profile, icon: 'person-circle-outline' },
        ]}
      />
    </RoleGuard>
  );
}
