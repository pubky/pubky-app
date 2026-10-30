import type { ZustandSet } from '../stores.types';
import {
  type SocialMigrationActions,
  SocialMigrationActionTypes,
  socialMigrationInitialState,
  type SocialMigrationStore,
} from './socialMigration.types';

export const createSocialMigrationActions = (set: ZustandSet<SocialMigrationStore>): SocialMigrationActions => ({
  setStage: (stage, reason) => set({ stage, reason }, false, SocialMigrationActionTypes.SET_STAGE),
  setProgress: ({ phase, pass, done, total, counts, dropped }) =>
    set({ phase, pass, done, total, counts, dropped }, false, SocialMigrationActionTypes.SET_PROGRESS),
  setAttempt: (attempt) => set({ attempt }, false, SocialMigrationActionTypes.SET_ATTEMPT),
  setResumedFrom: (resumedFrom) => set({ resumedFrom }, false, SocialMigrationActionTypes.SET_RESUMED_FROM),
  setNeedBytes: (needBytes) => set({ needBytes }, false, SocialMigrationActionTypes.SET_NEED_BYTES),
  setSummary: (summary) => set({ summary }, false, SocialMigrationActionTypes.SET_SUMMARY),
  reset: () => set(socialMigrationInitialState, false, SocialMigrationActionTypes.RESET),
});
