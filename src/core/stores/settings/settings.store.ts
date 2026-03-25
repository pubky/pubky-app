import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { type SettingsStore, settingsInitialState } from './settings.types';
import { createSettingsActions } from './settings.actions';
import { SETTINGS_PERSIST_KEY } from '../persistedKeys';

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
          language: state.language,
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
