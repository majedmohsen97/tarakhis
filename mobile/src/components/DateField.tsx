import { useI18n } from '@/lib/i18n';
import { fmtHijri, isIsoDate, westernDigits } from '@/lib/format';
import { Field } from './ui';

/**
 * Date input as YYYY-MM-DD (works the same on phones and web). Shows the Hijri equivalent,
 * because iqamas and many government papers print Hijri dates.
 */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t, lang } = useI18n();
  const valid = isIsoDate(value);
  const hijri = valid ? fmtHijri(value, lang) : null;
  return (
    <Field
      label={label}
      placeholder={t.docs.dateHint}
      value={value}
      onChangeText={(v) => {
        // Auto-insert dashes as the user types digits: 20270131 → 2027-01-31
        const digits = westernDigits(v).replace(/[^\d]/g, '').slice(0, 8);
        const parts = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean);
        onChange(parts.join('-'));
      }}
      keyboardType="number-pad"
      maxLength={10}
      ltr
      hint={hijri ? `${t.docs.hijri}: ${hijri}` : t.docs.dateHint}
      error={value && value.length === 10 && !valid ? t.errors.VALIDATION : null}
    />
  );
}
