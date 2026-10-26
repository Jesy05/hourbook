import type { AppData } from './types';

/*
 * Three-way merge used when another device saved first. `base` is the last
 * copy both sides agreed on. Per item: a local change wins, otherwise the
 * server copy is kept; deletions on either side stick unless the other side
 * changed that same item.
 */

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function mergeList<T extends { id: string }>(server: T[], local: T[], base: T[]): T[] {
  const baseMap = new Map(base.map((x) => [x.id, x]));
  const localMap = new Map(local.map((x) => [x.id, x]));
  const serverIds = new Set(server.map((x) => x.id));
  const out: T[] = [];
  for (const s of server) {
    const l = localMap.get(s.id);
    const b = baseMap.get(s.id);
    if (l) out.push(b && same(l, b) ? s : l);
    else if (!b || !same(s, b)) out.push(s);
  }
  for (const l of local) {
    if (serverIds.has(l.id)) continue;
    const b = baseMap.get(l.id);
    if (b && same(l, b)) continue;
    out.push(l);
  }
  return out;
}

function mergeRecord<T>(server: Record<string, T>, local: Record<string, T>, base: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  const keys = new Set([...Object.keys(server), ...Object.keys(local), ...Object.keys(base)]);
  for (const key of keys) {
    const localChanged = !same(local[key], base[key]);
    const value = localChanged ? local[key] : server[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function mergeData(server: AppData, local: AppData, base: AppData): AppData {
  return {
    ...server,
    language: local.language,
    activeProfileId: local.activeProfileId,
    profiles: mergeList(server.profiles, local.profiles, base.profiles),
    entries: mergeList(server.entries, local.entries, base.entries),
    redeemed: mergeList(server.redeemed, local.redeemed, base.redeemed),
    drafts: mergeList(server.drafts, local.drafts, base.drafts),
    timers: mergeRecord(server.timers, local.timers, base.timers),
  };
}
