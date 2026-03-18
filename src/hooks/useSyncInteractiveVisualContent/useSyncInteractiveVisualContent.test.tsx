import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Core from '@/core';
import { useSyncInteractiveVisualContent } from './useSyncInteractiveVisualContent';

describe('useSyncInteractiveVisualContent', () => {
  beforeEach(() => {
    const { result } = renderHook(() => Core.useHomeStore((state) => state.reset));

    act(() => {
      result.current();
    });
  });

  it('syncs resolved content back to the home store', () => {
    act(() => {
      Core.useHomeStore.getState().setContent(Core.CONTENT.SHORT);
    });

    renderHook(() => useSyncInteractiveVisualContent(Core.CONTENT.ALL));

    expect(Core.useHomeStore.getState().content).toBe(Core.CONTENT.ALL);
  });

  it('does nothing when the resolved content already matches the store', () => {
    act(() => {
      Core.useHomeStore.getState().setContent(Core.CONTENT.IMAGES);
    });

    renderHook(() => useSyncInteractiveVisualContent(Core.CONTENT.IMAGES));

    expect(Core.useHomeStore.getState().content).toBe(Core.CONTENT.IMAGES);
  });
});
