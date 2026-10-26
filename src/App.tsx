import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { useStore, StoreProvider } from './lib/store';
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

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </StoreProvider>
  );
}
