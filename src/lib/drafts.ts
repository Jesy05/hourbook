import { endOfMonth, format, parseISO } from 'date-fns';
import {
  formatInvoiceNumber,
  monthlyWeekBlocks,
  SECONDS_PER_HOUR,
  weekStartOf,
  weeklyOvertimeSeconds,
  weeklyTotalsInRange,
  overtimeSummary,
} from './calc';
import { defaultTemplates, emptyClient, newId } from './defaults';
import { hoursBetween } from './invoice/hours';
import { buildLines, computeTotals, type InvoiceTotals, type RateContext } from './invoice/lines';
import type { Entry, InvoiceDraft, InvoiceLine, OvertimeDraft, Profile, RedeemedEntry, TimesheetRow } from './types';

/* Builds editable report drafts from raw entries. Invoice timesheet rows keep a link to their entry. */

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
  start: string,
  end: string,
  today: string,
  existing?: InvoiceDraft,
  options: { clientId?: string | null; templateId?: string | null } = {},
): InvoiceDraft {
  const settings = profile.invoice;
  const template =
    settings.templates.find((t) => t.id === options.templateId) ??
    existing?.template ??
    settings.templates.find((t) => t.id === settings.defaultTemplateId) ??
    settings.templates[0] ??
    defaultTemplates()[0];
  const clientId = options.clientId !== undefined ? options.clientId : (existing?.clientId ?? settings.defaultClientId);
  const savedClient = settings.clients.find((c) => c.id === clientId);
  const client = savedClient ? { ...savedClient } : (existing?.client ?? emptyClient());
  const periodEntries = entries
    .filter((e) => e.profileId === profile.id && inRange(e.date, start, end))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? ''));
  const now = Date.now();
  const timesheet = periodEntries.map((e) => entryToRow(e));
  const draft: InvoiceDraft = {
    id: existing?.id ?? newId(),
    profileId: profile.id,
    type: 'invoice',
    periodStart: start,
    periodEnd: end,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    edited: false,
    palette: existing?.palette ?? profile.excelPalette,
    invoiceNumber: existing?.invoiceNumber ?? formatInvoiceNumber(settings.prefix, settings.nextNumber, settings.padding),
    issueDate: existing?.issueDate ?? today,
    fromName: settings.business.name || profile.name,
    fromContact: profile.contact,
    billTo: [client.company, client.address].filter(Boolean).join(', '),
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    paymentDetails: settings.paymentDetails,
    business: { ...settings.business, name: settings.business.name || profile.name },
    clientId: savedClient ? savedClient.id : null,
    client,
    terms: { ...settings.terms },
    // A due date set by hand survives regenerating from entries.
    ...(existing?.dueDateOverride ? { dueDateOverride: existing.dueDateOverride } : {}),
    notes: existing?.notes ?? settings.notes,
    footer: existing?.footer ?? settings.footer,
    adjustments: existing?.adjustments ?? settings.adjustments.map((a) => ({ ...a, id: newId() })),
    extraLines: existing?.extraLines ?? [],
    rounding: settings.rounding,
    template: { ...template, sections: { ...template.sections } },
    linesManual: false,
    lines: [],
    timesheet,
  };
  return { ...draft, lines: linesForDraft(draft, profile) };
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
  const periodEntries = own.filter((e) => inRange(e.date, start, end));
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
    months: monthlyWeekBlocks(periodEntries, wso).map((m) => ({
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

export function invoiceDraftTotals(draft: InvoiceDraft): InvoiceTotals & { timesheetHours: number } {
  return {
    ...computeTotals(draft.lines, draft.extraLines, draft.adjustments),
    timesheetHours: draft.timesheet.reduce((sum, row) => sum + row.hours, 0),
  };
}

/** Rates in effect for a draft: the profile's default and overrides, for the draft's client. */
export function rateContext(profile: Profile, clientId: string | null): RateContext {
  return { defaultRate: profile.invoice.rate, overrides: profile.invoice.rateOverrides, clientId };
}

/** Line items for a timesheet, following the draft's layout template. */
export function linesForDraft(draft: InvoiceDraft, profile: Profile, timesheet = draft.timesheet): InvoiceLine[] {
  return buildLines(timesheet, draft.template, rateContext(profile, draft.clientId), {
    rounding: draft.rounding,
    customFields: profile.customFields.filter((f) => f.enabled),
    previous: draft.lines,
  });
}

/* ---------- timesheet rows and tracker entries ---------- */

export function entryToRow(entry: Entry): TimesheetRow {
  return {
    id: newId(),
    entryId: entry.id,
    date: entry.date,
    start: entry.start ?? '',
    end: entry.end ?? '',
    // Full precision: rounding to 2 decimals happens only when shown or exported.
    hours: entry.seconds / SECONDS_PER_HOUR,
    category: entry.category,
    description: entry.description,
    ...(entry.requestedBy ? { requestedBy: entry.requestedBy } : {}),
    ...(entry.project ? { project: entry.project } : {}),
    ...(entry.custom ? { custom: { ...entry.custom } } : {}),
  };
}

/** The entry with the row's values, as saved back to the tracker. */
export function rowToEntry(row: TimesheetRow, entry: Entry): Entry {
  return {
    ...entry,
    date: row.date,
    start: row.start || undefined,
    end: row.end || undefined,
    seconds: Math.max(0, Math.round(row.hours * SECONDS_PER_HOUR)),
    category: row.category,
    description: row.description,
    requestedBy: row.requestedBy?.trim() || undefined,
    project: row.project?.trim() || undefined,
    custom: row.custom && Object.keys(row.custom).length ? row.custom : undefined,
  };
}

/**
 * Applies an edit to a row. Changing start or end recalculates the hours; typing
 * the hours by hand marks the row so a mismatch with its times can be flagged.
 */
export function patchRow(row: TimesheetRow, patch: Partial<TimesheetRow>): TimesheetRow {
  const next = { ...row, ...patch };
  if (patch.start !== undefined || patch.end !== undefined) {
    const calculated = hoursBetween(next.start, next.end);
    if (calculated !== null) {
      next.hours = calculated;
      next.hoursEdited = false;
    }
  } else if (patch.hours !== undefined && patch.hoursEdited === undefined) {
    next.hoursEdited = true;
  }
  return next;
}
