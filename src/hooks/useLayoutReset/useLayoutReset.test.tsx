import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { useLayoutReset } from './useLayoutReset';

describe('useLayoutReset', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useHomeStore((state) => state.reset));

    act(() => {
      result.current();
    });
  });

  it('resets wide layout back to columns', () => {
    const { result: setLayout } = renderHook(() => useHomeStore((state) => state.setLayout));

    act(() => {
      setLayout.current(LAYOUT.WIDE);
    });

    renderHook(() => useLayoutReset());

    const { result: layout } = renderHook(() => useHomeStore((state) => state.layout));
    expect(layout.current).toBe(LAYOUT.COLUMNS);
  });

  it('does not reset visual layout', () => {
    const { result: setLayout } = renderHook(() => useHomeStore((state) => state.setLayout));

    act(() => {
      setLayout.current(LAYOUT.VISUAL);
    });

    renderHook(() => useLayoutReset());

    const { result: layout } = renderHook(() => useHomeStore((state) => state.layout));
    expect(layout.current).toBe(LAYOUT.VISUAL);
  });
});
