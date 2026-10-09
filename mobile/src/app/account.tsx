import { Stack } from 'expo-router';
import { AccountScreen } from '@/components/AccountScreen';
import { useI18n } from '@/lib/i18n';

export default function Account() {
  const { t } = useI18n();
  return (
    <>
      <Stack.Screen options={{ title: t.tabs.profile }} />
      <AccountScreen inStack />
    </>
  );
}
