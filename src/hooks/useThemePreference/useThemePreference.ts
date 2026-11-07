'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { DEFAULT_THEME, THEME_OPTIONS, type ThemeOption } from '@/config/theme';
import type { UseThemePreferenceResult } from './useThemePreference.types';

function isThemeOption(value: string | undefined): value is ThemeOption {
  return THEME_OPTIONS.includes(value as ThemeOption);
}

/**
 * Read and update the user's colour scheme preference.
 *
 * Wraps `next-themes` so components never deal with its `undefined`-before-hydration
 * state: `theme` is always a valid `ThemeOption`, and `isReady` tells the caller when
 * the value reflects what is actually stored.
 */
export function useThemePreference(): UseThemePreferenceResult {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  return {
    theme: isReady && isThemeOption(theme) ? theme : DEFAULT_THEME,
    isReady,
    isLightApplied: isReady && resolvedTheme === 'light',
    setTheme,
  };
}
