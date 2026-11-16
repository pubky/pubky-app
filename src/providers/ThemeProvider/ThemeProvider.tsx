'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { AUTH_ROUTES, ONBOARDING_ROUTES, ROOT_ROUTES } from '@/app/routes';
import { DEFAULT_THEME, THEME_CLASSES, THEME_STORAGE_KEY } from '@/config/theme';
import { selectDisplayUserPubky } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';

interface ThemeProviderProps {
  children: ReactNode;
}

const SIGNED_OUT_ROUTES: string[] = [ROOT_ROUTES, ...Object.values(AUTH_ROUTES), ...Object.values(ONBOARDING_ROUTES)];

/** The pre-paint script inlines this function's source, so it must not reference anything outside its body. */
function hasStoredSession(authStorageKey: string): boolean {
  try {
    const stored = localStorage.getItem(authStorageKey);
    return stored !== null && JSON.parse(stored).state.sessionReference != null;
  } catch {
    return false;
  }
}

// Runs right after next-themes' own script, which already forces dark on SIGNED_OUT_ROUTES.
const SIGNED_OUT_THEME_SCRIPT = `if(!(${hasStoredSession})(${JSON.stringify(AUTH_PERSIST_KEY)}))document.documentElement.classList.replace('light','dark')`;

/**
 * Theme preference lives in localStorage under `pubky-theme` as one of
 * `THEME_OPTIONS` (`dark` | `light` | `system`). Dark is the default; Auto
 * (`system`) follows `prefers-color-scheme` once chosen. next-themes applies the resolved class to
 * <html> before first paint, so `.light` in globals.css takes over from the
 * dark `:root` tokens without a flash.
 *
 * Light mode is for signed-in members: the default theme is forced on the signed-out pages and whenever no one is
 * signed in, without touching the stored preference (sign-out removes it). The server cannot see the session, so a
 * pre-paint script checks the stored one.
 *
 * No `color-scheme` is set on the document (`enableColorScheme={false}`, and none in globals.css):
 * when an iframe's colour scheme differs from its embedded document's, the browser paints the frame
 * an opaque canvas instead of leaving it transparent, which hides embeds that draw on a transparent
 * body (Shop, Lock Server `/connect`, Paykit `/setup`).
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const pathname = usePathname();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isSignedIn = useAuthStore((state) => selectDisplayUserPubky(state) !== null);
  // Public documents render without AuthCoordinator, so their store never adopts another tab's sign-in or sign-out.
  // Until this tab's store changes again, follow the session another tab last stored.
  const [storedByOtherTab, setStoredByOtherTab] = useState<boolean | null>(null);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_PERSIST_KEY || event.key === null) setStoredByOtherTab(hasStoredSession(AUTH_PERSIST_KEY));
    };
    window.addEventListener('storage', onStorage);
    const unsubscribe = useAuthStore.subscribe(() => setStoredByOtherTab(null));
    return () => {
      window.removeEventListener('storage', onStorage);
      unsubscribe();
    };
  }, []);
  // Until the store rehydrates, read the session it will load; the server leaves that to the script.
  const hasSession = hasHydrated
    ? (storedByOtherTab ?? isSignedIn)
    : typeof window === 'undefined' || hasStoredSession(AUTH_PERSIST_KEY);
  const isSignedOut = SIGNED_OUT_ROUTES.includes(pathname) || !hasSession;

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      forcedTheme={isSignedOut ? DEFAULT_THEME : undefined}
      themes={[...THEME_CLASSES]}
      enableSystem
      enableColorScheme={false}
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      <script dangerouslySetInnerHTML={{ __html: SIGNED_OUT_THEME_SCRIPT }} />
      {children}
    </NextThemesProvider>
  );
}
