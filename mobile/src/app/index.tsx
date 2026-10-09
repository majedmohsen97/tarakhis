import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/ui';
import { colors } from '@/lib/theme';

/** Sends each user to the part of the app that matches their role. */
export default function Index() {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <Loading />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (user.role === 'driver') return <Redirect href="/pass" />;
  if (user.role === 'gate') return <Redirect href="/scan" />;
  return <Redirect href="/home" />;
}
