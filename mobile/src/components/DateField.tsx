import { useState } from 'react';
import { View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { fmtDate, fmtHijri, hijriSupported, hijriToGregorian, isIsoDate, westernDigits } from '@/lib/format';
import { space } from '@/lib/theme';
import { Field, Segmented } from './ui';

/** Types digits as YYYY-MM-DD, inserting the dashes automatically. */
const maskDate = (v: string) => {
  const digits = westernDigits(v).replace(/[^\d]/g, '').slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-');
};

/**
 * Date input that always stores a Gregorian 'YYYY-MM-DD'. Iqamas and many government papers print
 * Hijri dates, so the user can switch to Hijri and type the date exactly as printed.
 */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t, lang, isRTL } = useI18n();
  const [mode, setMode] = useState<'greg' | 'hijri'>('greg');
  const [hijriText, setHijriText] = useState('');
  const canHijri = hijriSupported();
  const valid = isIsoDate(value);

  const toggle = canHijri ? (
    <View style={{ width: 170, alignSelf: isRTL ? 'flex-start' : 'flex-end', marginBottom: -space.sm }}>
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setHijriText('');
        }}
        options={[
          { value: 'greg', label: t.docs.gregorian },
          { value: 'hijri', label: t.docs.hijri },
        ]}
      />
    </View>
  ) : null;

  if (mode === 'hijri') {
    const complete = hijriText.length === 10;
    const greg = complete ? hijriToGregorian(hijriText) : null;
    return (
      <View>
        {toggle}
        <Field
          label={`${label} (${t.docs.hijri})`}
          placeholder="1449-05-14"
          value={hijriText}
          onChangeText={(v) => {
            const masked = maskDate(v);
            setHijriText(masked);
            onChange(masked.length === 10 ? (hijriToGregorian(masked) ?? '') : '');
          }}
          keyboardType="number-pad"
          ltr
          hint={greg ? `${t.docs.equals}: ${fmtDate(greg, lang)} (${greg})` : t.docs.hijriHint}
          error={complete && !greg ? t.errors.VALIDATION : null}
        />
      </View>
    );
  }

  const hijri = valid ? fmtHijri(value, lang) : null;
  return (
    <View>
      {toggle}
      <Field
        label={label}
        placeholder={t.docs.dateHint}
        value={value}
        onChangeText={(v) => onChange(maskDate(v))}
        keyboardType="number-pad"
        maxLength={10}
        ltr
        hint={hijri ? `${t.docs.hijri}: ${hijri}` : t.docs.dateHint}
        error={value && value.length === 10 && !valid ? t.errors.VALIDATION : null}
      />
    </View>
  );
}
