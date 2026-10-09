import { Platform, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import type { UploadFile } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { notify } from '@/lib/dialog';
import { colors, radius, space } from '@/lib/theme';
import { Button, Icon, Row, Txt } from './ui';

type Picked = { uri: string; fileName?: string | null; name?: string; mimeType?: string | null; file?: File };

export function pickedToUpload(asset: Picked): UploadFile {
  const type = asset.mimeType || (asset.uri.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  const ext = type === 'application/pdf' ? 'pdf' : type.split('/')[1] || 'jpg';
  return { uri: asset.uri, name: asset.fileName || asset.name || `upload.${ext}`, type, file: asset.file };
}

/** Take a photo, choose an image, or choose a PDF — whichever the user has at hand. */
export function FilePicker({ value, onChange, imagesOnly }: { value: UploadFile | null; onChange: (f: UploadFile | null) => void; imagesOnly?: boolean }) {
  const { t } = useI18n();

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify(t.gate.cameraDenied);
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!res.canceled) onChange(pickedToUpload(res.assets[0]));
  }

  async function choose() {
    if (imagesOnly) {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (!res.canceled) onChange(pickedToUpload(res.assets[0]));
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (!res.canceled) onChange(pickedToUpload(res.assets[0]));
  }

  const isImage = value?.type.startsWith('image/');
  return (
    <View style={{ marginBottom: space.md, gap: space.sm }}>
      <Row gap={space.sm}>
        {Platform.OS !== 'web' ? <Button small variant="secondary" icon="camera-outline" label={t.docs.takePhoto} onPress={takePhoto} style={{ flex: 1 }} /> : null}
        <Button small variant="secondary" icon="attach-outline" label={t.docs.chooseFile} onPress={choose} style={{ flex: 1 }} />
      </Row>
      {value ? (
        <Row gap={space.sm} style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: colors.line }}>
          {isImage ? (
            <Image source={{ uri: value.uri }} style={{ width: 56, height: 56, borderRadius: radius.sm }} contentFit="cover" />
          ) : (
            <Icon name="document-text-outline" size={36} color={colors.primary} />
          )}
          <Txt style={{ flex: 1 }} numberOfLines={1}>{value.name}</Txt>
          <Button small variant="ghost" icon="close" label="" onPress={() => onChange(null)} />
        </Row>
      ) : (
        <Txt variant="small">{t.docs.noFile}</Txt>
      )}
    </View>
  );
}
