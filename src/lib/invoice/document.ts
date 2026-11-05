import type { ColumnKey, CustomField, CustomValue, DateFormat, InvoiceDraft } from '../types';
import { round2, roundingNote } from './hours';
import { computeTotals, extraAmount, lineAmount, servicePeriod, type InvoiceTotals } from './lines';
import { formatCurrency } from './money';
import { draftDueDate, termsLabel } from './terms';
import { formatDateSpan, formatInvoiceDate } from './template';

/*
 * Everything an exported invoice shows, in one place. The Excel and PDF
 * builders both read this, so they always carry the same data. Labels are in
 * English because the invoice goes to the client.
 */

export type ColumnKind = 'text' | 'date' | 'hours' | 'money';

export interface DocColumn {
  key: ColumnKey;
  label: string;
  kind: ColumnKind;
}

export interface DocLine {
  /** Raw values per column: text, a YYYY-MM-DD date, hours (2 decimals) or money. */
  values: Record<string, string | number>;
  hours: number;
  rate: number;
  amount: number;
}

export interface DocExtra {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface DocTimesheet {
  columns: { label: string; kind: ColumnKind | 'time' }[];
  rows: (string | number)[][];
  totalHours: number;
}

export interface InvoiceDocument {
  number: string;
  issueDate: string;
  dueDate: string | null;
  terms: string;
  servicePeriod: { start: string; end: string; text: string };
  currency: string;
  currencySymbol: string;
  dateFormat: DateFormat;
  from: { lines: string[]; logo?: string } | null;
  billTo: { lines: string[] } | null;
  columns: DocColumn[];
  lines: DocLine[];
  extras: DocExtra[];
  totals: InvoiceTotals;
  /** How each tax or discount is calculated, by id, so Excel can write it as a formula. */
  adjustmentsById: Record<string, { mode: 'percent' | 'fixed'; value: number }>;
  roundingNote: string;
  payment: string;
  notes: string;
  footer: string;
  timesheet: DocTimesheet | null;
  money: (amount: number) => string;
  date: (value: string) => string;
}

const BASE_LABELS: Record<string, { label: string; kind: ColumnKind }> = {
  description: { label: 'Description', kind: 'text' },
  date: { label: 'Date', kind: 'date' },
  hours: { label: 'Hours', kind: 'hours' },
  rate: { label: 'Rate', kind: 'money' },
  amount: { label: 'Amount', kind: 'money' },
  category: { label: 'Category', kind: 'text' },
  project: { label: 'Project', kind: 'text' },
  requestedBy: { label: 'Requested by', kind: 'text' },
};

function customText(value: CustomValue | undefined): string {
  if (value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function nonEmpty(lines: (string | undefined)[]): string[] {
  return lines.flatMap((l) => (l ?? '').split('\n')).map((l) => l.trim()).filter(Boolean);
}

export function buildInvoiceDocument(draft: InvoiceDraft, customFields: CustomField[]): InvoiceDocument {
  const tpl = draft.template;
  const sections = tpl.sections;
  const fields = customFields.filter((f) => f.enabled && f.name.trim());

  const columns: DocColumn[] = tpl.columns.flatMap((key): DocColumn[] => {
    if (key.startsWith('custom:')) {
      const field = fields.find((f) => `custom:${f.id}` === key);
      return field ? [{ key, label: field.name.trim(), kind: 'text' }] : [];
    }
    const base = BASE_LABELS[key];
    return base ? [{ key, label: base.label, kind: base.kind }] : [];
  });
  // An invoice without a description column would be unreadable.
  if (!columns.some((c) => c.key === 'description')) columns.unshift({ key: 'description', ...BASE_LABELS.description });

  const lines: DocLine[] = draft.lines.map((line) => {
    const hours = round2(line.hours);
    const amount = lineAmount(line.hours, line.rate);
    const values: Record<string, string | number> = {
      description: line.description,
      date: line.date ?? '',
      hours,
      rate: line.rate,
      amount,
      category: line.category ?? '',
      project: line.project ?? '',
      requestedBy: line.requestedBy ?? '',
    };
    for (const f of fields) values[`custom:${f.id}`] = line.custom?.[f.id] ?? '';
    return { values, hours, rate: line.rate, amount };
  });

  const extras = draft.extraLines
    .filter((l) => l.description.trim() || l.unitPrice)
    .map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: extraAmount(l) }));

  const totals = computeTotals(draft.lines, draft.extraLines, draft.adjustments);
  const period = servicePeriod(draft.timesheet, draft.periodStart, draft.periodEnd, tpl.periodMode);
  const due = sections.terms ? draftDueDate(draft) : null;
  const business = draft.business;

  const timesheet: DocTimesheet | null = sections.timesheet
    ? {
        columns: [
          { label: 'Date', kind: 'date' },
          { label: 'Start', kind: 'time' },
          { label: 'End', kind: 'time' },
          { label: 'Hours', kind: 'hours' },
          { label: 'Requested by', kind: 'text' },
          { label: 'Project', kind: 'text' },
          { label: 'Category', kind: 'text' },
          { label: 'Description', kind: 'text' },
          ...fields.map((f) => ({ label: f.name.trim(), kind: 'text' as const })),
        ],
        rows: [...draft.timesheet]
          .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
          .map((r) => [
            r.date,
            r.start,
            r.end,
            round2(r.hours),
            r.requestedBy ?? '',
            r.project ?? '',
            r.category,
            r.description,
            ...fields.map((f) => customText(r.custom?.[f.id])),
          ]),
        totalHours: round2(draft.timesheet.reduce((sum, r) => sum + round2(r.hours), 0)),
      }
    : null;

  return {
    number: draft.invoiceNumber,
    issueDate: draft.issueDate,
    dueDate: due,
    terms: sections.terms ? termsLabel(draft.terms) : '',
    servicePeriod: { ...period, text: formatDateSpan(period.start, period.end, tpl.dateFormat) },
    currency: draft.currency,
    currencySymbol: draft.currencySymbol,
    dateFormat: tpl.dateFormat,
    from: sections.from
      ? {
          lines: nonEmpty([business.name || draft.fromName, business.address, business.email, business.phone, business.taxId ? `Tax ID: ${business.taxId}` : '']),
          logo: business.logo,
        }
      : null,
    billTo: sections.billTo
      ? { lines: nonEmpty([draft.client.company, draft.client.contact ? `Attn: ${draft.client.contact}` : '', draft.client.address, draft.client.email]) }
      : null,
    columns,
    lines,
    extras,
    totals,
    adjustmentsById: Object.fromEntries(draft.adjustments.map((a) => [a.id, { mode: a.mode, value: a.value }])),
    roundingNote: roundingNote(draft.rounding),
    payment: sections.payment ? draft.paymentDetails.trim() : '',
    notes: sections.notes ? draft.notes.trim() : '',
    footer: draft.footer.trim(),
    timesheet,
    money: (amount) => formatCurrency(amount, draft.currency, draft.currencySymbol),
    date: (value) => formatInvoiceDate(value, tpl.dateFormat),
  };
}
