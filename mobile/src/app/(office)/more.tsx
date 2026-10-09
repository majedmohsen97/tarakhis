import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth, isManager } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { colors, radius, space } from '@/lib/theme';
import { Button, Header, Icon, ListRow, Screen, type IconName } from '@/components/ui';

export default function More() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const items: { title: string; icon: IconName; href: string; show: boolean }[] = [
    { title: t.more.documents, icon: 'documents-outline', href: '/documents', show: true },
    { title: t.more.companyDocs, icon: 'business-outline', href: '/company', show: true },
    { title: t.more.invoices, icon: 'receipt-outline', href: '/invoices', show: isManager(user) },
    { title: t.more.gateLog, icon: 'scan-outline', href: '/gate-log', show: true },
    { title: t.more.connect, icon: 'qr-code-outline', href: '/connect', show: true },
    { title: t.more.staff, icon: 'people-circle-outline', href: '/staff', show: isManager(user) },
    { title: t.tabs.profile, icon: 'person-circle-outline', href: '/account', show: true },
  ];
  return (
    <Screen>
      <Header title={t.more.title} />
      <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
        {items
          .filter((i) => i.show)
          .map((i) => (
            <ListRow key={i.href} title={i.title} leading={<Icon name={i.icon} size={24} color={colors.primary} />} onPress={() => router.push(i.href as any)} />
          ))}
      </View>
      <Button
        label={t.auth.logout}
        icon="log-out-outline"
        variant="danger"
        style={{ marginTop: space.xl }}
        onPress={async () => {
          await logout();
          router.replace('/login');
        }}
      />
    </Screen>
  );
}
