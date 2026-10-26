import { format, parseISO } from 'date-fns';
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

/** English month and year, used in the invoice and email which go to the client. */
export function formatMonthEnglish(month: string): string {
  return format(parseISO(`${month}-01`), 'MMMM yyyy');
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
