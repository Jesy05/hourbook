import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import type { WeekDay } from './types';

/*
 * Pure calculation helpers. Dates are plain calendar strings (YYYY-MM-DD) and
 * times are wall-clock strings (HH:mm or HH:mm:ss) already expressed in the
 * profile time zone, so nothing here depends on the machine's clock or zone.
 */

export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86400;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/* ---------- durations ---------- */

/** "9:11" -> 9.18, "0:27" -> 0.45. Accepts h:mm or h:mm:ss. */
export function hmToDecimal(hm: string): number {
  const seconds = parseClock(hm);
  if (seconds === null) return 0;
  return secondsToDecimalHours(seconds);
}

/** 9.18 -> "9:11". Rounds to the nearest minute. */
export function decimalToHm(hours: number): string {
  return formatDuration(Math.round(hours * 60) * 60);
}

export function secondsToDecimalHours(seconds: number): number {
  return round2(seconds / SECONDS_PER_HOUR);
}

/** Seconds -> "h:mm" (or "h:mm:ss"). Hours are not wrapped at 24. */
export function formatDuration(seconds: number, withSeconds = false): string {
  const negative = seconds < 0;
  let s = Math.abs(Math.round(seconds));
  if (!withSeconds) s = Math.round(s / 60) * 60;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const body = withSeconds
    ? `${h}:${pad(m)}:${pad(sec)}`
    : `${h}:${pad(m)}`;
  return negative ? `-${body}` : body;
}

/** Parses "h:mm", "h:mm:ss" into seconds. */
export function parseClock(text: string): number | null {
  const match = /^\s*(\d+):([0-5]?\d)(?::([0-5]?\d))?\s*$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

/** Parses a duration typed by a person: "1:30", "1:30:00", "1.5" or "1,5" (hours). */
export function parseDuration(text: string): number | null {
  const clock = parseClock(text);
  if (clock !== null) return clock;
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * SECONDS_PER_HOUR);
}

/** "HH:mm[:ss]" -> seconds since midnight. */
export function timeToSeconds(time: string): number {
  const [h = '0', m = '0', s = '0'] = time.split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Seconds since midnight -> "HH:mm:ss". */
export function secondsToTime(seconds: number): string {
  const s = Math.max(0, Math.min(SECONDS_PER_DAY - 1, Math.round(seconds)));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function sumSeconds(items: { seconds: number }[]): number {
  return items.reduce((total, item) => total + item.seconds, 0);
}

/* ---------- midnight splitting ---------- */

export interface LocalDateTime {
  date: string;
  time: string;
}

export interface DaySegment {
  date: string;
  start: string;
  end: string;
  seconds: number;
}

/**
 * Splits a local start/end range into one segment per calendar day. The first
 * day ends at 23:59:59 for display, but its seconds run up to midnight exactly.
 */
export function splitAtMidnight(start: LocalDateTime, end: LocalDateTime): DaySegment[] {
  const days = differenceInCalendarDays(parseISO(end.date), parseISO(start.date));
  const startSec = timeToSeconds(start.time);
  const endSec = timeToSeconds(end.time);
  if (days < 0 || (days === 0 && endSec <= startSec)) return [];
  if (days === 0) {
    return [{ date: start.date, start: start.time, end: end.time, seconds: endSec - startSec }];
  }
  const segments: DaySegment[] = [];
  for (let i = 0; i <= days; i++) {
    const date = format(addDays(parseISO(start.date), i), 'yyyy-MM-dd');
    const from = i === 0 ? startSec : 0;
    const to = i === days ? endSec : SECONDS_PER_DAY;
    if (to <= from) continue;
    segments.push({
      date,
      start: secondsToTime(from),
      end: secondsToTime(to === SECONDS_PER_DAY ? SECONDS_PER_DAY - 1 : to),
      seconds: to - from,
    });
  }
  return segments;
}

/* ---------- weeks and months ---------- */

export function weekStartOf(date: string, weekStartsOn: WeekDay): string {
  return format(startOfWeek(parseISO(date), { weekStartsOn }), 'yyyy-MM-dd');
}

export interface WeekTotal {
  weekStart: string;
  seconds: number;
}

/** Totals per week, sorted by week start. Only weeks with entries are returned. */
export function groupByWeek(
  entries: { date: string; seconds: number }[],
  weekStartsOn: WeekDay,
): WeekTotal[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const key = weekStartOf(entry.date, weekStartsOn);
    totals.set(key, (totals.get(key) ?? 0) + entry.seconds);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, seconds]) => ({ weekStart, seconds }));
}

