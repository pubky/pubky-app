export interface MigrationState {
  wasDbReset: boolean;
}

export interface MigrationActions {
  setWasDbReset: (value: boolean) => void;
  reset: () => void;
}

export type MigrationStore = MigrationState & MigrationActions;

export const migrationInitialState: MigrationState = {
  wasDbReset: false,
};

export enum MigrationActionTypes {
  SET_WAS_DB_RESET = 'SET_WAS_DB_RESET',
}
