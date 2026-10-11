import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { confirm, notify } from '@/lib/dialog';
import { fmtPhone } from '@/lib/format';
import { space } from '@/lib/theme';
import type { Doc, Role, User } from '@/lib/types';
import { DocList } from '@/components/docs';
import { PasswordCard } from '@/components/PasswordCard';
import { Avatar, Button, Card, ErrorBox, Loading, Pill, Row, Screen, Section, Select, Txt } from '@/components/ui';

/** Office / gate staff member: role, account status and password. */
export default function StaffMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, errorText } = useI18n();
  const { user: me } = useAuth();
  const res = useApi<{ user: User; documents: Doc[] }>(`/users/${id}`);
  const [busy, setBusy] = useState(false);
  const u = res.data?.user;
  const isSelf = me?.id === u?.id;
  const roles: Role[] = me?.role === 'owner' ? ['manager', 'safety', 'gate', 'owner'] : ['manager', 'safety', 'gate'];
  const canManage = u && !(u.role === 'owner' && me?.role !== 'owner');

  async function save(patch: Record<string, unknown>, question?: string) {
    if (question && !(await confirm(u?.name ?? '', question, t.common.confirm, t.common.cancel))) return;
    setBusy(true);
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: patch });
      res.reload();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']} refreshing={res.refreshing} onRefresh={res.reload}>
      <Stack.Screen options={{ title: u?.name ?? t.fleet.staffMember }} />
      {res.error ? <ErrorBox error={res.error} onRetry={res.reload} /> : null}
      {!u ? (
        <Loading />
      ) : (
        <>
          <Card>
            <Row gap={space.md}>
              <Avatar name={u.name} url={u.photo_url} size={64} />
              <View style={{ flex: 1, gap: 4 }}>
                <Txt variant="h2">{u.name}</Txt>
                <Txt variant="small">{fmtPhone(u.phone)}</Txt>
                <Row gap={space.sm}>
                  <Pill label={t.roles[u.role]} tone="info" />
                  {!u.active ? <Pill label={t.fleet.inactive} tone="bad" /> : null}
                </Row>
              </View>
            </Row>
            <Row gap={space.sm} wrap style={{ marginTop: space.md }}>
              <Button small variant="secondary" icon="call-outline" label={fmtPhone(u.phone)} onPress={() => Linking.openURL(`tel:${u.phone}`)} />
              <Button small variant="secondary" icon="logo-whatsapp" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${u.phone.replace('+', '')}`)} />
            </Row>
          </Card>

          <Section
            title={t.docs.title}
            action={<Button small icon="cloud-upload-outline" label={t.docs.upload} onPress={() => router.push({ pathname: '/document/new', params: { owner_type: 'driver', owner_id: String(u.id) } })} />}>
            <DocList docs={res.data?.documents ?? []} />
          </Section>

          {canManage && !isSelf ? (
            <>
              <Section title={t.fleet.role}>
                <Card>
                  <Select label={t.fleet.role} value={u.role} options={roles.map((r) => ({ value: r, label: t.roles[r] }))} onChange={(r) => r !== u.role && save({ role: r })} />
                  <Button
                    variant={u.active ? 'danger' : 'secondary'}
                    icon={u.active ? 'ban-outline' : 'checkmark-circle-outline'}
                    label={u.active ? t.fleet.deactivate : t.fleet.activate}
                    loading={busy}
                    onPress={() => save({ active: !u.active }, u.active ? t.fleet.deactivate : t.fleet.activate)}
                  />
                </Card>
              </Section>
              <Section title={t.fleet.passwordTitle}>
                <PasswordCard userId={u.id} name={u.name} phone={u.phone} />
              </Section>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
