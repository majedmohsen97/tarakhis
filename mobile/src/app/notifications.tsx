import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import { notificationText, useNotifications, type NotificationItem } from '@/lib/notifications';
import { enableNotifications, getPermission, type PermissionState } from '@/lib/push';
import { colors, space } from '@/lib/theme';
import { Button, Card, Empty, ErrorBox, Icon, Loading, Row, Screen, Txt } from '@/components/ui';

export default function NotificationsScreen() {
  const { t, lang } = useI18n();
  const { refresh: refreshBadge } = useNotifications();
  const list = useApi<{ unread: number; items: NotificationItem[] }>('/notifications');
  const [permission, setPermission] = useState<PermissionState | null>(null);

  useEffect(() => {
    getPermission().then(setPermission);
  }, []);

  const markRead = useCallback(
    async (ids?: number[]) => {
      await api('/notifications/read', { method: 'POST', body: ids ? { ids } : {} }).catch(() => {});
      list.reload();
      refreshBadge();
    },
    [list, refreshBadge],
  );

  async function open(n: NotificationItem) {
    if (!n.read_at) markRead([n.id]);
    if (n.document_id) router.push(`/document/${n.document_id}`);
  }

  const items = list.data?.items ?? [];
  return (
    <Screen edges={['bottom']} refreshing={list.refreshing} onRefresh={list.reload}>
      <Stack.Screen options={{ title: t.notif.title }} />

      {permission && permission !== 'granted' && permission !== 'unsupported' ? (
        <Card tone="info" style={{ gap: space.sm }}>
          <Txt variant="small">{t.notif.enableHint}</Txt>
          {permission === 'denied' ? (
            <Txt color={colors.warn}>{t.notif.denied}</Txt>
          ) : (
            <Button label={t.notif.enable} icon="notifications-outline" onPress={async () => setPermission(await enableNotifications())} />
          )}
        </Card>
      ) : permission === 'granted' ? (
        <Txt variant="small" color={colors.good} style={{ marginBottom: space.sm }}>{t.notif.enabled}</Txt>
      ) : null}

      {list.data?.unread ? <Button small variant="ghost" icon="checkmark-done" label={t.notif.markAll} onPress={() => markRead()} style={{ alignSelf: 'flex-start' }} /> : null}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.loading ? <Loading /> : !items.length ? <Empty text={t.notif.empty} icon="notifications-off-outline" /> : null}

      {items.map((n) => {
        const { title, body } = notificationText(t, n);
        const expired = n.days_left != null && n.days_left < 0;
        const color = n.kind === 'doc_pending' ? colors.info : expired ? colors.bad : colors.warn;
        return (
          <Card key={n.id} onPress={() => open(n)} style={!n.read_at ? { borderColor: color, borderWidth: 1.5 } : { opacity: 0.75 }}>
            <Row gap={space.md} align="flex-start">
              <Icon name={n.kind === 'doc_pending' ? 'time' : expired ? 'close-circle' : 'warning'} size={24} color={color} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight={n.read_at ? '400' : '700'}>{title}</Txt>
                {body ? <Txt variant="small">{body}</Txt> : null}
                <Txt variant="small">{fmtDateTime(n.created_at, lang)}</Txt>
              </View>
              {!n.read_at ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginTop: 6 }} /> : null}
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
