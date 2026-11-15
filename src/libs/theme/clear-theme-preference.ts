import { THEME_STORAGE_KEY } from '@/config/theme';

/**
 * Forgets the browser's theme choice on sign-out, so the next account to sign in starts on the default theme.
 * next-themes keeps the choice in memory and re-reads it only on a `storage` event: announce the removal the way
 * another tab would (next-themes then resets to the default), then remove the key it rewrites while resetting.
 */
export function clearThemePreference(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: null }));
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Storage unavailable: no stored preference to clear.
  }
}
