import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useI18n } from '@/lib/i18n';
import { colors, radius, space, toneColors, type Tone } from '@/lib/theme';
import { absoluteUrl } from '@/lib/api';

// Direction is handled by the app (not the OS) so Arabic/English switch instantly on every
// platform, including Expo Go and web. Use <Row> and <Txt> instead of raw View/Text rows.

export function useDir() {
  const { isRTL } = useI18n();
  return {
    isRTL,
    row: (isRTL ? 'row-reverse' : 'row') as ViewStyle['flexDirection'],
    textAlign: (isRTL ? 'right' : 'left') as TextStyle['textAlign'],
    start: (isRTL ? 'flex-end' : 'flex-start') as ViewStyle['alignItems'],
  };
}

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({ name, size = 20, color = colors.text, flip }: { name: IconName; size?: number; color?: string; flip?: boolean }) {
  const { isRTL } = useDir();
  return <Ionicons name={name} size={size} color={color} style={flip && isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />;
}

type TxtVariant = 'title' | 'h2' | 'h3' | 'body' | 'muted' | 'small' | 'label';

export function Txt({
  children,
  variant = 'body',
  color,
  center,
  weight,
  style,
  numberOfLines,
  selectable,
}: {
  children: ReactNode;
  variant?: TxtVariant;
  color?: string;
  center?: boolean;
  weight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  const { textAlign, isRTL } = useDir();
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[
        styles.text,
        styles[variant],
        { textAlign: center ? 'center' : textAlign, writingDirection: isRTL ? 'rtl' : 'ltr' },
        color ? { color } : null,
        weight ? { fontWeight: weight } : null,
        style,
      ]}>
      {children}
    </Text>
  );
}

export function Row({ children, gap = space.sm, align = 'center', justify, wrap, style }: { children: ReactNode; gap?: number; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent']; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  const { row } = useDir();
  return <View style={[{ flexDirection: row, gap, alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  padded = true,
  edges = ['top'],
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const content = padded ? <View style={styles.screenInner}>{children}</View> : children;
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <Row justify="space-between" style={{ marginBottom: space.md }}>
      <View style={{ flex: 1 }}>
        <Txt variant="title">{title}</Txt>
        {subtitle ? <Txt variant="muted">{subtitle}</Txt> : null}
      </View>
      {right}
    </Row>
  );
}

export function Card({ children, onPress, style, tone }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; tone?: Tone }) {
  const toneStyle = tone ? { backgroundColor: toneColors[tone].bg, borderColor: toneColors[tone].bg } : null;
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, toneStyle, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Row justify="space-between" style={{ marginBottom: space.sm }}>
        <Txt variant="h3">{title}</Txt>
        {action}
      </Row>
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'good';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { row } = useDir();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    good: { bg: colors.good, fg: colors.white, border: colors.good },
    secondary: { bg: colors.card, fg: colors.primary, border: colors.line },
    danger: { bg: colors.card, fg: colors.bad, border: colors.badSoft },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  };
  const p = palette[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: p.bg, borderColor: p.border, flexDirection: row, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={p.fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={p.fg} /> : null}
      <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: p.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ltr, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null; ltr?: boolean }) {
  const { textAlign, isRTL } = useDir();
  // Phone numbers, dates and codes stay left-to-right even in Arabic.
  const align = ltr ? (isRTL ? 'right' : 'left') : textAlign;
  return (
    <View style={{ marginBottom: space.md }}>
      <Txt variant="label">{label}</Txt>
      <TextInput
        placeholderTextColor="#9AA7A2"
        style={[styles.input, { textAlign: align, writingDirection: ltr ? 'ltr' : isRTL ? 'rtl' : 'ltr' }, props.multiline && { minHeight: 80, textAlignVertical: 'top' }, error ? { borderColor: colors.bad } : null, style]}
        {...props}
      />
      {error ? <Txt variant="small" color={colors.bad}>{error}</Txt> : hint ? <Txt variant="small">{hint}</Txt> : null}
    </View>
  );
}

export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const c = toneColors[tone];
  const { row } = useDir();
  return (
    <View style={[styles.pill, { backgroundColor: c.bg, flexDirection: row }]}>
      {icon ? <Ionicons name={icon} size={13} color={c.fg} /> : null}
      <Text style={[styles.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export const stateTone = (state: string): Tone =>
  state === 'valid' || state === 'allowed' || state === 'completed' || state === 'paid' ? 'good'
    : state === 'expiring' || state === 'pending' || state === 'draft' || state === 'en_route' ? 'warn'
      : state === 'arrived' || state === 'approved' ? 'info'
        : state === 'cancelled' ? 'neutral'
          : 'bad';

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { row } = useDir();
  return (
    <View style={[styles.segmented, { flexDirection: row }]}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, value === o.value && styles.segmentActive]}>
          <Text style={[styles.segmentText, value === o.value && { color: colors.white }]} numberOfLines={1}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: space.md }}>
      <Txt variant="label">{label}</Txt>
      <Pressable onPress={() => setOpen(true)} style={styles.input}>
        <Row justify="space-between">
          <Txt color={current ? colors.text : '#9AA7A2'} style={{ flex: 1 }}>{current?.label ?? placeholder ?? '—'}</Txt>
          <Icon name="chevron-down" size={18} color={colors.muted} />
        </Row>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Txt variant="h3" style={{ marginBottom: space.sm }}>{label}</Txt>
            <ScrollView style={{ maxHeight: 420 }}>
              {options.map((o) => (
                <Pressable
                  key={String(o.value)}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.option, (pressed || o.value === value) && { backgroundColor: colors.primarySoft }]}>
                  <Txt weight={o.value === value ? '700' : '400'}>{o.label}</Txt>
                  {o.hint ? <Txt variant="small">{o.hint}</Txt> : null}
                </Pressable>
              ))}
            </ScrollView>
            <Button label={t.common.close} variant="secondary" onPress={() => setOpen(false)} style={{ marginTop: space.sm }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function ListRow({ title, subtitle, right, onPress, leading }: { title: string; subtitle?: string | null; right?: ReactNode; onPress?: () => void; leading?: ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.bg }]}>
      <Row gap={space.md}>
        {leading}
        <View style={{ flex: 1 }}>
          <Txt weight="600" numberOfLines={1}>{title}</Txt>
          {subtitle ? <Txt variant="small" numberOfLines={2}>{subtitle}</Txt> : null}
        </View>
        {right}
        {onPress ? <Icon name="chevron-forward" size={18} color={colors.muted} flip /> : null}
      </Row>
    </Pressable>
  );
}

