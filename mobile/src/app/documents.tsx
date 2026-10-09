import { useState } from 'react';
import { Stack } from 'expo-router';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { Alert, Doc } from '@/lib/types';
import { AlertList, DocList } from '@/components/docs';
import { ErrorBox, Loading, Screen, Segmented } from '@/components/ui';

type Tab = 'attention' | 'pending' | 'all';

/** Safety/HR review queue: what's expiring, missing or waiting for approval. */
export default function Documents() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('attention');
  const alerts = useApi<Alert[]>(tab === 'attention' ? '/alerts' : null);
  const docs = useApi<Doc[]>(tab === 'pending' ? '/documents?status=pending' : tab === 'all' ? '/documents' : null);
  const current = tab === 'attention' ? alerts : docs;

  return (
    <Screen edges={['bottom']} refreshing={current.refreshing} onRefresh={current.reload}>
      <Stack.Screen options={{ title: t.more.documents }} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'attention', label: t.docs.attention },
          { value: 'pending', label: t.docs.reviewQueue },
          { value: 'all', label: t.common.all },
        ]}
      />
      {current.error ? <ErrorBox error={current.error} onRetry={current.reload} /> : null}
      {current.loading ? <Loading /> : null}
      {tab === 'attention' && alerts.data ? <AlertList alerts={alerts.data} /> : null}
      {tab !== 'attention' && docs.data ? <DocList docs={docs.data} showOwner /> : null}
    </Screen>
  );
}
