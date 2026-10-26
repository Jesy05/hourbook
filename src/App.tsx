import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { api, ApiError, type Session } from './lib/api';
import { loadSyncMeta } from './lib/storage';
import { useStore, StoreProvider } from './lib/store';
import { AuthScreen, LoadingScreen } from './pages/Auth';
import { ReportEditor } from './pages/ReportEditor';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';
import { Tracker } from './pages/Tracker';

function AppRoutes() {
  const { data } = useStore();
  const hasProfile = data.profiles.length > 0;
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      {hasProfile ? (
        <Route element={<Layout />}>
          <Route index element={<Tracker />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:draftId" element={<ReportEditor />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/setup" replace />} />
      )}
    </Routes>
  );
}

/**
 * local:  no backend configured (or none reachable on a fresh device), data stays in this browser.
 * anon:   backend available, sign in first.
 * authed: signed in, data syncs with the server.
 */
type AuthState = { status: 'checking' } | { status: 'local' } | { status: 'anon' } | { status: 'authed'; session: Session };

function useAuthState(): [AuthState, (state: AuthState) => void] {
  const [state, setState] = useState<AuthState>({ status: 'checking' });
  useEffect(() => {
    api
      .me()
      .then((session) => setState({ status: 'authed', session }))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) return setState({ status: 'anon' });
        if (error instanceof ApiError && error.status !== 503 && error.status !== 404) return setState({ status: 'anon' });
        // Offline on a device that was already signed in: keep working and sync later.
        const known = loadSyncMeta();
        if (!(error instanceof ApiError) && known) {
          return setState({ status: 'authed', session: { userId: known.userId, email: known.email } });
        }
        setState({ status: 'local' });
      });
  }, []);
  return [state, setState];
}

export function App() {
  const [auth, setAuth] = useAuthState();

  if (auth.status === 'checking') return <LoadingScreen />;
  if (auth.status === 'anon') return <AuthScreen onSignedIn={(session) => setAuth({ status: 'authed', session })} />;

  const session = auth.status === 'authed' ? auth.session : null;
  return (
    <StoreProvider
      key={session?.userId ?? 'local'}
      session={session}
      onSignedOut={() => setAuth({ status: 'anon' })}
      loading={<LoadingScreen />}
    >
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </StoreProvider>
  );
}
