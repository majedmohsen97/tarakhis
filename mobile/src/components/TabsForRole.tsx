import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import type { IconName } from './ui';

export type TabDef = { name: string; title: string; icon: IconName };

/** Bottom tabs that read right-to-left in Arabic. */
export function TabsForRole({ tabs }: { tabs: TabDef[] }) {
  const { isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const ordered = isRTL ? [...tabs].reverse() : tabs;
  return (
    <Tabs
      key={isRTL ? 'rtl' : 'ltr'}
      initialRouteName={tabs[0].name}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        // Arabic glyphs need more vertical room than the default tab label box allows.
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line, height: 72 + insets.bottom, paddingTop: 6, paddingBottom: 8 + insets.bottom },
        tabBarLabelStyle: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
      }}>
      {ordered.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} size={size} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
