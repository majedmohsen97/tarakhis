import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { api, type UploadFile } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { notify } from '@/lib/dialog';
import { fmtDate, fmtHijri, isIsoDate, westernDigits } from '@/lib/format';
import { colors, space } from '@/lib/theme';
import { DateField } from './DateField';
import { FilePicker } from './FilePicker';
import { Button, Card, Field, Icon, Row, Segmented, Txt } from './ui';

type DocType = 'iqama' | 'national_id' | 'driving_license';

/** One document (number + expiry + optional photo), saved on its own. */
function QuickDoc({ userId, initialType, initialNumber, chooseIdType }: { userId: number; initialType: DocType; initialNumber?: string | null; chooseIdType?: boolean }) {
  const { t, lang, errorText } = useI18n();
  const [type, setType] = useState<DocType>(initialType);
  const [number, setNumber] = useState(initialNumber ?? '');
  const [expiry, setExpiry] = useState('');
  const [file, setFile] = useState<UploadFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    try {
      await api('/documents', {
        method: 'POST',
        form: { owner_type: 'driver', owner_id: userId, doc_type: type, number: westernDigits(number), expiry_date: expiry, file: file ?? undefined },
      });
      setSaved(expiry);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <Card tone="good">
        <Row gap={space.sm}>
          <Icon name="checkmark-circle" color={colors.good} size={22} />
          <View style={{ flex: 1 }}>
            <Txt weight="700">{t.docTypes[type]}</Txt>
            <Txt variant="small">{[number, `${t.docs.expiryDate}: ${fmtDate(saved, lang)}`, fmtHijri(saved, lang)].filter(Boolean).join(' · ')}</Txt>
          </View>
        </Row>
      </Card>
    );
  }

  return (
    <Card style={{ padding: space.lg }}>
      {chooseIdType ? (
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'iqama', label: t.docTypes.iqama },
            { value: 'national_id', label: t.docTypes.national_id },
          ]}
        />
      ) : (
        <Txt variant="h3" style={{ marginBottom: space.sm }}>{t.docTypes[type]}</Txt>
      )}
      <Field label={t.docs.number} value={number} onChangeText={setNumber} keyboardType={type === 'driving_license' ? 'default' : 'number-pad'} ltr />
      <DateField label={t.docs.expiryDate} value={expiry} onChange={setExpiry} />
      <Txt variant="label">{t.personDocs.photo}</Txt>
      <FilePicker value={file} onChange={setFile} />
      <Button label={t.personDocs.saveDoc} icon="cloud-upload-outline" onPress={save} loading={busy} disabled={!isIsoDate(expiry)} />
    </Card>
  );
}

/**
 * Quick entry for an employee's main documents right after adding them: iqama / national ID,
 * plus the driving licence for drivers. Expiry reminders start as soon as each one is saved.
 */
export function PersonDocsForm({
  userId,
  role,
  idType,
  idNumber,
  licenseNumber,
}: {
  userId: number;
  role: string;
  idType?: 'iqama' | 'national_id' | null;
  idNumber?: string | null;
  licenseNumber?: string | null;
}) {
  const { t } = useI18n();
  return (
    <View>
      <Txt variant="h3">{t.personDocs.title}</Txt>
      <Txt variant="small" style={{ marginBottom: space.sm }}>{t.personDocs.hint}</Txt>
      <QuickDoc userId={userId} initialType={idType ?? 'iqama'} initialNumber={idNumber} chooseIdType={!idType} />
      {role === 'driver' ? <QuickDoc userId={userId} initialType="driving_license" initialNumber={licenseNumber} /> : null}
      <Button
        variant="ghost"
        icon="add"
        label={t.personDocs.addOther}
        onPress={() => router.push({ pathname: '/document/new', params: { owner_type: 'driver', owner_id: String(userId) } })}
      />
    </View>
  );
}
