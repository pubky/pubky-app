import type { Bucket, Phase } from 'pubky-social-migrator';

export interface SocialMigrationProgressProps {
  /** The engine's phase; undefined before its first event (the account check is running). */
  phase?: Phase;
  /** The 0.x directory being copied while `phase` is `migrating`. */
  pass?: Bucket;
  done: number;
  total: number;
  /** Where an earlier run of this account stopped, shown until this run's listing completes. */
  resumedFrom?: { done: number; total: number };
}
