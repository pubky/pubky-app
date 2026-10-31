'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { useThemePreference } from '@/hooks/useThemePreference/useThemePreference';

/**
 * Round sun/moon control for headers that offer Learn and Explore.
 *
 * The icon follows the `.light` class on an ancestor, so Auto shows the
 * appearance actually in use. The hidden control is `display: none`, leaving
 * one tab stop whose label names the switch.
 */
export function ThemeToggle() {
  const { setTheme } = useThemePreference();

  return (
    <>
      <Button
        id="header-theme-toggle"
        data-testid="header-theme-toggle"
        variant="outline"
        size="icon"
        aria-label="Switch to light mode"
        className="size-10 [.light_&]:hidden"
        onClick={() => setTheme('light')}
      >
        <Moon className="size-4" />
      </Button>
      <Button
        data-testid="header-theme-toggle-light"
        variant="outline"
        size="icon"
        aria-label="Switch to dark mode"
        className="hidden size-10 [.light_&]:inline-flex"
        onClick={() => setTheme('dark')}
      >
        <Sun className="size-4" />
      </Button>
    </>
  );
}
