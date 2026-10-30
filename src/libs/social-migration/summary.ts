import type { MigrationReport } from 'pubky-social-migrator';
import type { SocialMigrationSummary } from '@/stores/socialMigration/socialMigration.types';

/**
 * The outcomes a finished run reports as left behind: the migrator's `skipReasons` without
 * `not_migrated` (a 0.x path with no 1.x counterpart, such as `last_read`, expected on every
 * account) plus a PUT the homeserver refused. Spelled here rather than imported: a static import
 * of the migrator would pull its wasm chunk into the main bundle; the contract test keeps the
 * list equal to the engine's.
 */
export const SOCIAL_MIGRATION_SKIP_OUTCOMES = [
  'malformed',
  'shape',
  'unsafe_integer',
  'empty_title',
  'unknown_feed_content',
  'oversize',
  'invalid',
  'put_rejected',
] as const;

/** Counts only: the report's paths, notes and dropped values never reach the store or the record. */
export function summarizeSocialMigrationReport(
  report: Pick<MigrationReport, 'counts' | 'droppedValues'>,
): SocialMigrationSummary {
  const skipped: Record<string, number> = {};
  for (const outcome of SOCIAL_MIGRATION_SKIP_OUTCOMES) {
    const count = report.counts[outcome] ?? 0;
    if (count > 0) skipped[outcome] = count;
  }
  let profileImage = 0;
  let profileLinks = 0;
  for (const dropped of Object.values(report.droppedValues ?? {})) {
    for (const value of dropped) {
      if (value === 'profile_image') profileImage += 1;
      else profileLinks += 1;
    }
  }
  return { skipped, dropped: { profileImage, profileLinks } };
}

export function socialMigrationSummaryIsEmpty(summary: SocialMigrationSummary): boolean {
  return (
    Object.keys(summary.skipped).length === 0 &&
    summary.dropped.profileImage === 0 &&
    summary.dropped.profileLinks === 0
  );
}

export function socialMigrationSkippedTotal(summary: SocialMigrationSummary): number {
  return Object.values(summary.skipped).reduce((total, count) => total + count, 0);
}
