import { ModerationApplication } from '@/application/moderation/moderation';
import type { EnrichedPostDetails, EnrichedUserDetails } from '@/application/moderation/moderation.types';
import type { ModerationType } from '@/models/moderation/moderation.schema';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { UserDetailsModelSchema } from '@/models/user/details/userDetails.schema';
import { useSettingsStore } from '@/stores/settings/settings.store';
export class ModerationController {
  private constructor() {}

  private static get isBlurDisabledGlobally(): boolean {
    return !useSettingsStore.getState().privacy.blurCensored;
  }

  /**
   * Un-blur a moderated item (post or profile).
   */
  static async unBlur(id: string): Promise<void> {
    return ModerationApplication.setUnBlur(id);
  }

  static async enrichPosts(posts: PostDetailsModelSchema[]): Promise<EnrichedPostDetails[]> {
    return ModerationApplication.enrichPostsWithModeration(posts, this.isBlurDisabledGlobally);
  }

  static async enrichUsers(users: UserDetailsModelSchema[]): Promise<EnrichedUserDetails[]> {
    return ModerationApplication.enrichUsersWithModeration(users, this.isBlurDisabledGlobally);
  }

  /**
   * Get moderation status for a single item.
   */
  static async getModerationStatus(
    id: string,
    type: ModerationType,
  ): Promise<{ is_moderated: boolean; is_blurred: boolean }> {
    return ModerationApplication.getModerationStatus(id, type, this.isBlurDisabledGlobally);
  }
}
