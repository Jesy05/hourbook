import { linesForDraft } from './drafts';
import type { AppData, Entry, InvoiceDraft, InvoiceTemplate, Profile, TimesheetRow } from './types';

/*
 * Saved values for the "Requested by" and "Project" fields: matching that
 * ignores case and extra spaces, ordering (pinned, then recently used, then
 * A-Z), and rename / remove across the profile's entries.
 */

export type ListField = 'requestedBy' | 'project';
export const LIST_FIELDS: ListField[] = ['requestedBy', 'project'];

const LIST_KEY = { requestedBy: 'requesters', project: 'projects' } as const;
const PIN_KEY = { requestedBy: 'pinnedRequesters', project: 'pinnedProjects' } as const;

export function savedValues(profile: Profile, field: ListField): string[] {
  return profile[LIST_KEY[field]];
}

export function pinnedValues(profile: Profile, field: ListField): string[] {
  return profile[PIN_KEY[field]];
}

/** Trims and collapses inner spaces: "  Naima   W " -> "Naima W". */
export function cleanValue(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

/** Comparison key: "naima", "Naima" and "Naima " are the same value. */
export function valueKey(value: string | undefined): string {
  return cleanValue(value).toLowerCase();
}

/** The saved spelling of a value, if it is in the list. */
export function findValue(list: string[], value: string | undefined): string | undefined {
  const key = valueKey(value);
  return key ? list.find((v) => valueKey(v) === key) : undefined;
}

/** The value as it should be stored: the saved spelling, or the cleaned text. */
export function canonicalValue(list: string[], value: string | undefined): string {
  return findValue(list, value) ?? cleanValue(value);
}

/** Adds a value unless it is already there (ignoring case and spaces). */
export function addValue(list: string[], value: string | undefined): { list: string[]; value: string } {
  const existing = findValue(list, value);
  if (existing !== undefined) return { list, value: existing };
  const clean = cleanValue(value);
  return clean ? { list: [...list, clean], value: clean } : { list, value: '' };
}

/** Removes duplicates and blanks, keeping the first spelling. */
export function dedupeValues(list: string[]): string[] {
  return list.reduce<string[]>((out, v) => addValue(out, v).list, []);
}

/** Latest use of each value (by key) in the profile's entries: date first, then creation time. */
export function lastUsed(entries: Entry[], profileId: string, field: ListField): Map<string, [string, number]> {
  const used = new Map<string, [string, number]>();
  for (const e of entries) {
    if (e.profileId !== profileId) continue;
    const key = valueKey(e[field]);
    if (!key) continue;
    const prev = used.get(key);
    if (!prev || e.date > prev[0] || (e.date === prev[0] && e.createdAt > prev[1])) used.set(key, [e.date, e.createdAt]);
  }
  return used;
}

/** Order for suggestions: pinned (in their order), then most recently used, then A-Z. */
export function orderValues(list: string[], pinned: string[], used: Map<string, [string, number]>): string[] {
  const pinnedKeys = pinned.map(valueKey);
  const isPinned = (v: string) => pinnedKeys.includes(valueKey(v));
  const top = pinned.map((p) => findValue(list, p)).filter((v): v is string => v !== undefined);
  const rest = list.filter((v) => !isPinned(v));
  rest.sort((a, b) => {
    const ua = used.get(valueKey(a));
    const ub = used.get(valueKey(b));
    if (ua && ub) {
      if (ua[0] !== ub[0]) return ua[0] < ub[0] ? 1 : -1;
      if (ua[1] !== ub[1]) return ub[1] - ua[1];
    } else if (ua || ub) {
      return ua ? -1 : 1;
    }
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
  return [...top, ...rest];
}

export function suggestions(profile: Profile, entries: Entry[], field: ListField): string[] {
  return orderValues(savedValues(profile, field), pinnedValues(profile, field), lastUsed(entries, profile.id, field));
}

/** Entries of the profile that use a value. */
export function countUses(entries: Entry[], profileId: string, field: ListField, value: string): number {
  const key = valueKey(value);
  return entries.filter((e) => e.profileId === profileId && valueKey(e[field]) === key).length;
}

export function addProfileValue(profile: Profile, field: ListField, value: string): { profile: Profile; value: string } {
  const { list, value: saved } = addValue(savedValues(profile, field), value);
  return { profile: list === savedValues(profile, field) ? profile : { ...profile, [LIST_KEY[field]]: list }, value: saved };
}

/** Removes a value from the suggestions only; entries keep it. */
export function removeProfileValue(profile: Profile, field: ListField, value: string): Profile {
  const key = valueKey(value);
  return {
    ...profile,
    [LIST_KEY[field]]: savedValues(profile, field).filter((v) => valueKey(v) !== key),
    [PIN_KEY[field]]: pinnedValues(profile, field).filter((v) => valueKey(v) !== key),
  };
}

/** Pins or unpins a value; pinned values are listed first, in pin order. */
export function togglePinned(profile: Profile, field: ListField, value: string): Profile {
  const key = valueKey(value);
  const pinned = pinnedValues(profile, field);
  const next = pinned.some((v) => valueKey(v) === key) ? pinned.filter((v) => valueKey(v) !== key) : [...pinned, value];
  return { ...profile, [PIN_KEY[field]]: next };
}

/** Moves a pinned value up or down. */
export function movePinned(profile: Profile, field: ListField, value: string, delta: number): Profile {
  const pinned = [...pinnedValues(profile, field)];
  const from = pinned.findIndex((v) => valueKey(v) === valueKey(value));
  const to = from + delta;
  if (from < 0 || to < 0 || to >= pinned.length) return profile;
  const [item] = pinned.splice(from, 1);
  pinned.splice(to, 0, item);
  return { ...profile, [PIN_KEY[field]]: pinned };
}

/** Adds the values used by these entries to the saved lists and stores them with the saved spelling. */
export function rememberEntryValues(profile: Profile, entries: Entry[]): { profile: Profile; entries: Entry[] } {
  let next = profile;
  const out = entries.map((entry) => {
    if (entry.profileId !== profile.id) return entry;
    let e = entry;
    for (const field of LIST_FIELDS) {
      if (!cleanValue(e[field])) {
        if (e[field] !== undefined) {
          e = { ...e };
          delete e[field];
        }
        continue;
      }
      const added = addProfileValue(next, field, e[field] ?? '');
      next = added.profile;
      if (added.value !== e[field]) e = { ...e, [field]: added.value };
    }
    return e;
  });
  return { profile: next, entries: out };
}

/**
 * Renames a value everywhere in one profile: the saved list, pins, every entry,
 * the timer and the timesheets of invoice drafts. Renaming to a value that
 * already exists merges the two.
 */
export function renameValue(data: AppData, profileId: string, field: ListField, from: string, to: string): AppData {
  const fromKey = valueKey(from);
  const profile = data.profiles.find((p) => p.id === profileId);
  const target = cleanValue(to);
  if (!profile || !fromKey || !target) return data;
  const existing = findValue(savedValues(profile, field), target);
  const value = existing && valueKey(existing) !== fromKey ? existing : target;
  const swap = (v: string | undefined) => (valueKey(v) === fromKey ? value : v);
  const swapList = (list: string[]) => dedupeValues(list.map((v) => swap(v) ?? v));

  const profiles = data.profiles.map((p) =>
    p.id === profileId
      ? {
          ...p,
          // The old value may have been removed from suggestions; the new one is saved either way.
          [LIST_KEY[field]]: swapList(addValue(savedValues(p, field), from).list),
          [PIN_KEY[field]]: swapList(pinnedValues(p, field)),
        }
      : p,
  );
  const entries = data.entries.map((e) => (e.profileId === profileId && valueKey(e[field]) === fromKey ? { ...e, [field]: value } : e));
  const timer = data.timers[profileId];
  const timers = timer && valueKey(timer[field]) === fromKey ? { ...data.timers, [profileId]: { ...timer, [field]: value } } : data.timers;
  const drafts = data.drafts.map((d) => {
    if (d.type !== 'invoice' || d.profileId !== profileId || !d.timesheet.some((r) => valueKey(r[field]) === fromKey)) return d;
    const next = { ...d, timesheet: d.timesheet.map((r) => (valueKey(r[field]) === fromKey ? { ...r, [field]: value } : r)) } as InvoiceDraft;
    // Lines that follow the timesheet show the new name too; hand-edited lines are left alone.
    const owner = profiles.find((p) => p.id === profileId);
    return next.linesManual || !owner ? next : { ...next, lines: linesForDraft(next, owner) };
  });
  return { ...data, profiles, entries, timers, drafts };
}

/** The fields a template needs from each entry: through its grouping or its description. */
export function templateListFields(template: InvoiceTemplate): ListField[] {
  return LIST_FIELDS.filter((f) => template.groupBy.includes(f) || template.descriptionTemplate.includes(`{${f}}`));
}

export interface MissingField {
  field: ListField;
  /** Dates of the rows without a value, sorted and without repeats. */
  dates: string[];
  rowIds: string[];
}

/** Rows that leave a template field empty; shown as a warning, never blocks the export. */
export function missingTemplateFields(template: InvoiceTemplate, rows: TimesheetRow[]): MissingField[] {
  return templateListFields(template)
    .map((field) => {
      const empty = rows.filter((r) => !cleanValue(r[field]));
      return { field, rowIds: empty.map((r) => r.id), dates: [...new Set(empty.map((r) => r.date))].sort() };
    })
    .filter((m) => m.rowIds.length > 0);
}
