import type { AppData } from './types';

/*
 * All persistence goes through this module. Data lives in localStorage under a
 * single key with a schema version so future changes can migrate old data.
 */

export const STORAGE_KEY = 'hourbook:data';
export const SCHEMA_VERSION = 1;

export function emptyData(): AppData {
  return {
    version: SCHEMA_VERSION,
    language: 'es',
    activeProfileId: null,
    profiles: [],
    entries: [],
    redeemed: [],
    drafts: [],
    timers: {},
  };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = validateData(JSON.parse(raw));
    return parsed ?? emptyData();
  } catch {
    return emptyData();
  }
}

/** Returns false when the browser refused to save (private mode, quota, blocked). */
export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Upgrades older schemas to the current one. */
function migrate(data: Record<string, unknown>): Record<string, unknown> {
  const version = typeof data.version === 'number' ? data.version : 0;
  if (version < 1) {
    data = { ...emptyData(), ...data, version: 1 };
  }
  return data;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks the overall shape of stored or imported data. Returns null if it is not usable. */
export function validateData(input: unknown): AppData | null {
  if (!isObject(input)) return null;
  const data = migrate(input);
  if (typeof data.version !== 'number' || data.version > SCHEMA_VERSION) return null;
  const arrays = ['profiles', 'entries', 'redeemed', 'drafts'] as const;
  for (const key of arrays) {
    if (!Array.isArray(data[key])) return null;
  }
  const profiles = data.profiles as unknown[];
  if (!profiles.every((p) => isObject(p) && typeof p.id === 'string' && typeof p.name === 'string')) {
    return null;
  }
  const entries = data.entries as unknown[];
  if (
    !entries.every(
      (e) => isObject(e) && typeof e.id === 'string' && typeof e.date === 'string' && typeof e.seconds === 'number',
    )
  ) {
    return null;
  }
  return {
    version: SCHEMA_VERSION,
    language: data.language === 'en' ? 'en' : 'es',
    activeProfileId: typeof data.activeProfileId === 'string' ? data.activeProfileId : null,
    profiles: data.profiles as AppData['profiles'],
    entries: data.entries as AppData['entries'],
    redeemed: data.redeemed as AppData['redeemed'],
    drafts: data.drafts as AppData['drafts'],
    timers: isObject(data.timers) ? (data.timers as AppData['timers']) : {},
  };
}

export function backupFileContent(data: AppData): string {
  return JSON.stringify({ app: 'hourbook', exportedAt: new Date().toISOString(), ...data }, null, 2);
}

export function parseBackup(text: string): AppData | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed) && 'app' in parsed && parsed.app !== 'hourbook') return null;
    return validateData(parsed);
  } catch {
    return null;
  }
}
