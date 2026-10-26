import { describe, expect, it } from 'vitest';
import {
  categoryTotals,
  decimalToHm,
  findOverlaps,
  formatDuration,
  groupByWeek,
  hmToDecimal,
  invoiceTotals,
  lineAmount,
  monthlyTotals,
  monthlyWeekBlocks,
  overtimeSummary,
  parseClock,
  parseDuration,
  splitAtMidnight,
  weekStartOf,
  weeklyOvertimeHours,
  weeklyOvertimeSeconds,
  weeklyTotalsInRange,
} from './calc';

const h = (hours: number, minutes = 0, seconds = 0) => hours * 3600 + minutes * 60 + seconds;

/* OT Hours column from the current spreadsheet (5-Jan to 7-Sep). */
const JAIMIE_WEEKLY_OT = [
  0, 9.18, 9.37, 5.63, 4.73, 1.22, 1.0, 0.45, 0.4, 0.68, 0.42, 0.27, 6.95, 9.42, 6.18, 12.96, 8.28,
  5.53, 4.62, 9.37, 2.48, 1.85, 0, 4.15, 0.86, 6.84, 5.36, 7.58, 8.1, 9.1, 5.7, 3.95, 5.28, 8.25,
  3.3, 10.27,
];
const JAIMIE_REDEEMED = [1, 1, 8, 4, 1, 1, 56, 2, 1, 4, 8];

describe('weekly overtime', () => {
  it('subtracts the standard week', () => {
    expect(weeklyOvertimeSeconds(h(45, 42), 40)).toBe(h(5, 42));
    expect(weeklyOvertimeHours(h(45, 42), 40)).toBe(5.7);
  });

  it('gives 0 for a week under 40 hours', () => {
    expect(weeklyOvertimeSeconds(h(34, 48), 40)).toBe(0);
    expect(weeklyOvertimeHours(h(8, 30), 40)).toBe(0);
  });

  it('gives 0 for exactly 40 hours', () => {
    expect(weeklyOvertimeHours(h(40), 40)).toBe(0);
  });

  it('respects a custom standard week', () => {
    expect(weeklyOvertimeHours(h(37, 30), 35)).toBe(2.5);
  });
});

describe('h:mm and decimal conversion', () => {
  it('converts h:mm to decimal hours', () => {
    expect(hmToDecimal('9:11')).toBe(9.18);
    expect(hmToDecimal('0:27')).toBe(0.45);
    expect(hmToDecimal('5:42')).toBe(5.7);
    expect(hmToDecimal('10:16')).toBe(10.27);
    expect(hmToDecimal('0:00')).toBe(0);
  });

  it('converts decimal hours to h:mm', () => {
    expect(decimalToHm(9.18)).toBe('9:11');
    expect(decimalToHm(0.45)).toBe('0:27');
    expect(decimalToHm(5.7)).toBe('5:42');
  });

  it('formats durations past 24 hours without wrapping', () => {
    expect(formatDuration(h(187, 41), true)).toBe('187:41:00');
    expect(formatDuration(h(44, 14, 28), true)).toBe('44:14:28');
    expect(formatDuration(h(45, 42))).toBe('45:42');
  });

  it('parses typed durations', () => {
    expect(parseClock('1:30')).toBe(h(1, 30));
    expect(parseClock('abc')).toBeNull();
    expect(parseDuration('1.5')).toBe(h(1, 30));
    expect(parseDuration('1,25')).toBe(h(1, 15));
    expect(parseDuration('2:00:30')).toBe(h(2, 0, 30));
    expect(parseDuration('')).toBeNull();
  });
});

describe('balance and days', () => {
  it('matches the example numbers', () => {
    const summary = overtimeSummary({
      weeklyOtHours: [179.74],
      openingBalance: 0,
      redeemedHours: [87],
      hoursPerDay: 8,
    });
    expect(summary).toEqual({ overtime: 179.74, redeemed: 87, balance: 92.74, days: 11.59 });
  });

  it('reproduces the current spreadsheet from its weekly rows', () => {
    // The sheet shows each week rounded to 2 places but sums the exact values,
    // so adding the rounded column lands within a cent of its 179.74.
    const summary = overtimeSummary({
      weeklyOtHours: JAIMIE_WEEKLY_OT,
      openingBalance: 0,
      redeemedHours: JAIMIE_REDEEMED,
      hoursPerDay: 8,
    });
    expect(summary.overtime).toBeCloseTo(179.74, 1);
    expect(summary.redeemed).toBe(87);
    expect(summary.balance).toBeCloseTo(92.74, 1);
    expect(summary.days).toBeCloseTo(11.59, 1);
  });

  it('sums exact weekly values, not the rounded ones', () => {
    // 3 weeks of 0:20 overtime: 0.33 each when rounded, but 1.00 in total.
    const summary = overtimeSummary({
      weeklyOtHours: [1 / 3, 1 / 3, 1 / 3],
      openingBalance: 0,
      redeemedHours: [],
      hoursPerDay: 8,
    });
    expect(summary.overtime).toBe(1);
  });

  it('adds the opening balance to overtime', () => {
    const summary = overtimeSummary({
      weeklyOtHours: [5.7, 3.95],
      openingBalance: 170.09,
      redeemedHours: [87],
      hoursPerDay: 8,
    });
    expect(summary.overtime).toBe(179.74);
    expect(summary.balance).toBe(92.74);
  });
});

