import { describe, expect, it } from 'vitest';
import { newProfile } from './defaults';
import { generateInvoiceDraft, monthRange } from './drafts';
import { formatPeriod, formatPeriodEnglish, isFullMonth } from './format';
import { invoiceFileName } from './excel/invoice';
import type { Entry } from './types';

const profile = { ...newProfile(), id: 'p1', name: 'Jesy Gonzalez', invoiceMode: true, invoice: { ...newProfile().invoice, rate: 20 } };
const entry = (id: string, date: string, hours: number, category = 'Calendar'): Entry => ({
  id,
  profileId: 'p1',
  date,
  start: '09:00:00',
  end: '10:00:00',
  seconds: hours * 3600,
  description: id,
  category,
  createdAt: 0,
});
const entries = [
  entry('before', '2026-10-04', 3),
  entry('first', '2026-10-05', 2),
  entry('middle', '2026-10-10', 1.5, 'Travel booking'),
  entry('last', '2026-10-18', 4),
  entry('after', '2026-10-19', 5),
];

describe('invoice for a date range', () => {
  it('includes only entries inside the range, both ends included', () => {
    const draft = generateInvoiceDraft(profile, entries, '2026-10-05', '2026-10-18', '2026-11-04');
    expect(draft.periodStart).toBe('2026-10-05');
    expect(draft.periodEnd).toBe('2026-10-18');
    expect(draft.timesheet.map((r) => r.description)).toEqual(['first', 'middle', 'last']);
    expect(draft.lines.reduce((s, l) => s + l.hours, 0)).toBe(7.5);
  });

  it('can span two months', () => {
    const draft = generateInvoiceDraft(profile, [...entries, entry('nov', '2026-11-02', 1)], '2026-10-18', '2026-11-03', '2026-11-04');
    expect(draft.timesheet.map((r) => r.description)).toEqual(['last', 'after', 'nov']);
  });

  it('still works for a whole month', () => {
    const { start, end } = monthRange('2026-10');
    const draft = generateInvoiceDraft(profile, entries, start, end, '2026-11-04');
    expect(draft.timesheet).toHaveLength(5);
  });
});

describe('period labels and file names', () => {
  it('detects a whole month', () => {
    expect(isFullMonth('2026-10-01', '2026-10-31')).toBe(true);
    expect(isFullMonth('2026-02-01', '2026-02-28')).toBe(true);
    expect(isFullMonth('2026-10-01', '2026-10-30')).toBe(false);
    expect(isFullMonth('2026-10-02', '2026-10-31')).toBe(false);
  });

  it('writes the period in English for the invoice and email', () => {
    expect(formatPeriodEnglish('2026-10-01', '2026-10-31')).toBe('October 2026');
    expect(formatPeriodEnglish('2026-10-05', '2026-10-18')).toBe('October 5 - 18, 2026');
    expect(formatPeriodEnglish('2026-10-25', '2026-11-07')).toBe('October 25 - November 7, 2026');
    expect(formatPeriodEnglish('2026-12-20', '2027-01-03')).toBe('December 20, 2026 - January 3, 2027');
    expect(formatPeriodEnglish('2026-10-05', '2026-10-05')).toBe('October 5, 2026');
  });

  it('labels drafts in the interface language', () => {
    expect(formatPeriod('2026-10-01', '2026-10-31', 'es')).toBe('Octubre 2026');
    expect(formatPeriod('2026-10-05', '2026-10-18', 'en')).toBe('Oct 5 - Oct 18, 2026');
  });

  it('names the file by month or by range', () => {
    const month = generateInvoiceDraft(profile, entries, '2026-10-01', '2026-10-31', '2026-11-04');
    const range = generateInvoiceDraft(profile, entries, '2026-10-05', '2026-10-18', '2026-11-04');
    expect(invoiceFileName(month)).toBe('Jesy_Gonzalez_Invoice_2026-10.xlsx');
    expect(invoiceFileName(range)).toBe('Jesy_Gonzalez_Invoice_2026-10-05_to_2026-10-18.xlsx');
  });
});
