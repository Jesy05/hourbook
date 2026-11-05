import { describe, expect, it } from 'vitest';
import { defaultTemplates } from '../defaults';
import type { InvoiceTemplate, TimesheetRow } from '../types';
import { renderFileName, safeFilePart } from './filename';
import { buildLines, computeTotals, groupRows, resolveRate, servicePeriod, type RateContext } from './lines';
import { excelCurrencyFormat, formatCurrency } from './money';
import { dueDate, termsDays, termsLabel } from './terms';
import { formatInvoiceDate, renderDescription } from './template';

const row = (id: string, date: string, hours: number, requestedBy: string, project: string, extra: Partial<TimesheetRow> = {}): TimesheetRow => ({
  id,
  date,
  start: '',
  end: '',
  hours,
  category: 'Other',
  description: id,
  requestedBy,
  project,
  ...extra,
});

const ctx: RateContext = { defaultRate: 20, overrides: [], clientId: null };
const daily: InvoiceTemplate = defaultTemplates()[1];

describe('grouping', () => {
  const rows = [
    row('a', '2026-10-29', 2, 'Naima', 'NYC Glamsquad event'),
    row('b', '2026-10-29', 2.1808, 'Naima', 'NYC Glamsquad event'),
    row('c', '2026-10-29', 1, 'Jaimie', 'NYC Glamsquad event'),
    row('d', '2026-10-30', 3, 'Naima', 'NYC Glamsquad event'),
    row('e', '2026-10-29', 0.5, 'Naima', 'Budget'),
  ];

  it('groups by day + requester + project', () => {
    const groups = groupRows(rows, ['date', 'requestedBy', 'project'], ctx, 'none');
    expect(groups.map((g) => g.rows.map((r) => r.id))).toEqual([['a', 'b'], ['c'], ['e'], ['d']]);
    expect(groups[0].hours).toBeCloseTo(4.1808, 6); // full precision is kept
  });

  it('can make one line per entry or group by a single field', () => {
    expect(groupRows(rows, ['entry'], ctx, 'none')).toHaveLength(5);
    expect(groupRows(rows, ['project'], ctx, 'none').map((g) => g.rows.length)).toEqual([4, 1]);
  });

  it('never mixes rates on one line', () => {
    const withOverride = { ...ctx, overrides: [{ id: 'o', kind: 'project' as const, key: 'Budget', rate: 30 }] };
    const groups = groupRows(rows, ['date'], withOverride, 'none');
    expect(groups.map((g) => [g.rows.length, g.rate])).toEqual([
      [3, 20],
      [1, 30],
      [1, 20],
    ]);
  });

  it('applies the rounding rule to each entry before adding them up', () => {
    const [group] = groupRows([row('a', '2026-10-29', 1.1, 'N', 'P'), row('b', '2026-10-29', 1.1, 'N', 'P')], ['date'], ctx, 'up15');
    expect(group.hours).toBe(2.5); // 1.25 + 1.25, not ceil(2.2) = 2.25
  });

  it('picks the rate: project, then category, then client, then default', () => {
    const overrides = [
      { id: '1', kind: 'client' as const, key: 'c1', rate: 25 },
      { id: '2', kind: 'category' as const, key: 'Travel', rate: 30 },
      { id: '3', kind: 'project' as const, key: 'NYC', rate: 40 },
    ];
    const c = { defaultRate: 20, overrides, clientId: 'c1' };
    expect(resolveRate({ project: 'NYC', category: 'Travel' }, c)).toBe(40);
    expect(resolveRate({ project: 'Other', category: 'Travel' }, c)).toBe(30);
    expect(resolveRate({ category: 'Calendar' }, c)).toBe(25);
    expect(resolveRate({ category: 'Calendar' }, { ...c, clientId: null })).toBe(20);
  });
});

