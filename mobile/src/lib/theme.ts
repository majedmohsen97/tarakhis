export const colors = {
  primary: '#0F6B4A',
  primaryDark: '#0A4F37',
  primarySoft: '#E7F3EE',
  bg: '#F4F6F5',
  card: '#FFFFFF',
  text: '#13201B',
  muted: '#5D6B66',
  line: '#E3E8E6',
  good: '#0F8A4F',
  goodSoft: '#E3F5EB',
  warn: '#B26A00',
  warnSoft: '#FFF3DF',
  bad: '#C62828',
  badSoft: '#FDE8E8',
  info: '#1F5FBF',
  infoSoft: '#E6EEFB',
  white: '#FFFFFF',
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  good: { fg: colors.good, bg: colors.goodSoft },
  warn: { fg: colors.warn, bg: colors.warnSoft },
  bad: { fg: colors.bad, bg: colors.badSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
  neutral: { fg: colors.muted, bg: colors.line },
};
