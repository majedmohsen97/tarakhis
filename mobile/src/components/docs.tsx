import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/lib/i18n';
import { fmtDate, fmtHijri } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import type { Alert, Doc, OwnerType } from '@/lib/types';
import { Button, Card, Empty, Icon, Pill, Row, Txt, stateTone } from './ui';

export function DocRow({ doc, showOwner }: { doc: Doc; showOwner?: boolean }) {
  const { t, lang } = useI18n();
  const hijri = fmtHijri(doc.expiry_date, lang);
  return (
    <Card onPress={() => router.push(`/document/${doc.id}`)}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="700">{t.docTypes[doc.doc_type] ?? doc.doc_type}</Txt>
          {showOwner && doc.owner_name ? <Txt variant="small">{`${t.owners[doc.owner_type]}: ${doc.owner_name}`}</Txt> : null}
          {doc.expiry_date ? (
            <Txt variant="small">
              {`${t.docs.expiryDate}: ${fmtDate(doc.expiry_date, lang)}`}
              {hijri ? ` · ${hijri}` : ''}
            </Txt>
          ) : null}
          {doc.days_left != null && doc.status === 'approved' ? (
            <Txt variant="small" color={doc.days_left < 0 ? colors.bad : doc.state === 'expiring' ? colors.warn : colors.muted}>{t.common.daysLeft(doc.days_left)}</Txt>
          ) : null}
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Pill label={t.docStates[doc.state]} tone={stateTone(doc.state)} />
          {doc.file_url ? <Icon name={doc.file_mime === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={18} color={colors.muted} /> : null}
        </View>
      </Row>
    </Card>
  );
}

export function DocList({ docs, emptyText, showOwner }: { docs: Doc[]; emptyText?: string; showOwner?: boolean }) {
  const { t } = useI18n();
  if (!docs.length) return <Empty text={emptyText ?? t.common.none} icon="document-outline" />;
  return (
    <View>
      {docs.map((d) => (
        <DocRow key={d.id} doc={d} showOwner={showOwner} />
      ))}
    </View>
  );
}

export function MissingDocs({ missing, ownerType, ownerId }: { missing: string[]; ownerType: OwnerType; ownerId: number }) {
  const { t } = useI18n();
  if (!missing.length) return null;
  const firstType: Record<string, string> = { identity: 'iqama', driving_license: 'driving_license', vehicle_registration: 'vehicle_registration', insurance: 'insurance', landfill_permit: 'landfill_permit' };
  return (
    <Card tone="bad">
      <Txt weight="700" color={colors.bad}>{t.docs.missingTitle}</Txt>
      {missing.map((m) => (
        <Row key={m} justify="space-between" style={{ marginTop: space.sm }}>
          <Txt>{t.requirements[m] ?? m}</Txt>
          <Button
            small
            variant="secondary"
            icon="cloud-upload-outline"
            label={t.docs.upload}
            onPress={() => router.push({ pathname: '/document/new', params: { owner_type: ownerType, owner_id: String(ownerId), doc_type: firstType[m] } })}
          />
        </Row>
      ))}
    </Card>
  );
}

const ALERT_ICON = { expired: 'close-circle', missing: 'alert-circle', rejected: 'close-circle', pending: 'time', expiring: 'warning' } as const;

export function AlertList({ alerts, limit }: { alerts: Alert[]; limit?: number }) {
  const { t, lang } = useI18n();
  if (!alerts.length) {
    return (
      <Card tone="good">
        <Txt color={colors.good} weight="600">{t.alerts.allGood}</Txt>
      </Card>
    );
  }
  const shown = limit ? alerts.slice(0, limit) : alerts;
  return (
    <View>
      {shown.map((a, i) => {
        const tone = a.kind === 'expiring' || a.kind === 'pending' ? 'warn' : 'bad';
        const color = tone === 'warn' ? colors.warn : colors.bad;
        const onPress = a.document_id
          ? () => router.push(`/document/${a.document_id}`)
          : () => router.push({ pathname: '/document/new', params: { owner_type: a.owner_type, owner_id: String(a.owner_id), doc_type: a.doc_type } });
        return (
          <Card key={`${a.kind}-${a.document_id ?? i}-${a.owner_id}-${a.doc_type}`} onPress={onPress}>
            <Row gap={space.md}>
              <Icon name={ALERT_ICON[a.kind]} size={24} color={color} />
              <View style={{ flex: 1 }}>
                <Txt weight="600">{t.docTypes[a.doc_type] ?? a.doc_type}</Txt>
                <Txt variant="small">
                  {[a.owner_name ? `${t.owners[a.owner_type]}: ${a.owner_name}` : t.owners[a.owner_type], a.expiry_date ? fmtDate(a.expiry_date, lang) : null].filter(Boolean).join(' · ')}
                </Txt>
              </View>
              <Pill label={a.kind === 'expiring' && a.days_left != null ? t.common.daysLeft(a.days_left) : t.alerts[a.kind]} tone={tone} />
            </Row>
          </Card>
        );
      })}
    </View>
  );
}
