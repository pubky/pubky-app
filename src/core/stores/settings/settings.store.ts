import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { SETTINGS_PERSIST_KEY } from '../persistedKeys';
import { createSettingsActions } from './settings.actions';
import { settingsInitialState, type SettingsStore } from './settings.types';

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
          muted: state.muted,
          updatedAt: state.updatedAt,
          version: state.version,
        }),
      },
    ),
    {
      name: 'settings-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
