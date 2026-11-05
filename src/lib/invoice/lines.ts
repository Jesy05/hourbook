import { newId } from '../defaults';
import type {
  Adjustment,
  CustomField,
  CustomValue,
  ExtraLine,
  GroupKey,
  InvoiceLine,
  InvoiceTemplate,
  RateOverride,
  RoundingRule,
  TimesheetRow,
} from '../types';
import { applyRounding, round2 } from './hours';
import { renderDescription } from './template';

/* Turns timesheet rows into invoice lines, and lines into totals. */

export interface RateContext {
  defaultRate: number;
  overrides: RateOverride[];
  clientId: string | null;
}

/** The rate for one row: a project override wins, then category, then client, then the default. */
export function resolveRate(row: Pick<TimesheetRow, 'project' | 'category'>, ctx: RateContext): number {
  const find = (kind: RateOverride['kind'], key: string | null | undefined) =>
    key ? ctx.overrides.find((o) => o.kind === kind && o.key === key) : undefined;
  return (find('project', row.project) ?? find('category', row.category) ?? find('client', ctx.clientId))?.rate ?? ctx.defaultRate;
}

function customText(value: CustomValue | undefined): string {
  if (value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** The value a row has for a grouping key, as text. */
export function groupValue(row: TimesheetRow, key: GroupKey): string {
  switch (key) {
    case 'entry':
      return row.id;
    case 'date':
      return row.date;
    case 'category':
      return row.category;
    case 'project':
      return row.project ?? '';
    case 'requestedBy':
      return row.requestedBy ?? '';
    default:
      return customText(row.custom?.[key.slice('custom:'.length)]);
  }
}

export interface LineGroup {
  rows: TimesheetRow[];
  rate: number;
  /** Billed hours at full precision: each row rounded by the rule, then summed. */
  hours: number;
}

/**
 * Groups rows by the template's keys, in the order they first appear. Rows with
 * different rates never share a line, so hours x rate always equals the amount.
 */
export function groupRows(rows: TimesheetRow[], groupBy: GroupKey[], ctx: RateContext, rounding: RoundingRule): LineGroup[] {
  const keys: GroupKey[] = groupBy.includes('entry') || groupBy.length === 0 ? ['entry'] : groupBy;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));
  const groups = new Map<string, LineGroup>();
  for (const row of sorted) {
    const rate = resolveRate(row, ctx);
    const id = JSON.stringify([...keys.map((k) => groupValue(row, k)), rate]);
    const group = groups.get(id) ?? { rows: [], rate, hours: 0 };
    group.rows.push(row);
    group.hours += applyRounding(row.hours, rounding);
    groups.set(id, group);
  }
  return [...groups.values()];
}

/** Distinct non-empty values joined, e.g. "Naima, Jaimie". */
function joined(values: (string | undefined)[]): string {
  return [...new Set(values.map((v) => v?.trim() ?? '').filter(Boolean))].join(', ');
}

export function buildLines(
  rows: TimesheetRow[],
  template: InvoiceTemplate,
  ctx: RateContext,
  options: { rounding: RoundingRule; customFields: CustomField[]; previous?: InvoiceLine[] },
): InvoiceLine[] {
  return groupRows(rows, template.groupBy, ctx, options.rounding).map((group, index) => {
    const { rows: members } = group;
    const dates = members.map((r) => r.date).sort();
    const starts = members.map((r) => r.start).filter(Boolean).sort();
    const ends = members.map((r) => r.end).filter(Boolean).sort();
    const custom: Record<string, string> = {};
    for (const field of options.customFields) {
      const value = joined(members.map((r) => customText(r.custom?.[field.id])));
      if (value) custom[field.id] = value;
    }
    const values = {
      dateFirst: dates[0] ?? '',
      dateLast: dates.at(-1) ?? '',
      start: starts[0] ?? '',
      end: ends.at(-1) ?? '',
      hours: group.hours,
      category: joined(members.map((r) => r.category)),
      requestedBy: joined(members.map((r) => r.requestedBy)),
      project: joined(members.map((r) => r.project)),
      description: joined(members.map((r) => r.description)),
      custom,
    };
    return {
      id: options.previous?.[index]?.id ?? newId(),
      description: renderDescription(template.descriptionTemplate, values, { dateFormat: template.dateFormat, customFields: options.customFields }),
      hours: group.hours,
      rate: group.rate,
      date: values.dateFirst,
      category: values.category,
      project: values.project,
      requestedBy: values.requestedBy,
      custom,
    };
  });
}

/* ---------- totals ---------- */

/** Amount of a line: the hours as shown (2 decimals) times the rate, to the cent. */
export function lineAmount(hours: number, rate: number): number {
  return round2(round2(hours) * rate);
}

export function extraAmount(line: ExtraLine): number {
  return round2(line.quantity * line.unitPrice);
}

export interface AdjustmentAmount {
  id: string;
  label: string;
  kind: Adjustment['kind'];
  /** Positive for taxes, negative for discounts. */
  amount: number;
}

export interface InvoiceTotals {
  hours: number;
  linesSubtotal: number;
  extrasSubtotal: number;
  subtotal: number;
  adjustments: AdjustmentAmount[];
  total: number;
}

/**
 * Subtotal of time lines and extra items; discounts come off the subtotal
 * first, then taxes apply to the discounted amount.
 */
export function computeTotals(lines: Pick<InvoiceLine, 'hours' | 'rate'>[], extras: ExtraLine[], adjustments: Adjustment[]): InvoiceTotals {
  const linesSubtotal = round2(lines.reduce((sum, l) => sum + lineAmount(l.hours, l.rate), 0));
  const extrasSubtotal = round2(extras.reduce((sum, l) => sum + extraAmount(l), 0));
  const subtotal = round2(linesSubtotal + extrasSubtotal);
  const discounts = adjustments
    .filter((a) => a.kind === 'discount')
    .map((a) => ({ id: a.id, label: a.label, kind: a.kind, amount: -round2(a.mode === 'percent' ? (subtotal * a.value) / 100 : a.value) }));
  const afterDiscounts = round2(subtotal + discounts.reduce((sum, d) => sum + d.amount, 0));
  const taxes = adjustments
    .filter((a) => a.kind === 'tax')
    .map((a) => ({ id: a.id, label: a.label, kind: a.kind, amount: round2(a.mode === 'percent' ? (afterDiscounts * a.value) / 100 : a.value) }));
  const total = round2(afterDiscounts + taxes.reduce((sum, t) => sum + t.amount, 0));
  return {
    hours: lines.reduce((sum, l) => sum + l.hours, 0),
    linesSubtotal,
    extrasSubtotal,
    subtotal,
    adjustments: [...discounts, ...taxes],
    total,
  };
}

/** First and last date worked, or the chosen period when there are no rows or the template asks for it. */
export function servicePeriod(
  rows: Pick<TimesheetRow, 'date'>[],
  periodStart: string,
  periodEnd: string,
  mode: InvoiceTemplate['periodMode'],
): { start: string; end: string } {
  if (mode === 'calendar' || rows.length === 0) return { start: periodStart, end: periodEnd };
  const dates = rows.map((r) => r.date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}
