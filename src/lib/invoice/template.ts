import { format, parseISO } from 'date-fns';
import type { CustomField, DateFormat } from '../types';
import { round2 } from './hours';

/* Line description templates such as "{date} | {requestedBy} - {project} | {hours} hours". */

export const BUILT_IN_TOKENS = ['date', 'start', 'end', 'hours', 'category', 'requestedBy', 'project', 'description'] as const;

export const DATE_FORMATS: DateFormat[] = ['MM/DD/YY', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MMM D, YYYY'];

const DATE_PATTERNS: Record<DateFormat, string> = {
  'MM/DD/YY': 'MM/dd/yy',
  'MM/DD/YYYY': 'MM/dd/yyyy',
  'DD/MM/YYYY': 'dd/MM/yyyy',
  'YYYY-MM-DD': 'yyyy-MM-dd',
  'MMM D, YYYY': 'MMM d, yyyy',
};

/** Excel number formats matching each date format. */
export const EXCEL_DATE_FORMATS: Record<DateFormat, string> = {
  'MM/DD/YY': 'mm/dd/yy',
  'MM/DD/YYYY': 'mm/dd/yyyy',
  'DD/MM/YYYY': 'dd/mm/yyyy',
  'YYYY-MM-DD': 'yyyy-mm-dd',
  'MMM D, YYYY': 'mmm d, yyyy',
};

/** Formats a YYYY-MM-DD date. Always English month names: the format does not follow the UI language. */
export function formatInvoiceDate(date: string, dateFormat: DateFormat): string {
  if (!date) return '';
  return format(parseISO(date), DATE_PATTERNS[dateFormat]);
}

/** A date or a range of dates: "10/29/26" or "10/27/26 - 10/29/26". */
export function formatDateSpan(first: string, last: string, dateFormat: DateFormat): string {
  if (!first) return '';
  if (!last || last === first) return formatInvoiceDate(first, dateFormat);
  return `${formatInvoiceDate(first, dateFormat)} - ${formatInvoiceDate(last, dateFormat)}`;
}

export interface TemplateValues {
  dateFirst: string;
  dateLast: string;
  start: string;
  end: string;
  hours: number;
  category: string;
  requestedBy: string;
  project: string;
  description: string;
  /** Custom field values by field id, already as text. */
  custom: Record<string, string>;
}

const EMPTY = '\u0000';
const SEPARATOR = /[-|,/:·–—]/;

/**
 * Removes empty tokens together with the separator next to them, so
 * "{requestedBy} - {project}" with no requester gives "NYC event", not " - NYC event".
 */
function tidy(text: string): string {
  let out = text;
  // When an empty value sits between two separators, keep the stronger one:
  // "Naima - {project} | 4.18" -> "Naima | 4.18", "| {requestedBy} - NYC" -> "| NYC".
  const strength = (sep: string) => (sep === '|' ? 3 : sep === ',' || sep === ':' || sep === '/' ? 2 : 1);
  const before = new RegExp(`\\s*(${SEPARATOR.source})\\s*${EMPTY}`);
  const after = new RegExp(`${EMPTY}\\s*(${SEPARATOR.source})\\s*`);
  while (out.includes(EMPTY)) {
    const b = before.exec(out);
    const a = after.exec(out);
    const bHere = b && b.index + b[0].length === out.indexOf(EMPTY) + 1;
    const aHere = a && a.index === out.indexOf(EMPTY);
    if (bHere && aHere) {
      out = strength(b![1]) > strength(a![1]) ? out.replace(after, ' ') : out.replace(before, ' ');
    } else if (aHere) out = out.replace(after, '');
    else if (bHere) out = out.replace(before, '');
    else out = out.replace(EMPTY, '');
  }
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(new RegExp(`^\\s*${SEPARATOR.source}\\s*|\\s*${SEPARATOR.source}\\s*$`, 'g'), '')
    .trim();
}

/** Fills a description template. Custom fields are referenced by name, e.g. {Location}. */
export function renderDescription(
  template: string,
  values: TemplateValues,
  options: { dateFormat: DateFormat; customFields: CustomField[] },
): string {
  const builtIn: Record<string, string> = {
    date: formatDateSpan(values.dateFirst, values.dateLast, options.dateFormat),
    start: values.start.slice(0, 5),
    end: values.end.slice(0, 5),
    hours: round2(values.hours).toFixed(2),
    category: values.category,
    requestedBy: values.requestedBy,
    project: values.project,
    description: values.description,
  };
  const filled = template.replace(/\{([^{}]+)\}/g, (match, rawName: string) => {
    const name = rawName.trim();
    const key = Object.keys(builtIn).find((k) => k.toLowerCase() === name.toLowerCase());
    if (key !== undefined) return builtIn[key] || EMPTY;
    const field = options.customFields.find((f) => f.name.trim().toLowerCase() === name.toLowerCase());
    if (field) return values.custom[field.id] || EMPTY;
    return match;
  });
  return tidy(filled);
}
