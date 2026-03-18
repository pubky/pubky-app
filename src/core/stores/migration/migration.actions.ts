import { MigrationStore, MigrationActionTypes, migrationInitialState } from './migration.types';
import type { ZustandSet } from '../stores.types';

export const createMigrationActions = (set: ZustandSet<MigrationStore>) => ({
  setWasDbReset: (value: boolean) => set({ wasDbReset: value }, false, MigrationActionTypes.SET_WAS_DB_RESET),
  reset: () => set(migrationInitialState, false, MigrationActionTypes.SET_WAS_DB_RESET),
});
