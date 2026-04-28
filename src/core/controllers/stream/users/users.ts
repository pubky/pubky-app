import * as Config from '@/config';
import { UserStreamApplication } from '@/application/stream/users/users';
import type {
  TGetOrFetchUsersParams,
  TReadUserStreamChunkParams,
  TReadUserStreamChunkResponse,
} from '@/application/stream/users/users.types';
import { useAuthStore } from '@/stores/auth/auth.store';
/**
 * Stream User Controller
 *
 * Handles user stream requests from the UI layer.
 * Coordinates between application layer and manages background data fetching.
 * Supports followers, following, friends, and other user stream types.
 */
export class StreamUserController {
  private constructor() {}

  /**
   * Get or fetch a slice of a user stream (followers, following, friends, etc.)
   *
   * @param streamId - Composite user stream identifier (userId:reach) e.g., 'user123:followers'
   * @param skip - Number of users to skip (for pagination)
   * @param limit - Number of users to return
   * @returns Next page of user IDs and pagination offset
   */
  static async getOrFetchStreamSlice({
    streamId,
    limit = Config.NEXUS_USERS_PER_PAGE,
    skip,
  }: TReadUserStreamChunkParams): Promise<TReadUserStreamChunkResponse> {
    // selectCurrentUserPubky() throws an error when user is not authenticated;
    // access currentUserPubky directly to get null instead (unauthenticated users can view profile followers/following)
    const viewerId = useAuthStore.getState().currentUserPubky;

    const {
      nextPageIds,
      cacheMissUserIds,
      skip: nextSkip,
    } = await UserStreamApplication.getOrFetchStreamSlice({
      streamId,
      skip,
      limit,
      viewerId: viewerId ?? undefined,
    });

    // Background fetch for missing users (non-blocking)
    if (cacheMissUserIds.length > 0) {
      // TODO: When TTL is implemented, we can return to void
      await UserStreamApplication.fetchMissingUsersFromNexus({
        cacheMissUserIds,
        viewerId: viewerId ?? undefined,
      });
    }

    return { nextPageIds, skip: nextSkip };
  }

  /**
   * Ensures user details are cached for the given IDs.
   * Checks local cache and fetches any missing users from Nexus.
   *
   * @param userIds - Array of user IDs to ensure are cached
   */
  static async getOrFetchUsers({ userIds }: Pick<TGetOrFetchUsersParams, 'userIds'>): Promise<void> {
    const viewerId = useAuthStore.getState().currentUserPubky;

    await UserStreamApplication.getOrFetchUsers({
      userIds,
      viewerId: viewerId ?? undefined,
    });
  }
}