/** Every week start whose week touches the inclusive range [start, end]. */
export function weeksInRange(start: string, end: string, weekStartsOn: WeekDay): string[] {
  const weeks: string[] = [];
  let cursor = parseISO(weekStartOf(start, weekStartsOn));
  const last = parseISO(end);
  while (cursor <= last) {
    weeks.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/** Weekly totals for every week in the range, including empty weeks. */
export function weeklyTotalsInRange(
  entries: { date: string; seconds: number }[],
  start: string,
  end: string,
  weekStartsOn: WeekDay,
): WeekTotal[] {
  const byWeek = new Map(groupByWeek(entries, weekStartsOn).map((w) => [w.weekStart, w.seconds]));
  return weeksInRange(start, end, weekStartsOn).map((weekStart) => ({
    weekStart,
    seconds: byWeek.get(weekStart) ?? 0,
  }));
}

export interface MonthTotal {
  month: string;
  seconds: number;
}

export function monthlyTotals(entries: { date: string; seconds: number }[]): MonthTotal[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    totals.set(key, (totals.get(key) ?? 0) + entry.seconds);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, seconds]) => ({ month, seconds }));
}

export interface MonthWeeks {
  month: string;
  weeks: WeekTotal[];
  total: number;
}

/**
 * Hours worked per week inside each month. A week that crosses a month
 * boundary is split between both months, like the monthly blocks in the
 * original spreadsheet.
 */
export function monthlyWeekBlocks(
  entries: { date: string; seconds: number }[],
  weekStartsOn: WeekDay,
): MonthWeeks[] {
  const months = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const week = weekStartOf(entry.date, weekStartsOn);
    const weeks = months.get(month) ?? new Map<string, number>();
    weeks.set(week, (weeks.get(week) ?? 0) + entry.seconds);
    months.set(month, weeks);
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, weeks]) => {
      const list = [...weeks.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, seconds]) => ({ weekStart, seconds }));
      return { month, weeks: list, total: sumSeconds(list) };
    });
}

/* ---------- overtime ---------- */

/** max(0, worked - standard). */
export function weeklyOvertimeSeconds(workedSeconds: number, standardHours: number): number {
  return Math.max(0, workedSeconds - standardHours * SECONDS_PER_HOUR);
}

/** Overtime in decimal hours (2 places), as in the OT Hours column. */
export function weeklyOvertimeHours(workedSeconds: number, standardHours: number): number {
  return secondsToDecimalHours(weeklyOvertimeSeconds(workedSeconds, standardHours));
}

export interface OvertimeSummary {
  overtime: number;
  redeemed: number;
  balance: number;
  days: number;
}

export function overtimeSummary(input: {
  weeklyOtHours: number[];
  openingBalance: number;
  redeemedHours: number[];
  hoursPerDay: number;
}): OvertimeSummary {
  const overtime = round2(input.weeklyOtHours.reduce((a, b) => a + b, 0) + input.openingBalance);
  const redeemed = round2(input.redeemedHours.reduce((a, b) => a + b, 0));
  const balance = round2(overtime - redeemed);
  const days = input.hoursPerDay > 0 ? round2(balance / input.hoursPerDay) : 0;
  return { overtime, redeemed, balance, days };
}

/* ---------- invoice ---------- */

export function lineAmount(hours: number, rate: number): number {
  return round2(hours * rate);
}

export function invoiceTotals(lines: { hours: number; rate: number }[]): {
  hours: number;
  amount: number;
} {
  return {
    hours: round2(lines.reduce((total, line) => total + line.hours, 0)),
    amount: round2(lines.reduce((total, line) => total + lineAmount(line.hours, line.rate), 0)),
  };
}

/** One line per category, in the order categories are first seen. */
export function categoryTotals(
  entries: { category: string; seconds: number }[],
): { category: string; seconds: number }[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.seconds);
  }
  return [...totals.entries()].map(([category, seconds]) => ({ category, seconds }));
}

/* ---------- overlaps ---------- */

export interface TimedRange {
  id?: string;
  date: string;
  start?: string;
  end?: string;
}

export function rangesOverlap(a: TimedRange, b: TimedRange): boolean {
  if (a.date !== b.date || !a.start || !a.end || !b.start || !b.end) return false;
  return timeToSeconds(a.start) < timeToSeconds(b.end) && timeToSeconds(b.start) < timeToSeconds(a.end);
}

export function findOverlaps<T extends TimedRange>(candidate: TimedRange, others: T[]): T[] {
  return others.filter((other) => other.id !== candidate.id && rangesOverlap(candidate, other));
}

/* ---------- formatting ---------- */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatInvoiceNumber(prefix: string, value: number): string {
  return `${prefix}${String(value).padStart(4, '0')}`;
}
