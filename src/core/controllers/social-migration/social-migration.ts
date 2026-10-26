import type { MigrationReport } from 'pubky-social-migrator';
import { SocialMigrationApplication } from '@/application/social-migration/social-migration';

export class SocialMigrationController {
  private constructor() {}

  static async migrate(signal: AbortSignal): Promise<MigrationReport> {
    return await SocialMigrationApplication.migrate(signal);
  }
}