describe('description templates', () => {
  const values = {
    dateFirst: '2026-10-29',
    dateLast: '2026-10-29',
    start: '07:00:28',
    end: '11:11:19',
    hours: 4 + 10 / 60 + 51 / 3600,
    category: 'Other',
    requestedBy: 'Naima',
    project: 'NYC Glamsquad event',
    description: 'Event setup',
    custom: {},
  };
  const opts = { dateFormat: 'MM/DD/YY' as const, customFields: [] };

  it('renders the example line', () => {
    expect(renderDescription('{date} | {requestedBy} - {project} | {hours} hours', values, opts)).toBe('10/29/26 | Naima - NYC Glamsquad event | 4.18 hours');
  });

  it('builds the same line from grouped rows', () => {
    const rows = [row('a', '2026-10-29', 15051 / 3600, 'Naima', 'NYC Glamsquad event')];
    expect(buildLines(rows, daily, ctx, { rounding: 'none', customFields: [] })[0].description).toBe('10/29/26 | Naima - NYC Glamsquad event | 4.18 hours');
  });

  it('drops empty values with their separator', () => {
    const tpl = '{date} | {requestedBy} - {project} | {hours} hours';
    expect(renderDescription(tpl, { ...values, requestedBy: '' }, opts)).toBe('10/29/26 | NYC Glamsquad event | 4.18 hours');
    expect(renderDescription(tpl, { ...values, project: '' }, opts)).toBe('10/29/26 | Naima | 4.18 hours');
    expect(renderDescription(tpl, { ...values, requestedBy: '', project: '' }, opts)).toBe('10/29/26 | 4.18 hours');
  });

  it('fills custom fields by name and shows date ranges and times', () => {
    const custom = [{ id: 'loc', name: 'Location', type: 'text' as const, options: [], enabled: true }];
    expect(
      renderDescription('{date} {start}-{end} @ {location}', { ...values, dateLast: '2026-10-30', custom: { loc: 'NYC' } }, { ...opts, customFields: custom }),
    ).toBe('10/29/26 - 10/30/26 07:00-11:11 @ NYC');
  });

  it('formats dates independently of the interface language', () => {
    expect(formatInvoiceDate('2026-10-29', 'MM/DD/YY')).toBe('10/29/26');
    expect(formatInvoiceDate('2026-10-29', 'DD/MM/YYYY')).toBe('29/10/2026');
    expect(formatInvoiceDate('2026-10-29', 'MMM D, YYYY')).toBe('Oct 29, 2026');
  });
});

describe('payment terms', () => {
  it('Net 14 crosses into the next month', () => {
    expect(dueDate('2026-10-25', { preset: 'net14', customText: '', customDays: null })).toBe('2026-11-08');
    expect(dueDate('2026-12-20', { preset: 'net14', customText: '', customDays: null })).toBe('2027-01-03');
  });

  it('labels and days for each preset', () => {
    expect(termsLabel({ preset: 'receipt', customText: '', customDays: null })).toBe('Due on receipt');
    expect(termsLabel({ preset: 'net30', customText: '', customDays: null })).toBe('Net 30');
    expect(termsDays({ preset: 'receipt', customText: '', customDays: null })).toBe(0);
    expect(termsLabel({ preset: 'custom', customText: 'Upon project completion', customDays: null })).toBe('Upon project completion');
    expect(dueDate('2026-10-25', { preset: 'custom', customText: '', customDays: null })).toBeNull();
    expect(dueDate('2026-10-25', { preset: 'custom', customText: 'Net 45', customDays: 45 })).toBe('2026-12-09');
  });
});

