import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { type MigrationStore, migrationInitialState } from './migration.types';
import { createMigrationActions } from './migration.actions';
import { MIGRATION_STORE_KEY } from '../persistedKeys';

// No persistence - ephemeral state that resets on page refresh
export const useMigrationStore = create<MigrationStore>()(
  devtools(
    (set) => ({
      ...migrationInitialState,
      ...createMigrationActions(set),
    }),
    {
      name: MIGRATION_STORE_KEY,
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
