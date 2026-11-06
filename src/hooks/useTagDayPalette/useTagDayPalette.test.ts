import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getTagDayPalette } from '@/libs/utils/tagPalette';
import { useAppearanceStore } from '@/stores/appearance/appearance.store';
import { appearanceInitialState } from '@/stores/appearance/appearance.types';
import { useTagDayPalette } from './useTagDayPalette';

describe('useTagDayPalette', () => {
  beforeEach(() => {
    useAppearanceStore.setState(appearanceInitialState);
  });

  it('uses the pastel mapping by default', () => {
    const { result } = renderHook(() => useTagDayPalette('#FF0000'));

    expect(result.current).toEqual(getTagDayPalette('#FF0000', 'pastel'));
  });

  it('uses the saturated mapping when chosen', () => {
    useAppearanceStore.setState({ tagLightPalette: 'saturated' });

    const { result } = renderHook(() => useTagDayPalette('#FF0000'));

    expect(result.current).toEqual(getTagDayPalette('#FF0000', 'saturated'));
  });

  it('follows changes to the choice without remounting', () => {
    const { result } = renderHook(() => useTagDayPalette('#FF0000'));

    act(() => {
      useAppearanceStore.getState().setTagLightPalette('saturated');
    });
    expect(result.current).toEqual(getTagDayPalette('#FF0000', 'saturated'));

    act(() => {
      useAppearanceStore.getState().setTagLightPalette('pastel');
    });
    expect(result.current).toEqual(getTagDayPalette('#FF0000', 'pastel'));
  });
});
