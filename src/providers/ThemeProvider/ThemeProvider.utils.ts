import { SIGNED_OUT_ROUTES } from '@/app/routes';
import { SIGNED_OUT_THEME, THEME_CLASSES } from '@/config/theme';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';

/**
 * Whether the page must render in the signed-out theme before the auth store has rehydrated: a signed-out route,
 * or no stored session reference (the persisted auth record is what the store will rehydrate from).
 *
 * The pre-paint script inlines this function's source, so it must not reference anything outside its own body.
 */
export function isSignedOutBeforeHydration(
  pathname: string,
  signedOutRoutes: readonly string[],
  authStorageKey: string,
): boolean {
  if (signedOutRoutes.includes(pathname)) return true;
  try {
    const stored = window.localStorage.getItem(authStorageKey);
    return stored === null || JSON.parse(stored).state.sessionReference == null;
  } catch {
    return true;
  }
}

/**
 * Runs during parsing, right after next-themes' own script has applied the stored preference, and swaps it for the
 * signed-out theme when no one is signed in. The stored preference is left untouched.
 */
export function getSignedOutThemeScript(): string {
  const args = [JSON.stringify(SIGNED_OUT_ROUTES), JSON.stringify(AUTH_PERSIST_KEY)].join(',');
  return [
    '(function(){',
    `if(!(${isSignedOutBeforeHydration.toString()})(window.location.pathname,${args}))return;`,
    'var root=document.documentElement;',
    `${JSON.stringify(THEME_CLASSES)}.forEach(function(theme){root.classList.remove(theme)});`,
    `root.classList.add(${JSON.stringify(SIGNED_OUT_THEME)})`,
    '})()',
  ].join('');
}
