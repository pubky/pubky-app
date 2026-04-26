import * as Core from '@/core';
import { PubkyAppUser } from 'pubky-app-specs';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export class LocalProfileService {
  private constructor() {} // Prevent instantiation

  /**
   * Upserts user details into local database.
   * @param userDetails - The user details to upsert
   * @returns Promise resolving to void
   */
  static async upsertDetails(userDetails: Core.NexusUserDetails): Promise<void> {
    await Core.UserDetailsModel.upsert(userDetails);
  }

  /**
   * Upserts user counts into local database.
   * @param userId - The user ID to upsert counts for
   * @param userCounts - The user counts to upsert
   * @returns Promise resolving to void
   */
  static async upsertCounts(userId: Core.Pubky, userCounts: Core.NexusUserCounts): Promise<void> {
    await Core.UserCountsModel.upsert({
      id: userId,
      ...userCounts,
    });
  }

  /**
   * Updates user details into local database.
   * @param userDetails - The user details to update
   * @returns Promise resolving to void
   */
  static async updateDetails(user: PubkyAppUser, pubky: Core.Pubky): Promise<void> {
    await Core.UserDetailsModel.update(pubky, {
      name: user.name,
      bio: user.bio,
      image: user.image,
      links: user.links ? user.links.map((link) => ({ title: link.title, url: link.url })) : [],
      indexed_at: Date.now(),
    });
  }

  /**
   * Deletes the user account from the local database.
   * @returns Promise resolving to void
   */
  static async deleteAll() {
    try {
      await Core.db.transaction(
        'rw',
        [
          // User tables
          Core.UserCountsModel.table,
          Core.UserDetailsModel.table,
          Core.UserRelationshipsModel.table,
          Core.UserTagsModel.table,
          Core.UserConnectionsModel.table,
          Core.UserTtlModel.table,
          // Post tables
          Core.PostCountsModel.table,
          Core.PostDetailsModel.table,
          Core.PostRelationshipsModel.table,
          Core.PostTagsModel.table,
          Core.PostTtlModel.table,
          // Stream tables
          Core.PostStreamModel.table,
          Core.UserStreamModel.table,
          Core.TagStreamModel.table,
          // Notifications table
          Core.NotificationModel.table,
        ],
        async () => {
          await Promise.all([
            // User tables
            Core.UserCountsModel.clear(),
            Core.UserDetailsModel.clear(),
            Core.UserRelationshipsModel.clear(),
            Core.UserTagsModel.clear(),
            Core.UserConnectionsModel.clear(),
            Core.UserTtlModel.clear(),
            // Post tables
            Core.PostCountsModel.clear(),
            Core.PostDetailsModel.clear(),
            Core.PostRelationshipsModel.clear(),
            Core.PostTagsModel.clear(),
            Core.PostTtlModel.clear(),
            // Stream tables
            Core.PostStreamModel.clear(),
            Core.UserStreamModel.clear(),
            Core.TagStreamModel.clear(),
            // Notifications table
            Core.NotificationModel.clear(),
          ]);
        },
      );
    } catch (error) {
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to clear local user data', {
        service: ErrorService.Local,
        operation: 'deleteAll',
        cause: error,
      });
    }
  }
}
