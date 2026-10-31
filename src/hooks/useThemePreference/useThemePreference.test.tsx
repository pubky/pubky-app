import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemePreference } from './useThemePreference';

const { mockUseTheme, mockSetTheme } = vi.hoisted(() => ({
  mockUseTheme: vi.fn(),
  mockSetTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
}));

describe('useThemePreference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme });
  });

  it('reports the stored theme once mounted', () => {
    const { result } = renderHook(() => useThemePreference());

    expect(result.current.isReady).toBe(true);
    expect(result.current.theme).toBe('light');
  });

  it('falls back to dark when next-themes has no value yet', () => {
    mockUseTheme.mockReturnValue({ theme: undefined, setTheme: mockSetTheme });

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.theme).toBe('dark');
  });

  it('falls back to dark for unknown stored values', () => {
    mockUseTheme.mockReturnValue({ theme: 'sepia', setTheme: mockSetTheme });

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.theme).toBe('dark');
  });

  it('exposes system as a valid preference', () => {
    mockUseTheme.mockReturnValue({ theme: 'system', setTheme: mockSetTheme });

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.theme).toBe('system');
  });

  it.each([
    ['light', 'light', true],
    ['system', 'light', true],
    ['system', 'dark', false],
    ['dark', 'dark', false],
  ])('reports isLightApplied for theme %s resolved to %s as %s', (theme, resolvedTheme, expected) => {
    mockUseTheme.mockReturnValue({ theme, resolvedTheme, setTheme: mockSetTheme });

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.isLightApplied).toBe(expected);
  });

  it('delegates setTheme to next-themes', () => {
    const { result } = renderHook(() => useThemePreference());

    act(() => {
      result.current.setTheme('system');
    });

    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });
});
