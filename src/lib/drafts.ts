import { endOfMonth, format, parseISO } from 'date-fns';
import {
  categoryTotals,
  formatInvoiceNumber,
  monthlyWeekBlocks,
  round2,
  secondsToDecimalHours,
  SECONDS_PER_HOUR,
  weekStartOf,
  weeklyOvertimeSeconds,
  weeklyTotalsInRange,
  overtimeSummary,
  invoiceTotals,
} from './calc';
import { newId } from './defaults';
import type { Entry, InvoiceDraft, OvertimeDraft, Profile, RedeemedEntry } from './types';

/* Builds editable report drafts from raw entries. Drafts never point back at entries. */

export function monthRange(month: string): { start: string; end: string } {
  const first = parseISO(`${month}-01`);
  return { start: format(first, 'yyyy-MM-dd'), end: format(endOfMonth(first), 'yyyy-MM-dd') };
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function generateInvoiceDraft(
  profile: Profile,
  entries: Entry[],
  month: string,
  today: string,
  existing?: InvoiceDraft,
): InvoiceDraft {
  const { start, end } = monthRange(month);
  const monthEntries = entries
    .filter((e) => e.profileId === profile.id && inRange(e.date, start, end))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? ''));
  const now = Date.now();
  const rate = profile.invoice.rate;
  const lines = categoryTotals(monthEntries).map((c) => ({
    id: newId(),
    description: c.category,
    hours: secondsToDecimalHours(c.seconds),
    rate,
  }));
  return {
    id: existing?.id ?? newId(),
    profileId: profile.id,
    type: 'invoice',
    periodStart: start,
    periodEnd: end,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    edited: false,
    palette: existing?.palette ?? profile.excelPalette,
    invoiceNumber: existing?.invoiceNumber ?? formatInvoiceNumber(profile.invoice.prefix, profile.invoice.nextNumber),
    issueDate: existing?.issueDate ?? today,
    fromName: profile.name,
    fromContact: profile.contact,
    billTo: profile.invoice.billTo,
    currency: profile.invoice.currency,
    paymentDetails: profile.invoice.paymentDetails,
    lines: lines.length ? lines : [{ id: newId(), description: profile.categories[0] ?? 'Services', hours: 0, rate }],
    timesheet: monthEntries.map((e) => ({
      id: newId(),
      date: e.date,
      start: e.start ?? '',
      end: e.end ?? '',
      hours: Math.round((e.seconds / SECONDS_PER_HOUR) * 10000) / 10000,
      category: e.category,
      description: e.description,
    })),
  };
}

export function generateOvertimeDraft(
  profile: Profile,
  entries: Entry[],
  start: string,
  end: string,
  existing?: OvertimeDraft,
): OvertimeDraft {
  const wso = profile.overtime.weekStartsOn;
  const own = entries.filter((e) => e.profileId === profile.id);
  // Weeks that touch the range are counted whole, so the first week is not cut short.
  const firstWeek = weekStartOf(start, wso);
  const weekEntries = own.filter((e) => e.date >= firstWeek && e.date <= end);
  const monthEntries = own.filter((e) => inRange(e.date, start, end));
  const now = Date.now();
  return {
    id: existing?.id ?? newId(),
    profileId: profile.id,
    type: 'overtime',
    periodStart: start,
    periodEnd: end,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    edited: false,
    palette: existing?.palette ?? profile.excelPalette,
    standardHours: profile.overtime.standardHours,
    hoursPerDay: profile.overtime.hoursPerDay,
    openingBalance: profile.overtime.openingBalance,
    weeks: weeklyTotalsInRange(weekEntries, start, end, wso).map((w) => ({
      id: newId(),
      weekStart: w.weekStart,
      workedSeconds: w.seconds,
    })),
    months: monthlyWeekBlocks(monthEntries, wso).map((m) => ({
      id: newId(),
      month: m.month,
      rows: m.weeks.map((w) => ({ id: newId(), weekStart: w.weekStart, seconds: w.seconds })),
    })),
  };
}

export function redeemedInPeriod(redeemed: RedeemedEntry[], draft: OvertimeDraft): RedeemedEntry[] {
  return redeemed
    .filter((r) => r.profileId === draft.profileId && inRange(r.date, draft.periodStart, draft.periodEnd))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function overtimeDraftSummary(draft: OvertimeDraft, redeemed: RedeemedEntry[]) {
  return overtimeSummary({
    weeklyOtHours: draft.weeks.map((w) => weeklyOvertimeSeconds(w.workedSeconds, draft.standardHours) / SECONDS_PER_HOUR),
    openingBalance: draft.openingBalance,
    redeemedHours: redeemed.map((r) => r.hours),
    hoursPerDay: draft.hoursPerDay,
  });
}

export function invoiceDraftTotals(draft: InvoiceDraft) {
  return {
    ...invoiceTotals(draft.lines),
    timesheetHours: round2(draft.timesheet.reduce((sum, row) => sum + row.hours, 0)),
  };
}
