import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNotifications } from '@/lib/notifications';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/lib/theme';

/** Bell with an unread badge; opens the notifications screen. */
export function NotificationBell() {
  const { unread } = useNotifications();
  const { t } = useI18n();
  return (
    <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button" accessibilityLabel={t.notif.title} hitSlop={8} style={styles.btn}>
      <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={24} color={colors.primary} />
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.bad, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
});
