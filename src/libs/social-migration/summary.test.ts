import type { MigrationReport } from 'pubky-social-migrator';
import { describe, expect, it } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { socialMigrationSkippedTotal, socialMigrationSummaryIsEmpty, summarizeSocialMigrationReport } from './summary';

const report = (counts: Record<string, number>, droppedValues: Record<string, string[]> = {}) =>
  asOpaque<MigrationReport>({ counts, droppedValues });

describe('summarizeSocialMigrationReport', () => {
  it('counts the skip outcomes and put refusals, never the expected ones', () => {
    const summary = summarizeSocialMigrationReport(
      report({ written: 5, already_present: 2, deleted_mid_run: 1, not_migrated: 3, invalid: 2, put_rejected: 1 }),
    );
    expect(summary).toEqual({
      skipped: { invalid: 2, put_rejected: 1 },
      dropped: { profileImage: 0, profileLinks: 0 },
    });
    expect(socialMigrationSkippedTotal(summary)).toBe(3);
    expect(socialMigrationSummaryIsEmpty(summary)).toBe(false);
  });

  it('counts dropped profile values by kind without keeping the paths', () => {
    const summary = summarizeSocialMigrationReport(
      report({ written: 1 }, { 'pub/pubky.app/profile.json': ['profile_image', 'profile_link[0]', 'profile_link[3]'] }),
    );
    expect(summary.dropped).toEqual({ profileImage: 1, profileLinks: 2 });
    expect(JSON.stringify(summary)).not.toContain('profile.json');
  });

  it('is empty for a clean run and for objects with no 1.x counterpart', () => {
    expect(socialMigrationSummaryIsEmpty(summarizeSocialMigrationReport(report({ written: 4, not_migrated: 2 })))).toBe(
      true,
    );
  });
});
