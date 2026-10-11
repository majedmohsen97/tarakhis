import type { Lang } from './i18n';

const TZ = 'Asia/Riyadh';

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB');

/** 'YYYY-MM-DD' → '12 Oct 2026' / '12 أكتوبر 2026' */
export function fmtDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

/** Hijri (Umm al-Qura) equivalent — iqamas and many government papers show Hijri dates. */
export function fmtHijri(iso: string | null | undefined, lang: Lang): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
    }).format(d);
  } catch {
    return null;
  }
}

export function fmtTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

export function fmtDateTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—';
  return `${fmtDate(iso, lang)} · ${fmtTime(iso, lang)}`;
}

export function fmtMoney(halalas: number, lang: Lang): string {
  const n = (halalas / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return lang === 'ar' ? `${n} ر.س` : `SAR ${n}`;
}

export function fmtPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const m = phone.match(/^\+966(5\d)(\d{3})(\d{4})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : phone;
}

/** Today's date in Riyadh as YYYY-MM-DD. */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekStartOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -d.getUTCDay());
}

export function dayIndex(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Converts Arabic-Indic digits typed on Arabic keyboards to Western digits. */
export const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const hijriParts = (() => {
  try {
    const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
    // Check the runtime really supports the Umm al-Qura calendar (some engines silently ignore it).
    if (f.resolvedOptions().calendar !== 'islamic-umalqura') return null;
    return (d: Date) => {
      const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
      return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
    };
  } catch {
    return null;
  }
})();

export const hijriSupported = () => hijriParts !== null;

/** Hijri (Umm al-Qura) 'YYYY-MM-DD' → Gregorian 'YYYY-MM-DD', or null if invalid/unsupported. */
export function hijriToGregorian(hijri: string): string | null {
  if (!hijriParts) return null;
  const m = westernDigits(hijri).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 30) return null;
  // Estimate from the mean Hijri year/month length, then search nearby days for an exact match.
  const epoch = Date.UTC(622, 6, 19);
  const guess = epoch + ((y - 1) * 354.36707 + (mo - 1) * 29.530589 + (d - 1)) * 86400000;
  for (let off = 0; off <= 40; off++) {
    for (const sign of [1, -1]) {
      const date = new Date(guess + sign * off * 86400000);
      const p = hijriParts(date);
      if (p.y === y && p.m === mo && p.d === d) return date.toISOString().slice(0, 10);
    }
  }
  return null;
}
