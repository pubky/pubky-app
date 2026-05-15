import type { EnrichedPostDetails, EnrichedUserDetails } from '@/application/moderation/moderation.types';
import { type ModerationModelSchema, ModerationType } from '@/models/moderation/moderation.schema';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { UserDetailsModelSchema } from '@/models/user/details/userDetails.schema';
import { LocalModerationService } from '@/services/local/moderation/moderation';
import { shouldBlur } from './moderation.utils';

export class ModerationApplication {
  private constructor() {}

  /**
   * Sets an item as un-blurred by the user.
   */
  static async setUnBlur(id: string): Promise<void> {
    return LocalModerationService.setUnBlur(id);
  }

  /**
   * Enriches items with moderation status.
   * Generic method that works for both posts and users.
   */
  private static enrichWithModeration<T extends { id: string }>(
    items: T[],
    recordMap: Map<string, ModerationModelSchema>,
    isBlurDisabledGlobally: boolean,
  ): (T & { is_moderated: boolean; is_blurred: boolean })[] {
    return items.map((item) => {
      const record = recordMap.get(item.id);
      return {
        ...item,
        is_moderated: !!record,
        is_blurred: record ? shouldBlur(record.is_blurred, isBlurDisabledGlobally) : false,
      };
    });
  }

  static async enrichPostsWithModeration(
    posts: PostDetailsModelSchema[],
    isBlurDisabledGlobally: boolean,
  ): Promise<EnrichedPostDetails[]> {
    if (posts.length === 0) return [];

    const records = await LocalModerationService.getModerationRecords(
      posts.map((p) => p.id),
      ModerationType.POST,
    );
    const recordMap = new Map(records.map((r) => [r.id, r]));

    return this.enrichWithModeration(posts, recordMap, isBlurDisabledGlobally);
  }

  static async enrichUsersWithModeration(
    users: UserDetailsModelSchema[],
    isBlurDisabledGlobally: boolean,
  ): Promise<EnrichedUserDetails[]> {
    if (users.length === 0) return [];

    const records = await LocalModerationService.getModerationRecords(
      users.map((u) => u.id),
      ModerationType.PROFILE,
    );
    const recordMap = new Map(records.map((r) => [r.id, r]));

    return this.enrichWithModeration(users, recordMap, isBlurDisabledGlobally);
  }

  /**
   * Check moderation status for a single item.
   */
  static async getModerationStatus(
    id: string,
    type: ModerationType,
    isBlurDisabledGlobally: boolean,
  ): Promise<{ is_moderated: boolean; is_blurred: boolean }> {
    const record = await LocalModerationService.getModerationRecord(id, type);
    return {
      is_moderated: !!record,
      is_blurred: record ? shouldBlur(record.is_blurred, isBlurDisabledGlobally) : false,
    };
  }
}
