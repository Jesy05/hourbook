import { describe, expect, it } from 'vitest';
import { mergeData, mergeList } from './merge';
import { emptyData } from './storage';
import type { Entry } from './types';

const entry = (id: string, seconds = 3600): Entry => ({
  id,
  profileId: 'p',
  date: '2026-10-26',
  seconds,
  description: id,
  category: 'Other',
  createdAt: 0,
});

describe('mergeList', () => {
  const base = [entry('a'), entry('b'), entry('c')];

  it('keeps items added on either side', () => {
    const server = [...base, entry('s')];
    const local = [...base, entry('l')];
    expect(mergeList(server, local, base).map((e) => e.id)).toEqual(['a', 'b', 'c', 's', 'l']);
  });

  it('lets a local edit win over an untouched server copy', () => {
    const local = [entry('a', 60), entry('b'), entry('c')];
    expect(mergeList(base, local, base)[0].seconds).toBe(60);
  });

  it('takes a server edit when the item did not change locally', () => {
    const server = [entry('a'), entry('b', 120), entry('c')];
    expect(mergeList(server, base, base)[1].seconds).toBe(120);
  });

  it('applies deletions from both sides', () => {
    const server = [entry('a'), entry('b')]; // c deleted on the other device
    const local = [entry('b'), entry('c')]; // a deleted here
    expect(mergeList(server, local, base).map((e) => e.id)).toEqual(['b']);
  });

  it('keeps an item deleted on one side but edited on the other', () => {
    const server = [entry('a', 999), entry('b'), entry('c')];
    const local = [entry('b'), entry('c')];
    expect(mergeList(server, local, base).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('mergeData', () => {
  it('merges timers per profile and keeps local view preferences', () => {
    const base = { ...emptyData(), timers: { p1: { runningSince: null, segments: [], description: '', category: 'Other' } } };
    const server = {
      ...base,
      language: 'es' as const,
      timers: { ...base.timers, p2: { runningSince: 5, segments: [], description: 'x', category: 'Other' } },
    };
    const local = {
      ...base,
      language: 'en' as const,
      timers: { p1: { runningSince: 9, segments: [], description: 'y', category: 'Other' } },
    };
    const merged = mergeData(server, local, base);
    expect(merged.language).toBe('en');
    expect(merged.timers.p1.runningSince).toBe(9);
    expect(merged.timers.p2.runningSince).toBe(5);
  });
});