export function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  const src = absoluteUrl(url);
  if (src) return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: colors.line }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: size / 2.4 }}>{name.trim().slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function Stat({ label, value, tone, icon, onPress }: { label: string; value: string | number; tone?: Tone; icon?: IconName; onPress?: () => void }) {
  const c = tone ? toneColors[tone] : { fg: colors.primary, bg: colors.primarySoft };
  return (
    <Card onPress={onPress} style={styles.stat}>
      <Row justify="space-between" align="flex-start">
        <Text style={[styles.statValue, { color: c.fg, flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {icon ? (
          <View style={[styles.statIcon, { backgroundColor: c.bg }]}>
            <Ionicons name={icon} size={18} color={c.fg} />
          </View>
        ) : null}
      </Row>
      <Txt variant="small" numberOfLines={2}>{label}</Txt>
    </Card>
  );
}

export function Loading() {
  return (
    <View style={{ padding: space.xl, alignItems: 'center' }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, errorText } = useI18n();
  return (
    <Card tone="bad">
      <Txt color={colors.bad}>{errorText(error)}</Txt>
      {onRetry ? <Button label={t.common.retry} variant="secondary" small onPress={onRetry} style={{ marginTop: space.sm }} /> : null}
    </Card>
  );
}

export function Empty({ text, icon = 'file-tray-outline' }: { text: string; icon?: IconName }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.sm }}>
      <Ionicons name={icon} size={36} color={colors.muted} />
      <Txt variant="muted" center>{text}</Txt>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: space.sm }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1 },
  screenInner: { padding: space.lg, paddingBottom: space.xl * 2, width: '100%', maxWidth: 760, alignSelf: 'center' },
  text: { color: colors.text, fontSize: 15, lineHeight: 22 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '800' },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  h3: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  body: {},
  muted: { color: colors.muted },
  small: { fontSize: 13, lineHeight: 19, color: colors.muted },
  label: { fontSize: 13, lineHeight: 19, color: colors.muted, fontWeight: '600', marginBottom: 6 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.line, marginBottom: space.sm },
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center', gap: space.sm, borderWidth: 1 },
  buttonSmall: { minHeight: 36, paddingHorizontal: space.md },
  buttonText: { fontSize: 16, fontWeight: '700' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16, color: colors.text, minHeight: 48, justifyContent: 'center' },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignItems: 'center', gap: 4 },
  pillText: { fontSize: 12, fontWeight: '700' },
  segmented: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 3, marginBottom: space.md },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, width: '100%', maxWidth: 760, alignSelf: 'center' },
  option: { paddingVertical: 12, paddingHorizontal: space.md, borderRadius: radius.sm },
  listRow: { backgroundColor: colors.card, paddingHorizontal: space.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  stat: { flexGrow: 1, flexBasis: '45%', minWidth: 140, gap: 4 },
  statValue: { fontSize: 26, fontWeight: '800' },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
