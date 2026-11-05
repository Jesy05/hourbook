import { describe, expect, it } from 'vitest';
import { defaultTemplates, newProfile } from './defaults';
import { entryToRow, patchRow, rowToEntry } from './drafts';
import {
  addProfileValue,
  addValue,
  countUses,
  lastUsed,
  missingTemplateFields,
  movePinned,
  orderValues,
  rememberEntryValues,
  removeProfileValue,
  renameValue,
  togglePinned,
} from './fieldValues';
import { emptyData } from './storage';
import type { AppData, Entry, InvoiceDraft, Profile } from './types';

const profile = (patch: Partial<Profile> = {}): Profile => ({ ...newProfile(), id: 'p1', name: 'Jesy', ...patch });

const entry = (id: string, date: string, requestedBy?: string, project?: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  profileId: 'p1',
  date,
  start: '09:00:00',
  end: '10:00:00',
  seconds: 3600,
  description: id,
  category: 'Other',
  ...(requestedBy !== undefined ? { requestedBy } : {}),
  ...(project !== undefined ? { project } : {}),
  createdAt: 0,
  ...extra,
});

describe('adding values', () => {
  it('saves a new value and returns it cleaned', () => {
    expect(addValue(['Naima'], '  Jaimie   W ')).toEqual({ list: ['Naima', 'Jaimie W'], value: 'Jaimie W' });
  });

  it('treats values that differ only in case or spaces as the same', () => {
    for (const typed of ['naima', 'Naima ', ' NAIMA', 'Naima']) {
      expect(addValue(['Naima'], typed)).toEqual({ list: ['Naima'], value: 'Naima' });
    }
    const { profile: p, value } = addProfileValue(profile({ requesters: ['Naima'] }), 'requestedBy', 'naima ');
    expect(value).toBe('Naima');
    expect(p.requesters).toEqual(['Naima']);
  });

  it('ignores blanks', () => {
    expect(addValue(['Naima'], '   ')).toEqual({ list: ['Naima'], value: '' });
  });

  it('saves new values when an entry is saved, with the saved spelling', () => {
    const p = profile({ requesters: ['Naima'] });
    const result = rememberEntryValues(p, [entry('a', '2026-10-29', 'naima ', 'NYC Glamsquad event (Nov 2)'), entry('b', '2026-10-29', '  ', '')]);
    expect(result.profile.requesters).toEqual(['Naima']);
    expect(result.profile.projects).toEqual(['NYC Glamsquad event (Nov 2)']);
    expect(result.entries[0]).toMatchObject({ requestedBy: 'Naima', project: 'NYC Glamsquad event (Nov 2)' });
    expect(result.entries[1]).not.toHaveProperty('requestedBy');
    expect(result.entries[1]).not.toHaveProperty('project');
  });
});

describe('ordering suggestions', () => {
  it('lists pinned first, then most recently used, then A-Z', () => {
    const entries = [
      entry('a', '2026-10-01', 'Zoe'),
      entry('b', '2026-10-20', 'Mia'),
      entry('c', '2026-10-20', 'Ana', undefined, { createdAt: 5 }),
    ];
    const used = lastUsed(entries, 'p1', 'requestedBy');
    expect(orderValues(['beto', 'Zoe', 'Mia', 'Ana', 'Carla', 'Naima'], ['Naima'], used)).toEqual(['Naima', 'Ana', 'Mia', 'Zoe', 'beto', 'Carla']);
  });

  it('pins, unpins and reorders favorites', () => {
    let p = profile({ requesters: ['A', 'B', 'C'] });
    p = togglePinned(togglePinned(p, 'requestedBy', 'A'), 'requestedBy', 'C');
    expect(p.pinnedRequesters).toEqual(['A', 'C']);
    p = movePinned(p, 'requestedBy', 'C', -1);
    expect(p.pinnedRequesters).toEqual(['C', 'A']);
    expect(togglePinned(p, 'requestedBy', 'c').pinnedRequesters).toEqual(['A']);
  });
});

