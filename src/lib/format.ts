import { endOfMonth, format, parseISO } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { locale } from './i18n';
import type { Language } from './types';

export function dateLocale(language: Language) {
  return language === 'es' ? es : enUS;
}

/** "lun, 5 ene" / "Mon, Jan 5" */
export function formatDay(date: string, language: Language): string {
  return format(parseISO(date), language === 'es' ? 'EEE d MMM' : 'EEE, MMM d', { locale: dateLocale(language) });
}

/** "5-Jan" style used by the spreadsheet. */
export function formatShortDate(date: string): string {
  return format(parseISO(date), 'd-MMM');
}

export function formatLongDate(date: string, language: Language): string {
  return format(parseISO(date), language === 'es' ? "d 'de' MMMM yyyy" : 'MMMM d, yyyy', {
    locale: dateLocale(language),
  });
}

export function formatMonth(month: string, language: Language): string {
  const text = format(parseISO(`${month}-01`), 'MMMM yyyy', { locale: dateLocale(language) });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** True when the range is exactly one calendar month, first day to last day. */
export function isFullMonth(start: string, end: string): boolean {
  const first = parseISO(start);
  return start.slice(8) === '01' && end === format(endOfMonth(first), 'yyyy-MM-dd');
}

/**
 * Billing period in English for the invoice and email: "October 2026" for a
 * whole month, otherwise "October 5 - 18, 2026", "October 25 - November 7, 2026"
 * or "December 20, 2026 - January 3, 2027".
 */
export function formatPeriodEnglish(start: string, end: string): string {
  if (isFullMonth(start, end)) return format(parseISO(start), 'MMMM yyyy');
  const a = parseISO(start);
  const b = parseISO(end);
  if (start === end) return format(a, 'MMMM d, yyyy');
  if (start.slice(0, 7) === end.slice(0, 7)) return `${format(a, 'MMMM d')} - ${format(b, 'd, yyyy')}`;
  if (start.slice(0, 4) === end.slice(0, 4)) return `${format(a, 'MMMM d')} - ${format(b, 'MMMM d, yyyy')}`;
  return `${format(a, 'MMMM d, yyyy')} - ${format(b, 'MMMM d, yyyy')}`;
}

/** Same idea in the interface language: "Octubre 2026" or "5 oct - 18 oct 2026". */
export function formatPeriod(start: string, end: string, language: Language): string {
  if (isFullMonth(start, end)) return formatMonth(start.slice(0, 7), language);
  const locale = dateLocale(language);
  const day = language === 'es' ? 'd MMM' : 'MMM d';
  const full = language === 'es' ? 'd MMM yyyy' : 'MMM d, yyyy';
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${format(parseISO(start), sameYear ? day : full, { locale })} - ${format(parseISO(end), full, { locale })}`;
}

/** "4-12 Jun", "30 May-2 Jun" or "26-Feb". */
export function formatRedeemedDate(date: string, endDate?: string): string {
  if (!endDate || endDate === date) return formatShortDate(date);
  const a = parseISO(date);
  const b = parseISO(endDate);
  if (format(a, 'yyyy-MM') === format(b, 'yyyy-MM')) return `${format(a, 'd')}-${format(b, 'd MMM')}`;
  return `${format(a, 'd MMM')}-${format(b, 'd MMM')}`;
}

export function formatMoney(amount: number, currency: string, language: Language): string {
  try {
    return new Intl.NumberFormat(locale(language), { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Money formatted in English for the invoice email. */
export function formatMoneyEnglish(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatNumber(value: number, language: Language, digits = 2): string {
  return new Intl.NumberFormat(locale(language), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** "09:05:00" -> "09:05" */
export function shortTime(time?: string): string {
  return time ? time.slice(0, 5) : '';
}

export function safeFileName(text: string): string {
  const plain = text.normalize('NFD').replace(/\p{M}/gu, '');
  return plain.trim().replace(/\s+/g, '_').replace(/[^\w.-]/g, '') || 'Hourbook';
}
