import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { newId } from './defaults';
import { translate, type MessageKey } from './i18n';
import { clearData, emptyData, loadData, saveData, STORAGE_KEY, validateData } from './storage';
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
  setTimerFields: (fields: Partial<Pick<TimerState, 'description' | 'category'>>) => void;
  saveRedeemed: (item: RedeemedEntry) => void;
  deleteRedeemed: (id: string) => void;
  saveDraft: (draft: Draft) => void;
  deleteDraft: (id: string) => void;
  replaceAll: (data: AppData) => void;
  clearAll: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData());
  const [storageOk, setStorageOk] = useState(true);
  const skipSave = useRef(false);

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
          setData(next);
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
      createdAt: now,
    }));
    const keep = total >= MIN_ENTRY_SECONDS && entries.length > 0;
    update((d) => ({
      ...d,
      entries: keep ? [...d.entries, ...entries] : d.entries,
      timers: { ...d.timers, [profileId]: { ...idleTimer(timer.category), category: timer.category } },
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
      addEntries: (entries) => update((d) => ({ ...d, entries: [...d.entries, ...entries] })),
      updateEntry: (entry) =>
        update((d) => ({ ...d, entries: d.entries.map((x) => (x.id === entry.id ? entry : x)) })),
      replaceEntry: (id, entries) =>
        update((d) => ({ ...d, entries: [...d.entries.filter((x) => x.id !== id), ...entries] })),
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
    }),
    [data, storageOk, profile, profileId, language, t, update, updateTimer, stopTimer],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