describe('invoice totals', () => {
  const lines = [
    { hours: 4.1808, rate: 20 },
    { hours: 2, rate: 20 },
  ];
  const extras = [{ id: 'x', description: 'Parking', quantity: 2, unitPrice: 25 }];

  it('uses the hours as shown (2 decimals) for each amount', () => {
    expect(computeTotals(lines, [], []).linesSubtotal).toBe(123.6); // 4.18 x 20 + 2 x 20
  });

  it('takes discounts off first, then applies taxes', () => {
    const totals = computeTotals(lines, extras, [
      { id: 't', label: 'Tax', kind: 'tax', mode: 'percent', value: 5 },
      { id: 'd', label: 'Discount', kind: 'discount', mode: 'percent', value: 10 },
      { id: 'f', label: 'Loyalty', kind: 'discount', mode: 'fixed', value: 6.24 },
    ]);
    expect(totals.subtotal).toBe(173.6);
    expect(totals.adjustments.map((a) => [a.label, a.amount])).toEqual([
      ['Discount', -17.36],
      ['Loyalty', -6.24],
      ['Tax', 7.5], // 5% of 150.00
    ]);
    expect(totals.total).toBe(157.5);
  });

  it('adds a fixed tax and handles an empty invoice', () => {
    expect(computeTotals(lines, [], [{ id: 't', label: 'Fee', kind: 'tax', mode: 'fixed', value: 10 }]).total).toBe(133.6);
    expect(computeTotals([], [], [])).toMatchObject({ subtotal: 0, total: 0 });
  });
});

describe('service period', () => {
  const rows = [row('a', '2026-10-29', 1, '', ''), row('b', '2026-10-05', 1, '', '')];
  it('uses the first and last date worked by default', () => {
    expect(servicePeriod(rows, '2026-10-01', '2026-10-31', 'worked')).toEqual({ start: '2026-10-05', end: '2026-10-29' });
  });
  it('can use the full calendar period instead', () => {
    expect(servicePeriod(rows, '2026-10-01', '2026-10-31', 'calendar')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(servicePeriod([], '2026-10-01', '2026-10-31', 'worked')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });
});

describe('currency formatting', () => {
  it('formats with Intl and the currency symbol', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatCurrency(-17.36, 'USD')).toBe('-$17.36');
    expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50');
    expect(formatCurrency(0.005, 'USD')).toBe('$0.01');
  });

  it('uses a custom symbol when one is set', () => {
    expect(formatCurrency(1234.5, 'USD', 'US$')).toBe('US$1,234.50');
    expect(excelCurrencyFormat('USD')).toBe('"$"#,##0.00;-"$"#,##0.00');
    expect(excelCurrencyFormat('USD', 'US$')).toBe('"US$"#,##0.00;-"US$"#,##0.00');
  });

  it('still shows unknown codes clearly', () => {
    expect(formatCurrency(10, 'XYZ1')).toBe('XYZ1 10.00');
  });
});

describe('file names', () => {
  it('fills the template and strips unsafe characters', () => {
    const ctx = { name: 'Jesy Nicole González Jarquín', number: 'INV-0001', client: 'Outside Meets Inside, LLC', start: '2026-10-01', end: '2026-10-31' };
    expect(renderFileName('{name}_Invoice_{yyyy}-{mm}', ctx, 'xlsx')).toBe('Jesy_Nicole_Gonzalez_Jarquin_Invoice_2026-10.xlsx');
    expect(renderFileName('{number} {client}', ctx, 'pdf')).toBe('INV-0001_Outside_Meets_Inside_LLC.pdf');
    expect(renderFileName('', ctx, 'xlsx')).toBe('Jesy_Nicole_Gonzalez_Jarquin_Invoice_2026-10.xlsx');
    expect(safeFilePart('a/b\\c:d*e?"f<g>h|i')).toBe('abcdefghi');
  });
});

describe('starter template names', () => {
  it('follow the interface language until renamed', async () => {
    const { templateName } = await import('../defaults');
    expect(templateName({ id: 'tpl-daily', name: 'Mensual - por día' }, 'en')).toBe('Monthly - by day');
    expect(templateName({ id: 'tpl-category', name: 'Por categoría' }, 'en')).toBe('By category');
    expect(templateName({ id: 'tpl-category', name: 'By category' }, 'es')).toBe('Por categoría');
    expect(templateName({ id: 'tpl-daily', name: 'Naima monthly' }, 'en')).toBe('Naima monthly');
    expect(templateName({ id: 'abc', name: 'Mensual - por día' }, 'en')).toBe('Mensual - por día');
  });
});
