import type { MigrationReport } from 'pubky-social-migrator';
import { Logger } from '@/libs/logger/logger';
import { HomeserverService } from '@/services/homeserver/homeserver';

export class SocialMigrationApplication {
  private constructor() {}

  /**
   * Runs the social v1 migration for the signed-in user. An unfinished run is picked up by the next
   * one, so nothing here retries.
   */
  static async migrate(signal: AbortSignal): Promise<MigrationReport> {
    const report = await HomeserverService.migrateToSocialV1({ signal });
    const summary = { status: report.status, counts: report.counts, error: report.error };
    if (report.status === 'done' || report.status === 'already_migrated') {
      Logger.info('[SocialMigration] Finished', summary);
    } else if (report.error?.code === 'ABORTED' || report.error?.code === 'ALREADY_RUNNING') {
      Logger.debug('[SocialMigration] Stopped', summary);
    } else {
      Logger.warn('[SocialMigration] Not finished, the next visit runs it again', summary);
    }
    return report;
  }
}
