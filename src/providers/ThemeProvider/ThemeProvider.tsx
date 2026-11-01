'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { DEFAULT_THEME, THEME_OPTIONS, THEME_STORAGE_KEY } from '@/config/theme';

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Theme preference lives in localStorage under `pubky-theme` as one of
 * `THEME_OPTIONS` (`dark` | `light` | `system`). Dark is the default; Auto
 * (`system`) follows `prefers-color-scheme` once chosen. next-themes applies the resolved class to
 * <html> before first paint, so `.light` in globals.css takes over from the
 * dark `:root` tokens without a flash.
 *
 * No `color-scheme` is set on the document (`enableColorScheme={false}`, and none in globals.css):
 * when an iframe's colour scheme differs from its embedded document's, the browser paints the frame
 * an opaque canvas instead of leaving it transparent, which hides embeds that draw on a transparent
 * body (Shop, Lock Server `/connect`, Paykit `/setup`).
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      themes={[...THEME_OPTIONS]}
      enableSystem
      enableColorScheme={false}
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      {children}
    </NextThemesProvider>
  );
}
