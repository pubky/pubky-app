import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { TAG_LIGHT_PALETTES, type TagLightPalette } from '@/config/theme';
import { APPEARANCE_PERSIST_KEY } from '../persistedKeys';
import { createAppearanceActions } from './appearance.actions';
import { appearanceInitialState, type AppearanceState, type AppearanceStore } from './appearance.types';

function isTagLightPalette(value: unknown): value is TagLightPalette {
  return TAG_LIGHT_PALETTES.includes(value as TagLightPalette);
}

export const useAppearanceStore = create<AppearanceStore>()(
  devtools(
    persist(
      (set) => ({
        ...appearanceInitialState,
        ...createAppearanceActions(set),
      }),
      {
        name: APPEARANCE_PERSIST_KEY,
        partialize: (state) => ({
          tagLightPalette: state.tagLightPalette,
        }),
        merge: (persisted, current) => {
          const stored = (persisted as Partial<AppearanceState> | undefined)?.tagLightPalette;
          return isTagLightPalette(stored) ? { ...current, tagLightPalette: stored } : current;
        },
      },
    ),
    {
      name: 'appearance-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
