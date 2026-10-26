import { useSyncExternalStore } from 'react';

/* Light / dark preference, kept per device (it is not part of the synced data). */

export type Theme = 'light' | 'dark';

const KEY = 'hourbook:theme';
const listeners = new Set<() => void>();

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* still applied for this visit */
  }
  listeners.forEach((fn) => fn());
}

/** Applies the saved choice, or the system setting when there is none. */
export function initTheme(): void {
  document.documentElement.dataset.theme = storedTheme() ?? systemTheme();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    currentTheme,
    () => 'light',
  );
}
