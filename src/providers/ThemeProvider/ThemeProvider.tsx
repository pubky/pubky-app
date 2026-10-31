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
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      themes={[...THEME_OPTIONS]}
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      {children}
    </NextThemesProvider>
  );
}
