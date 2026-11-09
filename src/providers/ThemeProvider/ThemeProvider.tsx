'use client';

import { usePathname } from 'next/navigation';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { isSignedOutRoute, SIGNED_OUT_ROUTES } from '@/app/routes';
import { DEFAULT_THEME, SIGNED_OUT_THEME, THEME_CLASSES, THEME_STORAGE_KEY } from '@/config/theme';
import { selectDisplayUserPubky } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { getSignedOutThemeScript, isSignedOutBeforeHydration } from './ThemeProvider.utils';

interface ThemeProviderProps {
  children: ReactNode;
}

const signedOutThemeScript = getSignedOutThemeScript();

function isSignedOut(pathname: string | null, hasHydrated: boolean, isSignedIn: boolean): boolean {
  if (isSignedOutRoute(pathname)) return true;
  if (hasHydrated) return !isSignedIn;
  // The server has no session to read: its render leaves the decision to the pre-paint script.
  if (typeof window === 'undefined') return false;
  return isSignedOutBeforeHydration(pathname ?? '', SIGNED_OUT_ROUTES, AUTH_PERSIST_KEY);
}

/**
 * Theme preference lives in localStorage under `pubky-theme` as one of
 * `THEME_OPTIONS` (`dark` | `light` | `system`). Dark is the default; Auto
 * (`system`) follows `prefers-color-scheme` once chosen. next-themes applies the resolved class to
 * <html> before first paint, so `.light` in globals.css takes over from the
 * dark `:root` tokens without a flash.
 *
 * Light mode is for signed-in members only. With no one signed in, and on the signed-out pages in any auth state,
 * `SIGNED_OUT_THEME` is forced without touching the stored preference, so a member who chose Light gets it back
 * after signing in. The server cannot see the session, so a second pre-paint script applies the same rule from
 * localStorage before the auth store rehydrates.
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

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      themes={[...THEME_CLASSES]}
      forcedTheme={isSignedOut(pathname, hasHydrated, isSignedIn) ? SIGNED_OUT_THEME : undefined}
      enableSystem
      enableColorScheme={false}
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      <script
        id="pubky-signed-out-theme"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: signedOutThemeScript }}
      />
      {children}
    </NextThemesProvider>
  );
}