describe('midnight splitting', () => {
  it('keeps a same-day range as one segment', () => {
    expect(splitAtMidnight({ date: '2026-03-02', time: '09:00:00' }, { date: '2026-03-02', time: '10:30:00' })).toEqual([
      { date: '2026-03-02', start: '09:00:00', end: '10:30:00', seconds: h(1, 30) },
    ]);
  });

  it('splits a range that crosses midnight into two entries', () => {
    const segments = splitAtMidnight(
      { date: '2026-03-02', time: '22:30:00' },
      { date: '2026-03-03', time: '01:15:00' },
    );
    expect(segments).toEqual([
      { date: '2026-03-02', start: '22:30:00', end: '23:59:59', seconds: h(1, 30) },
      { date: '2026-03-03', start: '00:00:00', end: '01:15:00', seconds: h(1, 15) },
    ]);
  });

  it('drops an empty tail that ends exactly at midnight', () => {
    const segments = splitAtMidnight(
      { date: '2026-03-02', time: '23:00:00' },
      { date: '2026-03-03', time: '00:00:00' },
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].seconds).toBe(h(1));
  });

  it('handles month and year boundaries', () => {
    const segments = splitAtMidnight(
      { date: '2026-12-31', time: '23:00:00' },
      { date: '2027-01-01', time: '00:30:00' },
    );
    expect(segments.map((s) => s.date)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('returns nothing for an inverted range', () => {
    expect(splitAtMidnight({ date: '2026-03-02', time: '10:00:00' }, { date: '2026-03-02', time: '09:00:00' })).toEqual([]);
  });
});

describe('week grouping with a Monday start', () => {
  it('finds the Monday of the week', () => {
    expect(weekStartOf('2026-01-05', 1)).toBe('2026-01-05'); // Monday
    expect(weekStartOf('2026-01-11', 1)).toBe('2026-01-05'); // Sunday
    expect(weekStartOf('2026-01-12', 1)).toBe('2026-01-12');
    expect(weekStartOf('2026-01-11', 0)).toBe('2026-01-11'); // Sunday start
  });

  it('groups entries by week', () => {
    const weeks = groupByWeek(
      [
        { date: '2026-08-03', seconds: h(9) },
        { date: '2026-08-07', seconds: h(10) },
        { date: '2026-08-09', seconds: h(1) },
        { date: '2026-08-10', seconds: h(8) },
      ],
      1,
    );
    expect(weeks).toEqual([
      { weekStart: '2026-08-03', seconds: h(20) },
      { weekStart: '2026-08-10', seconds: h(8) },
    ]);
  });

  it('includes empty weeks in a range', () => {
    const weeks = weeklyTotalsInRange([{ date: '2026-01-14', seconds: h(2) }], '2026-01-01', '2026-01-20', 1);
    expect(weeks).toEqual([
      { weekStart: '2025-12-29', seconds: 0 },
      { weekStart: '2026-01-05', seconds: 0 },
      { weekStart: '2026-01-12', seconds: h(2) },
      { weekStart: '2026-01-19', seconds: 0 },
    ]);
  });
});

describe('monthly totals', () => {
  const entries = [
    { date: '2026-08-03', seconds: h(45, 42) },
    { date: '2026-08-31', seconds: h(8, 30) },
    { date: '2026-09-01', seconds: h(34, 48) },
    { date: '2026-09-08', seconds: h(50, 16) },
  ];

  it('sums hours per month', () => {
    expect(monthlyTotals(entries)).toEqual([
      { month: '2026-08', seconds: h(54, 12) },
      { month: '2026-09', seconds: h(85, 4) },
    ]);
  });

  it('splits a week that crosses months between both month blocks', () => {
    const blocks = monthlyWeekBlocks(entries, 1);
    expect(blocks[0].weeks.at(-1)).toEqual({ weekStart: '2026-08-31', seconds: h(8, 30) });
    expect(blocks[1].weeks[0]).toEqual({ weekStart: '2026-08-31', seconds: h(34, 48) });
    expect(blocks[1].total).toBe(h(85, 4));
  });

  it('matches the September block of the spreadsheet', () => {
    const sep = [h(34, 48), h(50, 16), h(44, 14, 28), h(45, 2, 45), h(16, 17, 28), h(9, 12, 48)];
    expect(formatDuration(sep.reduce((a, b) => a + b, 0), true)).toBe('199:51:29');
  });
});

describe('invoice totals', () => {
  it('multiplies hours by rate and sums lines', () => {
    expect(lineAmount(12.5, 20)).toBe(250);
    expect(
      invoiceTotals([
        { hours: 12.5, rate: 20 },
        { hours: 3.33, rate: 20 },
        { hours: 1.25, rate: 25 },
      ]),
    ).toEqual({ hours: 17.08, amount: 347.85 });
  });

  it('returns zero for no lines', () => {
    expect(invoiceTotals([])).toEqual({ hours: 0, amount: 0 });
  });

  it('groups entries by category', () => {
    expect(
      categoryTotals([
        { category: 'Travel booking', seconds: h(2) },
        { category: 'Calendar', seconds: h(1) },
        { category: 'Travel booking', seconds: h(1, 30) },
      ]),
    ).toEqual([
      { category: 'Travel booking', seconds: h(3, 30) },
      { category: 'Calendar', seconds: h(1) },
    ]);
  });
});

describe('overlaps', () => {
  it('detects overlapping entries on the same day only', () => {
    const others = [
      { id: 'a', date: '2026-03-02', start: '09:00:00', end: '10:00:00' },
      { id: 'b', date: '2026-03-02', start: '10:00:00', end: '11:00:00' },
      { id: 'c', date: '2026-03-03', start: '09:30:00', end: '10:30:00' },
    ];
    const hits = findOverlaps({ date: '2026-03-02', start: '09:30:00', end: '10:15:00' }, others);
    expect(hits.map((o) => o.id)).toEqual(['a', 'b']);
    expect(findOverlaps({ id: 'a', date: '2026-03-02', start: '09:00:00', end: '10:00:00' }, others)).toEqual([]);
  });
});
