import { beforeEach, describe, expect, it } from 'vitest';
import { APPEARANCE_PERSIST_KEY, PERSISTED_STORE_KEYS } from '../persistedKeys';
import { useAppearanceStore } from './appearance.store';
import { appearanceInitialState } from './appearance.types';

function storedTagLightPalette(): unknown {
  const raw = localStorage.getItem(APPEARANCE_PERSIST_KEY);
  return raw ? JSON.parse(raw).state.tagLightPalette : undefined;
}

describe('AppearanceStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppearanceStore.setState(appearanceInitialState);
  });

  it('defaults the light mode tag colours to pastel', () => {
    expect(useAppearanceStore.getInitialState().tagLightPalette).toBe('pastel');
    expect(useAppearanceStore.getState().tagLightPalette).toBe('pastel');
  });

  it('sets and persists the light mode tag colours', () => {
    useAppearanceStore.getState().setTagLightPalette('saturated');

    expect(useAppearanceStore.getState().tagLightPalette).toBe('saturated');
    expect(storedTagLightPalette()).toBe('saturated');
  });

  it('restores a stored choice on rehydrate', async () => {
    localStorage.setItem(APPEARANCE_PERSIST_KEY, JSON.stringify({ state: { tagLightPalette: 'saturated' } }));

    await useAppearanceStore.persist.rehydrate();

    expect(useAppearanceStore.getState().tagLightPalette).toBe('saturated');
  });

  it('ignores unknown stored values', async () => {
    useAppearanceStore.getState().setTagLightPalette('saturated');
    localStorage.setItem(APPEARANCE_PERSIST_KEY, JSON.stringify({ state: { tagLightPalette: 'neon' } }));

    await useAppearanceStore.persist.rehydrate();

    expect(useAppearanceStore.getState().tagLightPalette).toBe('saturated');
  });

  it('is kept on logout, like the theme choice', () => {
    expect(PERSISTED_STORE_KEYS).not.toContain(APPEARANCE_PERSIST_KEY);
  });
});
