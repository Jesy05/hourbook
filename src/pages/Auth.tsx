import { Languages, LoaderCircle, LogIn, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AppLogo } from '../components/AppLogo';
import { Button, Field, TextInput } from '../components/ui';
import { api, ApiError, type Session } from '../lib/api';
import { translate, type MessageKey } from '../lib/i18n';
import { loadData } from '../lib/storage';
import type { Language } from '../lib/types';

const ERRORS: Record<string, MessageKey> = {
  invalid_credentials: 'auth.errorCredentials',
  invalid_email: 'auth.errorEmail',
  weak_password: 'auth.errorPassword',
  email_taken: 'auth.errorTaken',
  not_allowed: 'auth.errorNotAllowed',
  locked: 'auth.errorLocked',
};

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-muted">
        <AppLogo size={64} />
        <LoaderCircle size={22} className="animate-spin text-tomato" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}

export function AuthScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [language, setLanguage] = useState<Language>(() => loadData().language);
  const t = (key: MessageKey) => translate(language, key);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (mode === 'register' && password.length < 8) {
      setError(t('auth.errorPassword'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await api.login(email, password, remember);
      else await api.register(email, password, remember);
      onSignedIn(await api.me());
    } catch (e) {
      const key = e instanceof ApiError ? ERRORS[e.code] : undefined;
      setError(t(key ?? (e instanceof ApiError ? 'auth.errorServer' : 'auth.errorNetwork')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas px-4 py-10 sm:py-16">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppLogo size={56} />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Hourbook</h1>
              <p className="text-sm text-muted">{t('app.tagline')}</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}>
            <Languages size={16} aria-hidden="true" />
            {language === 'es' ? 'English' : 'Español'}
          </Button>
        </div>

        <section className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-card)]" aria-labelledby="auth-title">
          <div className="mb-5 grid grid-cols-2 rounded-xl border border-line bg-canvas p-1" role="tablist">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError('');
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  mode === m ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {m === 'login' ? t('auth.login') : t('auth.register')}
              </button>
            ))}
          </div>

          <h2 id="auth-title" className="sr-only">
            {mode === 'login' ? t('auth.login') : t('auth.register')}
          </h2>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <Field label={t('auth.email')}>
              {(p) => (
                <TextInput
                  {...p}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label={t('auth.password')} hint={mode === 'register' ? t('auth.passwordHint') : undefined}>
              {(p) => (
                <TextInput
                  {...p}
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              )}
            </Field>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-tomato"
              />
              <span>
                <span className="block font-medium">{t('auth.remember')}</span>
                <span className="block text-xs text-muted">{t('auth.rememberHint')}</span>
              </span>
            </label>
            {error && (
              <p className="rounded-xl border border-tomato/40 bg-coral-soft px-3 py-2 text-sm text-ink" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" disabled={busy || !email || !password}>
              {busy ? (
                <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
              ) : mode === 'login' ? (
                <LogIn size={18} aria-hidden="true" />
              ) : (
                <UserPlus size={18} aria-hidden="true" />
              )}
              {mode === 'login' ? t('auth.login') : t('auth.createAccount')}
            </Button>
          </form>
        </section>
        {mode === 'register' && <p className="text-center text-xs text-muted">{t('auth.migrateHint')}</p>}
      </div>
    </div>
  );
}
