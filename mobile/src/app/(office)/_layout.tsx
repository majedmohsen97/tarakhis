import { RoleGuard } from '@/components/RoleGuard';
import { TabsForRole } from '@/components/TabsForRole';
import { useI18n } from '@/lib/i18n';

export default function OfficeLayout() {
  const { t } = useI18n();
  return (
    <RoleGuard roles={['owner', 'manager', 'safety']}>
      <TabsForRole
        tabs={[
          { name: 'home', title: t.tabs.home, icon: 'grid-outline' },
          { name: 'live', title: t.tabs.live, icon: 'navigate-outline' },
          { name: 'schedule', title: t.tabs.schedule, icon: 'calendar-outline' },
          { name: 'fleet', title: t.tabs.fleet, icon: 'people-outline' },
          { name: 'more', title: t.tabs.more, icon: 'menu-outline' },
        ]}
      />
    </RoleGuard>
  );
}
