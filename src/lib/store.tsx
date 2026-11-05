import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { newId } from './defaults';
import { addProfileValue, rememberEntryValues, renameValue, type ListField } from './fieldValues';
import { translate, type MessageKey } from './i18n';
import { api, type Session } from './api';
import { clearData, clearSyncMeta, emptyData, loadData, saveData, STORAGE_KEY, validateData } from './storage';
import { useRemoteSync, type SyncStatus } from './sync';
import { closeTimer, elapsedSeconds, idleTimer, MIN_ENTRY_SECONDS, segmentsToEntries } from './timer';
import type { AppData, Draft, Entry, Language, Profile, RedeemedEntry, TimerState } from './types';

export type StopResult =
  | { kind: 'saved'; entries: Entry[] }
  | { kind: 'discarded'; entries: Entry[] }
  | { kind: 'none' };

interface Store {
  data: AppData;
  storageOk: boolean;
  profile: Profile | null;
  language: Language;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLanguage: (language: Language) => void;
  saveProfile: (profile: Profile) => void;
  /** Saves a Requested by / Project value to the active profile's list; returns the saved spelling. */
  addFieldValue: (field: ListField, value: string) => string;
  /** Renames a value in the active profile and in every entry that uses it. */
  renameFieldValue: (field: ListField, from: string, to: string) => void;
  deleteProfile: (id: string) => void;
  setActiveProfile: (id: string) => void;
  addEntries: (entries: Entry[]) => void;
  updateEntry: (entry: Entry) => void;
  replaceEntry: (id: string, entries: Entry[]) => void;
  deleteEntry: (id: string) => void;
  timer: TimerState | undefined;
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => StopResult;
  setTimerFields: (fields: Partial<Pick<TimerState, 'description' | 'category' | 'requestedBy' | 'project' | 'custom'>>) => void;
  saveRedeemed: (item: RedeemedEntry) => void;
  deleteRedeemed: (id: string) => void;
  saveDraft: (draft: Draft) => void;
  deleteDraft: (id: string) => void;
  replaceAll: (data: AppData) => void;
  clearAll: () => void;
  /** Signed-in account, or null when running without a backend. */
  account: Session | null;
  syncStatus: SyncStatus;
  logout: () => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

/** The optional field values of a timer or entry, without empty ones. */
function entryFieldValues(source: Pick<Entry, 'requestedBy' | 'project' | 'custom'>): Pick<Entry, 'requestedBy' | 'project' | 'custom'> {
  const out: Pick<Entry, 'requestedBy' | 'project' | 'custom'> = {};
  if (source.requestedBy?.trim()) out.requestedBy = source.requestedBy.trim();
  if (source.project?.trim()) out.project = source.project.trim();
  if (source.custom && Object.keys(source.custom).length) out.custom = { ...source.custom };
  return out;
}

/**
 * New entries list, plus the profiles with any new "Requested by" or "Project"
 * values from the changed entries added to their saved lists. The changed
 * entries are stored with the saved spelling ("naima " -> "Naima").
 */
function withEntries(d: AppData, entries: Entry[], changed: Entry[]): Pick<AppData, 'entries' | 'profiles'> {
  const fixed = new Map<string, Entry>();
  const profiles = d.profiles.map((p) => {
    const mine = changed.filter((e) => e.profileId === p.id);
    if (!mine.length) return p;
    const result = rememberEntryValues(p, mine);
    result.entries.forEach((e) => fixed.set(e.id, e));
    return result.profile;
  });
  return { entries: fixed.size ? entries.map((e) => fixed.get(e.id) ?? e) : entries, profiles };
}

export function StoreProvider({
  children,
  session = null,
  onSignedOut,
  loading,
}: {
  children: ReactNode;
  session?: Session | null;
  onSignedOut?: () => void;
  /** Shown until the first sync with the server finishes. */
  loading?: ReactNode;
}) {
  const [data, setData] = useState<AppData>(() => loadData());
  const [storageOk, setStorageOk] = useState(true);
  const skipSave = useRef(false);

  const signedOut = useCallback(() => {
    clearData();
    clearSyncMeta();
    onSignedOut?.();
  }, [onSignedOut]);
  const sync = useRemoteSync({ session, data, applyRemote: setData, onUnauthorized: signedOut });
  const adoptExternal = useRef(sync.adoptExternal);
  adoptExternal.current = sync.adoptExternal;

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setStorageOk(saveData(data));
  }, [data]);

  // Keep several open tabs in sync, so a timer started in one shows in the other.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      try {
        const next = event.newValue ? validateData(JSON.parse(event.newValue)) : emptyData();
        if (next) {
          skipSave.current = true;
          adoptExternal.current(next);
        }
      } catch {
        /* ignore malformed updates */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const profile = data.profiles.find((p) => p.id === data.activeProfileId) ?? data.profiles[0] ?? null;
  const profileId = profile?.id ?? '';
  const language = data.language;

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const update = useCallback((fn: (draft: AppData) => AppData) => setData((prev) => fn(prev)), []);

  const updateTimer = useCallback(
    (fn: (timer: TimerState) => TimerState) =>
      update((d) => {
        const p = d.profiles.find((x) => x.id === profileId);
        if (!p) return d;
        const current = d.timers[profileId] ?? idleTimer(p.categories[0] ?? '');
        return { ...d, timers: { ...d.timers, [profileId]: fn(current) } };
      }),
    [update, profileId],
  );

  const stopTimer = useCallback((): StopResult => {
    const p = data.profiles.find((x) => x.id === profileId);
    const timer = data.timers[profileId];
    if (!p || !timer) return { kind: 'none' };
    const now = Date.now();
    const total = elapsedSeconds(timer, now);
    const pending = segmentsToEntries(closeTimer(timer, now), p.timeZone);
    const entries: Entry[] = pending.map((e) => ({
      id: newId(),
      profileId,
      date: e.date,
      start: e.start,
      end: e.end,
      seconds: e.seconds,
      description: timer.description.trim(),
      category: timer.category,
      ...entryFieldValues(timer),
      createdAt: now,
    }));
    const keep = total >= MIN_ENTRY_SECONDS && entries.length > 0;
    update((d) => ({
      ...d,
      ...(keep ? withEntries(d, [...d.entries, ...entries], entries) : {}),
      // Only the description is cleared: the next task is often for the same person and project.
      timers: {
        ...d.timers,
        [profileId]: { ...idleTimer(timer.category), requestedBy: timer.requestedBy, project: timer.project, custom: timer.custom },
      },
    }));
    if (entries.length === 0) return { kind: 'none' };
    return keep ? { kind: 'saved', entries } : { kind: 'discarded', entries };
  }, [data, profileId, update]);

  const store = useMemo<Store>(
    () => ({
      data,
      storageOk,
      profile,
      language,
      t,
      setLanguage: (lang) => update((d) => ({ ...d, language: lang })),
      saveProfile: (p) =>
        update((d) => {
          const exists = d.profiles.some((x) => x.id === p.id);
          return {
            ...d,
            profiles: exists ? d.profiles.map((x) => (x.id === p.id ? p : x)) : [...d.profiles, p],
            activeProfileId: exists ? d.activeProfileId : p.id,
          };
        }),
      addFieldValue: (field, value) => {
        const current = data.profiles.find((x) => x.id === profileId);
        const saved = current ? addProfileValue(current, field, value).value : value.trim();
        update((d) => ({
          ...d,
          profiles: d.profiles.map((x) => (x.id === profileId ? addProfileValue(x, field, value).profile : x)),
        }));
        return saved;
      },
      renameFieldValue: (field, from, to) => update((d) => renameValue(d, profileId, field, from, to)),
      deleteProfile: (id) =>
        update((d) => {
          const profiles = d.profiles.filter((x) => x.id !== id);
          const timers = { ...d.timers };
          delete timers[id];
          return {
            ...d,
            profiles,
            activeProfileId: d.activeProfileId === id ? (profiles[0]?.id ?? null) : d.activeProfileId,
            entries: d.entries.filter((x) => x.profileId !== id),
            redeemed: d.redeemed.filter((x) => x.profileId !== id),
            drafts: d.drafts.filter((x) => x.profileId !== id),
            timers,
          };
        }),
      setActiveProfile: (id) => update((d) => ({ ...d, activeProfileId: id })),
      addEntries: (entries) => update((d) => ({ ...d, ...withEntries(d, [...d.entries, ...entries], entries) })),
      updateEntry: (entry) =>
        update((d) => ({ ...d, ...withEntries(d, d.entries.map((x) => (x.id === entry.id ? entry : x)), [entry]) })),
      replaceEntry: (id, entries) =>
        update((d) => ({ ...d, ...withEntries(d, [...d.entries.filter((x) => x.id !== id), ...entries], entries) })),
      deleteEntry: (id) => update((d) => ({ ...d, entries: d.entries.filter((x) => x.id !== id) })),
      timer: data.timers[profileId],
      startTimer: () =>
        updateTimer((tm) => ({ ...tm, runningSince: Date.now(), segments: [] })),
      pauseTimer: () =>
        updateTimer((tm) =>
          tm.runningSince === null
            ? tm
            : { ...tm, runningSince: null, segments: [...tm.segments, { start: tm.runningSince, end: Date.now() }] },
        ),
      resumeTimer: () => updateTimer((tm) => (tm.runningSince !== null ? tm : { ...tm, runningSince: Date.now() })),
      stopTimer,
      setTimerFields: (fields) => updateTimer((tm) => ({ ...tm, ...fields })),
      saveRedeemed: (item) =>
        update((d) => {
          const exists = d.redeemed.some((x) => x.id === item.id);
          return {
            ...d,
            redeemed: exists ? d.redeemed.map((x) => (x.id === item.id ? item : x)) : [...d.redeemed, item],
          };
        }),
      deleteRedeemed: (id) => update((d) => ({ ...d, redeemed: d.redeemed.filter((x) => x.id !== id) })),
      saveDraft: (draft) =>
        update((d) => {
          const exists = d.drafts.some((x) => x.id === draft.id);
          return { ...d, drafts: exists ? d.drafts.map((x) => (x.id === draft.id ? draft : x)) : [...d.drafts, draft] };
        }),
      deleteDraft: (id) => update((d) => ({ ...d, drafts: d.drafts.filter((x) => x.id !== id) })),
      replaceAll: (next) => setData(next),
      clearAll: () => {
        clearData();
        setData({ ...emptyData(), language: data.language });
      },
      account: session,
      syncStatus: sync.status,
      logout: async () => {
        try {
          await sync.flush();
          await api.logout();
        } catch {
          /* sign out locally even if the server is unreachable */
        }
        signedOut();
      },
    }),
    [data, storageOk, profile, profileId, language, t, update, updateTimer, stopTimer, session, sync, signedOut],
  );

  if (!sync.ready) return <>{loading ?? null}</>;

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
