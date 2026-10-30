import type { Session } from '@synonymdev/pubky';
import type { MigrationReport, ProgressEvent } from 'pubky-social-migrator';
import { z } from 'zod';
import { SOCIAL_MIGRATION_FLAG_PATH } from '@/config/social-migration';
import { HomeserverService } from '@/services/homeserver/homeserver';

/** The one member of the done flag the gate reads; the engine owns the rest (ADR-0026). */
const flagSchema = z.object({ transform_rev: z.number().int().nonnegative() });

/**
 * The social v1 migration gate's homeserver side (ADR-0026). A leaf (ADR-0009): it orchestrates
 * nothing, and the session is explicit because the gate runs before it enters the auth store.
 */
export class SocialMigrationApplication {
  private constructor() {}

  /**
   * The transform revision the done flag records: `null` when the flag is absent (a 404 only;
   * a missing session, a refused `/priv/` read or a transport failure throw, so a refused flag
   * never reads as a missing one), `0` when it holds anything but what a run writes (the engine
   * reads such a flag the same way and walks the tree again).
   */
  static async readFlag({ session, pubky }: { session: Session; pubky: string }): Promise<number | null> {
    const result = await HomeserverService.getBytesIfExists(`pubky://${pubky}${SOCIAL_MIGRATION_FLAG_PATH}`, session);
    if (!result) return null;
    try {
      const parsed = flagSchema.safeParse(JSON.parse(new TextDecoder().decode(result.bytes)));
      return parsed.success ? parsed.data.transform_rev : 0;
    } catch {
      return 0;
    }
  }

  /** One run of the engine; it resolves with a report whatever the outcome, and the controller classifies it. */
  static run({
    session,
    signal,
    onProgress,
    onLockWait,
  }: {
    session: Session;
    signal: AbortSignal;
    onProgress: (event: ProgressEvent) => void;
    onLockWait: () => void;
  }): Promise<MigrationReport> {
    return HomeserverService.migrateToSocialV1({ session, signal, onProgress, onLockWait });
  }
}
