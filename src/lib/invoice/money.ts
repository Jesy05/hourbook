/* Currency formatting for invoices: one place for the app, Excel and PDF. */

export const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'NIO', 'CRC', 'COP'];

function isCurrencyCode(code: string): boolean {
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

/** The standard symbol for a code, e.g. USD -> "$", EUR -> "€". */
export function currencySymbol(code: string, locale = 'en-US'): string {
  if (!isCurrencyCode(code)) return code;
  const part = new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? code;
}

/**
 * Formats an amount with Intl.NumberFormat. A custom symbol, when given,
 * replaces the standard one (e.g. "US$" instead of "$").
 */
export function formatCurrency(amount: number, code: string, customSymbol = '', locale = 'en-US'): string {
  const value = Math.round((amount + Number.EPSILON) * 100) / 100;
  if (!isCurrencyCode(code)) {
    return `${customSymbol || code} ${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
  }
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(value);
  return parts.map((p) => (p.type === 'currency' && customSymbol ? customSymbol : p.value)).join('');
}

/** Excel number format that shows the same symbol, e.g. "$"#,##0.00. */
export function excelCurrencyFormat(code: string, customSymbol = ''): string {
  const symbol = (customSymbol || currencySymbol(code)).replace(/"/g, '');
  return `"${symbol}"#,##0.00;-"${symbol}"#,##0.00`;
}
