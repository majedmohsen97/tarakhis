import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useAuth, isManager } from '@/lib/auth';
import { fmtPhone } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { Site, User, Vehicle } from '@/lib/types';
import { Avatar, Button, Empty, ErrorBox, Header, Icon, ListRow, Loading, Pill, Screen, Segmented } from '@/components/ui';

type Tab = 'drivers' | 'vehicles' | 'sites';

export default function Fleet() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('drivers');
  const drivers = useApi<User[]>(tab === 'drivers' ? '/users?role=driver' : null);
  const vehicles = useApi<Vehicle[]>(tab === 'vehicles' ? '/vehicles' : null);
  const sites = useApi<Site[]>(tab === 'sites' ? '/sites' : null);
  const current = tab === 'drivers' ? drivers : tab === 'vehicles' ? vehicles : sites;
  const canEdit = isManager(user);

  const addButton =
    canEdit &&
    {
      drivers: <Button small icon="person-add-outline" label={t.fleet.addDriver} onPress={() => router.push({ pathname: '/user/new', params: { role: 'driver' } })} />,
      vehicles: <Button small icon="add" label={t.fleet.addVehicle} onPress={() => router.push('/vehicle/new')} />,
      sites: <Button small icon="add" label={t.fleet.addSite} onPress={() => router.push('/site/new')} />,
    }[tab];

  return (
    <Screen refreshing={current.refreshing} onRefresh={current.reload}>
      <Header title={t.tabs.fleet} right={addButton || undefined} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'drivers', label: t.fleet.drivers },
          { value: 'vehicles', label: t.fleet.vehicles },
          { value: 'sites', label: t.fleet.sites },
        ]}
      />
      {current.error ? <ErrorBox error={current.error} onRetry={current.reload} /> : null}
      {current.loading ? <Loading /> : null}
      <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
        {tab === 'drivers' &&
          drivers.data?.map((d) => (
            <ListRow
              key={d.id}
              leading={<Avatar name={d.name} url={d.photo_url} />}
              title={d.name}
              subtitle={[fmtPhone(d.phone), d.nationality].filter(Boolean).join(' · ')}
              right={!d.active ? <Pill label={t.fleet.inactive} /> : d.doc_issues ? <Pill label={String(d.doc_issues)} tone="bad" icon="alert-circle" /> : <Icon name="checkmark-circle" color={colors.good} />}
              onPress={() => router.push(`/driver/${d.id}`)}
            />
          ))}
        {tab === 'vehicles' &&
          vehicles.data?.map((v) => (
            <ListRow
              key={v.id}
              leading={<Icon name="bus-outline" size={28} color={colors.primary} />}
              title={v.plate_number}
              subtitle={[v.type, v.capacity_tons ? `${v.capacity_tons} t` : null, v.driver_name].filter(Boolean).join(' · ')}
              right={!v.active ? <Pill label={t.fleet.inactive} /> : undefined}
              onPress={() => router.push(`/vehicle/${v.id}`)}
            />
          ))}
        {tab === 'sites' &&
          sites.data?.map((s) => (
            <ListRow
              key={s.id}
              leading={<Icon name="location-outline" size={28} color={colors.primary} />}
              title={s.name}
              subtitle={s.lat != null ? `${s.lat.toFixed(4)}, ${s.lng?.toFixed(4)} · ${s.radius_m} m` : undefined}
              onPress={canEdit ? () => router.push({ pathname: '/site/new', params: { id: String(s.id) } }) : undefined}
            />
          ))}
      </View>
      {!current.loading && Array.isArray(current.data) && !current.data.length ? <Empty text={t.common.none} /> : null}
    </Screen>
  );
}
