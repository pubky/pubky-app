import type { Bucket, Counts, Phase } from 'pubky-social-migrator';

/**
 * Where the social v1 migration gate is (ADR-0026). `idle` outside a gate; `reauth-required`
 * ends in a forced logout; `summary` waits for Continue; `blocked` waits for Retry.
 */
export type SocialMigrationStage = 'idle' | 'reauth-required' | 'waiting-for-tab' | 'running' | 'blocked' | 'summary';

/** Why the account is signed out: a grant from before the gate, a grant without the scopes, or one that expired mid-run. */
export type SocialMigrationReauthReason = 'pre-migration-grant' | 'missing-scopes' | 'session-expired';

/** Why a run stopped and waits for Retry. */
export type SocialMigrationBlockedReason = 'incomplete' | 'quota' | 'homeserver-unsupported' | 'unexpected';

export type SocialMigrationReason = SocialMigrationReauthReason | SocialMigrationBlockedReason;

/** What a finished run left behind, counts only: paths and notes never leave the report. */
export interface SocialMigrationSummary {
  /** 0.x objects that did not land, by outcome (`not_migrated` is expected and never counted). */
  skipped: Record<string, number>;
  /** Values the 1.x rules refused inside objects that still migrated. */
  dropped: { profileImage: number; profileLinks: number };
}

export interface SocialMigrationProgress {
  phase?: Phase;
  pass?: Bucket;
  done: number;
  total: number;
  counts: Counts | null;
  dropped: number;
}

export interface SocialMigrationState extends SocialMigrationProgress {
  stage: SocialMigrationStage;
  reason?: SocialMigrationReason;
  /** With `blocked/quota`: the bytes the rest of the media needs. */
  needBytes?: number;
  /** Runs started in this gate, the automatic retries included. */
  attempt: number;
  /** Where the last run of an earlier page stopped, until this run's listing completes. */
  resumedFrom?: { done: number; total: number };
  summary?: SocialMigrationSummary;
}

export interface SocialMigrationActions {
  setStage: (stage: SocialMigrationStage, reason?: SocialMigrationReason) => void;
  setProgress: (progress: SocialMigrationProgress) => void;
  setAttempt: (attempt: number) => void;
  setResumedFrom: (resumedFrom: { done: number; total: number } | undefined) => void;
  setNeedBytes: (needBytes: number | undefined) => void;
  setSummary: (summary: SocialMigrationSummary | undefined) => void;
  reset: () => void;
}

export type SocialMigrationStore = SocialMigrationState & SocialMigrationActions;

export const socialMigrationInitialState: SocialMigrationState = {
  stage: 'idle',
  reason: undefined,
  phase: undefined,
  pass: undefined,
  done: 0,
  total: 0,
  counts: null,
  dropped: 0,
  needBytes: undefined,
  attempt: 0,
  resumedFrom: undefined,
  summary: undefined,
};

export enum SocialMigrationActionTypes {
  SET_STAGE = 'SET_STAGE',
  SET_PROGRESS = 'SET_PROGRESS',
  SET_ATTEMPT = 'SET_ATTEMPT',
  SET_RESUMED_FROM = 'SET_RESUMED_FROM',
  SET_NEED_BYTES = 'SET_NEED_BYTES',
  SET_SUMMARY = 'SET_SUMMARY',
  RESET = 'RESET',
}
