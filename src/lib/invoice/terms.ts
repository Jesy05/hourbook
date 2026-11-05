import { addDays, format, parseISO } from 'date-fns';
import type { PaymentTerms, TermsPreset } from '../types';

/* Payment terms and the due date that follows from them. */

export const TERMS_PRESETS: TermsPreset[] = ['receipt', 'net7', 'net14', 'net15', 'net30', 'custom'];

const PRESET_DAYS: Record<Exclude<TermsPreset, 'custom'>, number> = { receipt: 0, net7: 7, net14: 14, net15: 15, net30: 30 };

/** Days from the issue date to the due date, or null when the terms set none. */
export function termsDays(terms: PaymentTerms): number | null {
  if (terms.preset === 'custom') return terms.customDays !== null && terms.customDays >= 0 ? Math.floor(terms.customDays) : null;
  return PRESET_DAYS[terms.preset];
}

/** Due date as YYYY-MM-DD, or null when the terms have no due date. */
export function dueDate(issueDate: string, terms: PaymentTerms): string | null {
  const days = termsDays(terms);
  if (days === null || !issueDate) return null;
  return format(addDays(parseISO(issueDate), days), 'yyyy-MM-dd');
}

/** Terms as printed on the invoice, in English for the client: "Net 14", "Due on receipt". */
export function termsLabel(terms: PaymentTerms): string {
  switch (terms.preset) {
    case 'receipt':
      return 'Due on receipt';
    case 'custom':
      return terms.customText.trim() || (terms.customDays !== null ? `Net ${terms.customDays}` : '');
    default:
      return `Net ${PRESET_DAYS[terms.preset]}`;
  }
}
