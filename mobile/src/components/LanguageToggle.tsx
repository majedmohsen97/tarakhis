import { Pressable, StyleSheet, Text } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { colors, radius } from '@/lib/theme';

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  const { user } = useAuth();
  const next = lang === 'ar' ? 'en' : 'ar';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setLang(next);
        // Remember the choice on the account too (best effort).
        if (user) api('/auth/me', { method: 'PATCH', body: { lang: next } }).catch(() => {});
      }}
      style={styles.btn}>
      <Text style={styles.text}>{lang === 'ar' ? 'English' : 'العربية'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  text: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
