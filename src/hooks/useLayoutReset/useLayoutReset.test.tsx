import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Core from '@/core';
import { useLayoutReset } from './useLayoutReset';

describe('useLayoutReset', () => {
  beforeEach(() => {
    const { result } = renderHook(() => Core.useHomeStore((state) => state.reset));

    act(() => {
      result.current();
    });
  });

  it('resets wide layout back to columns', () => {
    const { result: setLayout } = renderHook(() => Core.useHomeStore((state) => state.setLayout));

    act(() => {
      setLayout.current(Core.LAYOUT.WIDE);
    });

    renderHook(() => useLayoutReset());

    const { result: layout } = renderHook(() => Core.useHomeStore((state) => state.layout));
    expect(layout.current).toBe(Core.LAYOUT.COLUMNS);
  });

  it('does not reset visual layout', () => {
    const { result: setLayout } = renderHook(() => Core.useHomeStore((state) => state.setLayout));

    act(() => {
      setLayout.current(Core.LAYOUT.VISUAL);
    });

    renderHook(() => useLayoutReset());

    const { result: layout } = renderHook(() => Core.useHomeStore((state) => state.layout));
    expect(layout.current).toBe(Core.LAYOUT.VISUAL);
  });
});
