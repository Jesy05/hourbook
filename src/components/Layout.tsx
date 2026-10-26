import { CircleAlert, Clock3, Cloud, CloudOff, FileSpreadsheet, LoaderCircle, Settings, UserPlus } from 'lucide-react';
import { useId } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { AppLogo } from './AppLogo';
import { useStore } from '../lib/store';
import { isTimerActive } from '../lib/timer';

export function Layout() {
  const { t, data, profile, setActiveProfile, storageOk, account, syncStatus } = useStore();
  const navigate = useNavigate();
  const selectId = useId();

  const links = [
    { to: '/', label: t('nav.tracker'), icon: Clock3, end: true },
    { to: '/reports', label: t('nav.reports'), icon: FileSpreadsheet, end: false },
    { to: '/settings', label: t('nav.settings'), icon: Settings, end: false },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-tomato px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('nav.skip')}
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2 rounded-lg" aria-label={t('app.name')}>
            <AppLogo size={40} />
            <span className="text-lg font-bold tracking-tight">{t('app.name')}</span>
          </NavLink>

          <nav aria-label={t('nav.main')} className="order-3 w-full sm:order-none sm:ml-6 sm:w-auto">
            <ul className="flex gap-1">
              {links.map(({ to, label, icon: Icon, end }) => (
                <li key={to} className="flex-1 sm:flex-none">
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                        isActive ? 'bg-peach text-ink' : 'text-muted hover:bg-peach-soft hover:text-ink'
                      }`
                    }
                  >
                    <Icon size={18} aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {profile && (
            <div className="ml-auto flex items-center gap-2">
              {account && <SyncBadge status={syncStatus} label={t(`sync.${syncStatus}`)} />}
              <label htmlFor={selectId} className="sr-only">
                {t('nav.profile')}
              </label>
              <select
                id={selectId}
                value={profile.id}
                onChange={(e) => {
                  if (e.target.value === '__new') navigate('/setup?new=1');
                  else setActiveProfile(e.target.value);
                }}
                className="h-10 max-w-44 rounded-xl border border-line bg-white px-3 text-sm font-semibold focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/40"
              >
                {data.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {isTimerActive(data.timers[p.id]) ? ' *' : ''}
                  </option>
                ))}
                <option value="__new">+ {t('nav.newProfile')}</option>
              </select>
              <NavLink
                to="/setup?new=1"
                className="hidden h-10 w-10 items-center justify-center rounded-xl border border-line text-muted hover:bg-peach-soft hover:text-ink sm:flex"
                aria-label={t('nav.newProfile')}
                title={t('nav.newProfile')}
              >
                <UserPlus size={18} aria-hidden="true" />
              </NavLink>
            </div>
          )}
        </div>
      </header>

      {!storageOk && (
        <div role="alert" className="border-b border-tomato bg-coral-soft">
          <p className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm text-ink sm:px-6">
            <CircleAlert size={18} className="shrink-0 text-tomato" aria-hidden="true" />
            {t('storage.failed')}
          </p>
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}

function SyncBadge({ status, label }: { status: string; label: string }) {
  const icon =
    status === 'saving' || status === 'loading' ? (
      <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
    ) : status === 'synced' ? (
      <Cloud size={18} aria-hidden="true" />
    ) : (
      <CloudOff size={18} aria-hidden="true" />
    );
  return (
    <span
      role="status"
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
        status === 'error' || status === 'offline' ? 'bg-coral-soft text-tomato' : 'text-muted'
      }`}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
