import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type Session } from './api';
import { mergeData } from './merge';
import { emptyData, loadSyncMeta, saveSyncMeta, validateData, type SyncMeta } from './storage';
import type { AppData } from './types';

/*
 * Keeps the local copy (localStorage) and the server copy (Neon) in step.
 * Local changes are pushed after a short pause; if another device saved in
 * between, the two versions are merged and pushed again. When the tab comes
 * back into view, newer server data is pulled in.
 */

export type SyncStatus = 'loading' | 'synced' | 'saving' | 'offline' | 'error';

const PUSH_DELAY = 1000;
const RETRY_DELAY = 15000;
const POLL_INTERVAL = 60000;

function isNetworkError(error: unknown): boolean {
  return !(error instanceof ApiError);
}

export function useRemoteSync({
  session,
  data,
  applyRemote,
  onUnauthorized,
}: {
  session: Session | null;
  data: AppData;
  /** Replaces app state with data that came from the server (it is not pushed back). */
  applyRemote: (data: AppData) => void;
  onUnauthorized: () => void;
}): {
  ready: boolean;
  status: SyncStatus;
  flush: () => Promise<void>;
  adoptExternal: (data: AppData) => void;
} {
  const [ready, setReady] = useState(!session);
  const [status, setStatus] = useState<SyncStatus>(session ? 'loading' : 'synced');
  const meta = useRef<SyncMeta | null>(null);
  const dataRef = useRef(data);
  const applied = useRef<AppData | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  dataRef.current = data;

  const setMeta = (next: SyncMeta) => {
    meta.current = next;
    saveSyncMeta(next);
  };

  const apply = useCallback(
    (next: AppData) => {
      applied.current = next;
      applyRemote(next);
    },
    [applyRemote],
  );

  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) onUnauthorized();
      else setStatus(isNetworkError(error) ? 'offline' : 'error');
    },
    [onUnauthorized],
  );

  const schedule = useCallback((delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void pushRef.current(), delay);
  }, []);

  const push = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const m = meta.current;
    if (!m || !m.dirty) return;
    const snapshot = dataRef.current;
    setStatus('saving');
    const run = (async () => {
      try {
        const { version } = await api.putData(snapshot, m.version);
        const stillDirty = dataRef.current !== snapshot;
        setMeta({ ...m, version, base: snapshot, dirty: stillDirty });
        setStatus(stillDirty ? 'saving' : 'synced');
        if (stillDirty) schedule(PUSH_DELAY);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const server = validateData(error.body.data) ?? emptyData();
          const merged = mergeData(server, dataRef.current, m.base);
          setMeta({ ...m, version: Number(error.body.version) || 0, base: server, dirty: true });
          apply(merged);
          schedule(0);
        } else {
          fail(error);
          if (isNetworkError(error)) schedule(RETRY_DELAY);
        }
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [apply, fail, schedule]);

  const pushRef = useRef(push);
  pushRef.current = push;

  // First load after signing in: reconcile the local copy with the server.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setReady(false);
    setStatus('loading');
    (async () => {
      const known = loadSyncMeta();
      const mine = known?.userId === session.userId ? known : null;
      try {
        const res = await api.getData();
        if (cancelled) return;
        const server = res.version > 0 ? validateData(res.data) : null;
        const local = dataRef.current;
        if (!server) {
          // Nothing saved online yet. Upload this browser's data if it is ours, or
          // if it predates accounts (no sync record at all).
          const upload = (mine || !known) && local.profiles.length > 0;
          if (upload) {
            setMeta({ userId: session.userId, email: session.email, version: res.version, base: emptyData(), dirty: true });
            await pushRef.current();
          } else {
            const fresh = { ...emptyData(), language: local.language };
            setMeta({ userId: session.userId, email: session.email, version: res.version, base: fresh, dirty: false });
            apply(fresh);
            setStatus('synced');
          }
        } else if (mine?.dirty) {
          const merged = mergeData(server, local, mine.base);
          setMeta({ ...mine, email: session.email, version: res.version, base: server, dirty: true });
          apply(merged);
          schedule(0);
        } else {
          setMeta({ userId: session.userId, email: session.email, version: res.version, base: server, dirty: false });
          apply({ ...server, language: mine ? server.language : local.language });
          setStatus('synced');
        }
      } catch (error) {
        if (cancelled) return;
        // Offline with a known account: keep working on the local copy and retry later.
        if (mine && isNetworkError(error)) {
          meta.current = mine;
          setStatus('offline');
          if (mine.dirty) schedule(RETRY_DELAY);
        } else {
          fail(error);
        }
      }
      if (!cancelled) {
        if (applied.current === null) applied.current = dataRef.current;
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [session, apply, fail, schedule]);

  // Local edits: mark dirty and push after a short pause.
  useEffect(() => {
    if (!session || !ready || !meta.current) return;
    if (data === applied.current) return;
    if (!meta.current.dirty) setMeta({ ...meta.current, dirty: true });
    setStatus('saving');
    schedule(PUSH_DELAY);
  }, [data, session, ready, schedule]);

  // Pull newer data from other devices when the tab is visible.
  useEffect(() => {
    if (!session || !ready) return;
    const pull = async () => {
      const m = meta.current;
      if (document.visibilityState !== 'visible' || !m || m.dirty || inFlight.current) return;
      try {
        const res = await api.getData();
        const server = res.version > m.version ? validateData(res.data) : null;
        if (server && !meta.current?.dirty) {
          setMeta({ ...m, version: res.version, base: server, dirty: false });
          apply(server);
        }
        setStatus('synced');
      } catch (error) {
        fail(error);
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (meta.current?.dirty) schedule(0);
      else void pull();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    const interval = window.setInterval(() => void pull(), POLL_INTERVAL);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.clearInterval(interval);
    };
  }, [session, ready, apply, fail, schedule]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (meta.current?.dirty) await push();
  }, [push]);

  /** Data another tab already saved (and synced): show it without pushing it again. */
  const adoptExternal = useCallback(
    (next: AppData) => {
      apply(next);
      const known = loadSyncMeta();
      if (known && known.userId === meta.current?.userId) meta.current = known;
    },
    [apply],
  );

  return { ready, status, flush, adoptExternal };
}
