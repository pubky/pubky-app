import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { SETTINGS_PERSIST_KEY } from '../persistedKeys';
import { createSettingsActions } from './settings.actions';
import {
  normalizeMediaPreferences,
  settingsInitialState,
  type SettingsState,
  type SettingsStore,
} from './settings.types';

// Store creation
export const useSettingsStore = create<SettingsStore>()(
  devtools(
    persist(
      (set) => ({
        ...settingsInitialState,
        ...createSettingsActions(set),
      }),
      {
        name: SETTINGS_PERSIST_KEY,

        // Persist settings data
        partialize: (state) => ({
          notifications: state.notifications,
          privacy: state.privacy,
          media: state.media,
          muted: state.muted,
          updatedAt: state.updatedAt,
          version: state.version,
        }),
        // A store persisted by an older version has a `media` without the newer keys (or none).
        merge: (persisted, current) => {
          const stored = persisted as Partial<SettingsState> | undefined;
          return { ...current, ...stored, media: normalizeMediaPreferences(stored?.media ?? current.media) };
        },
      },
    ),
    {
      name: 'settings-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
