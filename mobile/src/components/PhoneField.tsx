import type { TextInputProps } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { westernDigits } from '@/lib/format';
import { Field } from './ui';

/**
 * Keeps a phone number as at most 10 digits:
 * Arabic-Indic digits → 0-9, spaces/dashes dropped, "+966 5…" / "9665…" / "5…" → "05…".
 */
export function cleanPhone(input: string): string {
  let d = westernDigits(input).replace(/\D/g, '');
  if (d.startsWith('00966')) d = d.slice(5);
  else if (d.startsWith('966')) d = d.slice(3);
  if (d.startsWith('5')) d = `0${d}`;
  return d.slice(0, 10);
}

export const isSaudiMobile = (local: string) => /^05\d{8}$/.test(local);

/** "+966501234567" (as stored) → "0501234567" (as typed). */
export const localPhone = (stored: string | null | undefined) => (stored ? cleanPhone(stored) : '');

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> & {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** 'mobile' = Saudi mobile 05XXXXXXXX (default); 'any' = any number up to 10 digits (e.g. a landline). */
  kind?: 'mobile' | 'any';
};

export function PhoneField({ label, value, onChange, kind = 'mobile', ...rest }: Props) {
  const { t } = useI18n();
  // Only the start can be wrong (cleanPhone already limits length and characters).
  const showError = kind === 'mobile' && value.length > 0 && !'05'.startsWith(value.slice(0, 2));
  return (
    <Field
      label={label ?? t.auth.phone}
      placeholder={kind === 'mobile' ? t.auth.phoneHint : undefined}
      value={value}
      onChangeText={(v) => onChange(kind === 'mobile' ? cleanPhone(v) : westernDigits(v).replace(/\D/g, '').slice(0, 10))}
      keyboardType="phone-pad"
      autoComplete="tel"
      // No maxLength: it would cut a pasted "+966 5…" number before it is cleaned up.
      ltr
      error={showError ? t.errors.INVALID_PHONE : null}
      {...rest}
    />
  );
}
