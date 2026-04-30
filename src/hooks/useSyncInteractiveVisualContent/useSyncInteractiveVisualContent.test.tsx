import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSyncInteractiveVisualContent } from './useSyncInteractiveVisualContent';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT } from '@/stores/home/home.types';
describe('useSyncInteractiveVisualContent', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useHomeStore((state) => state.reset));

    act(() => {
      result.current();
    });
  });

  it('syncs resolved content back to the home store', () => {
    act(() => {
      useHomeStore.getState().setContent(CONTENT.SHORT);
    });

    renderHook(() => useSyncInteractiveVisualContent(CONTENT.ALL));

    expect(useHomeStore.getState().content).toBe(CONTENT.ALL);
  });

  it('does nothing when the resolved content already matches the store', () => {
    act(() => {
      useHomeStore.getState().setContent(CONTENT.IMAGES);
    });

    renderHook(() => useSyncInteractiveVisualContent(CONTENT.IMAGES));

    expect(useHomeStore.getState().content).toBe(CONTENT.IMAGES);
  });
});
