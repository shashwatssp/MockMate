/**
 * Manual theme controller (light / dark / system).
 *
 * Every dark-mode rule in the app is scoped to `:where([data-theme="dark"])`
 * or `:root:where([data-theme="dark"])`, so SOMETHING must always set
 * `data-theme` on <html>. The inline script in index.html does this before
 * first paint (no FOUC); this module owns it from then on — applying the
 * saved preference, following OS changes while mode is "system", and
 * keeping the browser-chrome theme-color meta in sync.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'mockmate-theme';

const DARK_BG = '#0f1117';
const LIGHT_BG = '#f6f8fc';

const darkQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export const getThemeMode = (): ThemeMode => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch {
    return 'system'; // private mode / storage disabled — follow the OS
  }
};

/** The mode actually painted right now ("system" resolves to light/dark). */
export const resolvedTheme = (mode: ThemeMode): 'light' | 'dark' =>
  mode === 'system' ? (darkQuery?.matches ? 'dark' : 'light') : mode;

/** Paint a mode: set the attribute + browser chrome color. */
export const applyTheme = (mode: ThemeMode): void => {
  const resolved = resolvedTheme(mode);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? DARK_BG : LIGHT_BG);
};

/** Save a mode and paint it immediately. */
export const setThemeMode = (mode: ThemeMode): void => {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch { /* storage unavailable — still apply for this session */ }
  applyTheme(mode);
};

let initialized = false;

/** Boot the controller: paint the saved preference and follow OS changes
 *  while the user is on "system". Safe to call once from main.tsx. */
export const initTheme = (): void => {
  applyTheme(getThemeMode());
  if (initialized || !darkQuery) return;
  initialized = true;
  darkQuery.addEventListener('change', () => {
    if (getThemeMode() === 'system') applyTheme('system');
  });
};
