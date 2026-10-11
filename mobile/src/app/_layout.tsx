import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import { NotificationsProvider } from '@/lib/notifications';
import { colors } from '@/lib/theme';

const PUBLIC_ROUTES = ['login', 'register', 'server'];

function RootStack() {
  const { t } = useI18n();
  const { ready, user } = useAuth();
  const segments = useSegments();
  const isPublic = PUBLIC_ROUTES.includes(segments[0] ?? '');

  // Signed-out users who open a deep link land on the login screen.
  useEffect(() => {
    if (ready && !user && !isPublic && segments.length > 0) router.replace('/login');
  }, [ready, user, isPublic, segments.length]);

  return (
    <Stack
      screenOptions={{
        headerTitleAlign: 'center',
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: t.common.back,
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: t.auth.register }} />
      <Stack.Screen name="server" options={{ title: t.server.title }} />
      <Stack.Screen name="notifications" options={{ title: t.notif.title }} />
      <Stack.Screen name="(office)" options={{ headerShown: false }} />
      <Stack.Screen name="(gate)" options={{ headerShown: false }} />
      <Stack.Screen name="(driver)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <NotificationsProvider>
            <StatusBar style="dark" />
            <RootStack />
          </NotificationsProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
