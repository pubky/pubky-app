import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRelativeTime } from './useRelativeTime';

describe('useRelativeTime', () => {
  const now = new Date('2026-07-16T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['4s', 4 * 1000],
    ['3m', 3 * 60 * 1000],
    ['7h', 7 * 60 * 60 * 1000],
    ['2d', 2 * 24 * 60 * 60 * 1000],
    ['5w', 5 * 7 * 24 * 60 * 60 * 1000],
    ['6M', 6 * 30 * 24 * 60 * 60 * 1000],
  ])('formats %s timestamps with a compact label', (expected, elapsedMs) => {
    const { result } = renderHook(() => useRelativeTime());

    expect(result.current.formatRelativeTime(new Date(now.getTime() - elapsedMs))).toBe(expected);
  });

  it('does not show negative values for future timestamps', () => {
    const { result } = renderHook(() => useRelativeTime());

    expect(result.current.formatRelativeTime(new Date(now.getTime() + 10 * 1000))).toBe('0s');
  });
});
