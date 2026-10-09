import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { confirm, notify } from '@/lib/dialog';
import { fmtPhone } from '@/lib/format';
import { radius } from '@/lib/theme';
import type { User } from '@/lib/types';
import { Avatar, Button, ErrorBox, Header, ListRow, Loading, Pill, Screen } from '@/components/ui';

/** Office and gate staff (drivers are managed under Fleet). */
export default function Staff() {
  const { t, errorText } = useI18n();
  const users = useApi<User[]>('/users');
  const staff = (users.data ?? []).filter((u) => u.role !== 'driver');

  async function manage(u: User) {
    const ok = await confirm(u.name, `${t.roles[u.role]} · ${fmtPhone(u.phone)}\n\n${t.fleet.resetPassword}?`, t.fleet.resetPassword, t.common.cancel);
    if (!ok) return;
    try {
      const r = await api<{ temp_password: string }>(`/users/${u.id}/reset-password`, { method: 'POST' });
      notify(`${t.fleet.tempPassword}: ${r.temp_password}`, t.fleet.tempPasswordHint);
    } catch (e) {
      notify(errorText(e));
    }
  }

  return (
    <Screen edges={['bottom']} refreshing={users.refreshing} onRefresh={users.reload}>
      <Stack.Screen options={{ title: t.more.staff }} />
      <Header title="" right={<Button small icon="person-add-outline" label={t.fleet.addUser} onPress={() => router.push({ pathname: '/user/new', params: { role: 'gate' } })} />} />
      {users.error ? <ErrorBox error={users.error} onRetry={users.reload} /> : null}
      {users.loading ? <Loading /> : null}
      <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
        {staff.map((u) => (
          <ListRow
            key={u.id}
            leading={<Avatar name={u.name} url={u.photo_url} />}
            title={u.name}
            subtitle={fmtPhone(u.phone)}
            right={<Pill label={u.active ? t.roles[u.role] : t.fleet.inactive} tone={u.active ? 'info' : 'bad'} />}
            onPress={() => manage(u)}
          />
        ))}
      </View>
    </Screen>
  );
}
