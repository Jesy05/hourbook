import type { RoundingRule, TimesheetRow } from '../types';

/*
 * Hours are kept at full precision everywhere and only rounded to 2 decimals
 * when shown or exported. 7:00:28 to 11:11:19 is 4h 10m 51s = 4.1808 h -> 4.18.
 */

/** "HH:mm[:ss]" -> seconds since midnight, or null when empty or invalid. */
export function clockSeconds(time: string | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

/** hours + minutes/60 + seconds/3600 between two clock times, or null if end is not after start. */
export function hoursBetween(start: string | undefined, end: string | undefined): number | null {
  const a = clockSeconds(start);
  const b = clockSeconds(end);
  if (a === null || b === null || b <= a) return null;
  return (b - a) / 3600;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Applies a profile's rounding rule to one entry's hours. */
export function applyRounding(hours: number, rule: RoundingRule): number {
  switch (rule) {
    case 'quarter':
      return Math.round(hours * 4) / 4;
    case 'tenth':
      return Math.round(hours * 10) / 10;
    case 'up15':
      // A tiny tolerance so 1:00:00 stays 1.00 instead of jumping to 1.25.
      return Math.ceil(hours * 4 - 1e-9) / 4;
    default:
      return hours;
  }
}

/** Sentence used on the invoice when a rule is in use. */
export function roundingNote(rule: RoundingRule): string {
  switch (rule) {
    case 'quarter':
      return 'Hours are rounded to the nearest 0.25 h per entry.';
    case 'tenth':
      return 'Hours are rounded to the nearest 0.1 h per entry.';
    case 'up15':
      return 'Hours are rounded up to the next 15 minutes per entry.';
    default:
      return '';
  }
}

/**
 * A row whose hours were typed by hand and no longer match its start and end.
 * Returns the hours calculated from the times, or null when there is no mismatch.
 */
export function hoursMismatch(row: Pick<TimesheetRow, 'start' | 'end' | 'hours' | 'hoursEdited'>): number | null {
  if (!row.hoursEdited) return null;
  const calculated = hoursBetween(row.start, row.end);
  if (calculated === null) return null;
  // Compare at the precision shown to people (2 decimals).
  return round2(calculated) === round2(row.hours) ? null : calculated;
}
