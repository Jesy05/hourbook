import { describe, expect, it } from 'vitest';
import { applyRounding, clockSeconds, hoursBetween, hoursMismatch, round2, roundingNote } from './hours';

describe('decimal hours', () => {
  it('counts hours, minutes and seconds: 7:00:28 to 11:11:19 is 4.18 h', () => {
    const hours = hoursBetween('07:00:28', '11:11:19')!;
    expect(hours).toBeCloseTo(4 + 10 / 60 + 51 / 3600, 10); // full precision is kept
    expect(round2(hours)).toBe(4.18); // rounded only for display and export
    expect(round2(hours)).not.toBe(4.11); // the h.mm mistake
  });

  it('works with or without seconds and rejects bad ranges', () => {
    expect(hoursBetween('09:00', '10:30')).toBe(1.5);
    expect(clockSeconds('7:05:09')).toBe(7 * 3600 + 5 * 60 + 9);
    expect(hoursBetween('10:00', '09:00')).toBeNull();
    expect(hoursBetween('', '09:00')).toBeNull();
    expect(clockSeconds('25 past')).toBeNull();
  });
});

describe('rounding rules', () => {
  const h = 4.1808; // 4:10:51
  it('applies each rule to one entry', () => {
    expect(applyRounding(h, 'none')).toBe(h);
    expect(applyRounding(h, 'quarter')).toBe(4.25);
    expect(applyRounding(4.1, 'quarter')).toBe(4);
    expect(applyRounding(h, 'tenth')).toBeCloseTo(4.2, 10);
    expect(applyRounding(h, 'up15')).toBe(4.25);
    expect(applyRounding(4.0, 'up15')).toBe(4); // exact quarters stay put
    expect(applyRounding(4.01, 'up15')).toBe(4.25);
  });

  it('explains the rule on the invoice only when one is used', () => {
    expect(roundingNote('none')).toBe('');
    expect(roundingNote('up15')).toMatch(/15 minutes/);
  });
});

describe('manually edited hours', () => {
  const row = { start: '07:00:28', end: '11:11:19', hours: 4.18, hoursEdited: false };

  it('flags a row whose typed hours no longer match its times', () => {
    expect(hoursMismatch({ ...row, hours: 5, hoursEdited: true })).toBeCloseTo(4.1808, 3);
  });

  it('does not flag matching, untouched or time-less rows', () => {
    expect(hoursMismatch({ ...row, hours: 4.18, hoursEdited: true })).toBeNull(); // same at 2 decimals
    expect(hoursMismatch({ ...row, hours: 5 })).toBeNull(); // not typed by hand (e.g. a paused timer)
    expect(hoursMismatch({ start: '', end: '', hours: 5, hoursEdited: true })).toBeNull();
  });
});
