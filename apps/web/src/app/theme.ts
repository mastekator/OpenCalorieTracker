import type { Theme } from '@oct/shared';

/** Read by the inline script in index.html before first paint (ADR-0004). */
export const THEME_STORAGE_KEY = 'oct.theme';
// Same values as index.html and --theme-color in styles/tokens.css.
const COLORS = { light: '#F8FAF9', dark: '#0E1110' } as const;

/** The theme on this device: no key = follow the system. */
export function savedTheme(): Theme {
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY);
    if (theme === 'light' || theme === 'dark') return theme;
  } catch {
    // localStorage unavailable: the system theme.
  }
  return 'system';
}

/** Switches the theme now and for the next cold start, like the inline script does at load. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not remembered on this device; the server copy still syncs it.
  }
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      // System: each tag goes back to the colour of its own media query.
      const own = meta.media.includes('dark') ? 'dark' : 'light';
      meta.content = COLORS[theme === 'system' ? own : theme];
    });
}