describe('renaming and deleting values', () => {
  const data = (): AppData => {
    const draft = {
      id: 'd1',
      profileId: 'p1',
      type: 'invoice',
      timesheet: [entryToRow(entry('a', '2026-10-29', 'naima', 'NYC'))],
    } as unknown as InvoiceDraft;
    return {
      ...emptyData(),
      profiles: [profile({ requesters: ['Naima', 'Jaimie'], pinnedRequesters: ['Naima'] }), { ...profile(), id: 'p2', requesters: ['Naima'] }],
      entries: [
        entry('a', '2026-10-29', 'naima', 'NYC'),
        entry('b', '2026-10-30', 'Naima'),
        entry('c', '2026-10-30', 'Jaimie'),
        entry('x', '2026-10-30', 'Naima', undefined, { profileId: 'p2' }),
      ],
      drafts: [draft],
      timers: { p1: { runningSince: null, segments: [], description: '', category: 'Other', requestedBy: 'Naima' } },
    };
  };

  it('renaming updates every entry of the profile that uses it', () => {
    const next = renameValue(data(), 'p1', 'requestedBy', 'Naima', 'Naima W.');
    expect(next.entries.map((e) => [e.id, e.requestedBy])).toEqual([
      ['a', 'Naima W.'],
      ['b', 'Naima W.'],
      ['c', 'Jaimie'],
      ['x', 'Naima'], // other profiles are not touched
    ]);
    expect(next.profiles[0]).toMatchObject({ requesters: ['Naima W.', 'Jaimie'], pinnedRequesters: ['Naima W.'] });
    expect(next.timers.p1.requestedBy).toBe('Naima W.');
    expect((next.drafts[0] as InvoiceDraft).timesheet[0].requestedBy).toBe('Naima W.');
  });

  it('renaming onto an existing value merges the two', () => {
    const next = renameValue(data(), 'p1', 'requestedBy', 'Jaimie', 'naima');
    expect(next.profiles[0].requesters).toEqual(['Naima']);
    expect(countUses(next.entries, 'p1', 'requestedBy', 'Naima')).toBe(3);
  });

  it('deleting only removes the suggestion; entries keep their value', () => {
    const before = data();
    const p = removeProfileValue(before.profiles[0], 'requestedBy', 'naima');
    expect(p.requesters).toEqual(['Jaimie']);
    expect(p.pinnedRequesters).toEqual([]);
    expect(before.entries.map((e) => e.requestedBy)).toEqual(['naima', 'Naima', 'Jaimie', 'Naima']);
  });
});

describe('timesheet edits', () => {
  it('an edit in the timesheet is saved to the matching entry', () => {
    const original = entry('a', '2026-10-29', undefined, undefined, { start: '07:00:28', end: '11:11:19', seconds: 15051 });
    const row = patchRow(entryToRow(original), { requestedBy: 'Naima', project: 'NYC Glamsquad event (Nov 2)' });
    expect(row.entryId).toBe('a');
    expect(rowToEntry(row, original)).toEqual({ ...original, requestedBy: 'Naima', project: 'NYC Glamsquad event (Nov 2)' });
  });
});

describe('missing template fields', () => {
  const [byCategory, daily] = defaultTemplates();
  const rows = [
    entry('a', '2026-10-29', 'Naima', 'NYC'),
    entry('b', '2026-10-30', '', 'NYC'),
    entry('c', '2026-10-28'),
    entry('d', '2026-10-30'),
  ].map((e) => ({ ...entryToRow(e), id: e.id }));

  it('warns with the dates of rows missing a field the template uses', () => {
    expect(missingTemplateFields(daily, rows)).toEqual([
      { field: 'requestedBy', dates: ['2026-10-28', '2026-10-30'], rowIds: ['b', 'c', 'd'] },
      { field: 'project', dates: ['2026-10-28', '2026-10-30'], rowIds: ['c', 'd'] },
    ]);
  });

  it('says nothing when the template does not use them or every row has them', () => {
    expect(missingTemplateFields(byCategory, rows)).toEqual([]);
    expect(missingTemplateFields(daily, rows.slice(0, 1))).toEqual([]);
    expect(missingTemplateFields({ ...byCategory, descriptionTemplate: '{project}: {hours} h' }, rows).map((m) => m.field)).toEqual(['project']);
  });
});
