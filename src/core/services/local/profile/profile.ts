import { PubkyAppUser } from 'pubky-app-specs';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { NotificationModel } from '@/models/notification/notification';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { TagStreamModel } from '@/models/stream/tag/tagStream';
import { UserStreamModel } from '@/models/stream/user/userStream';
import { UserConnectionsModel } from '@/models/user/connections/userConnections';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import type { NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import { getNexusResponseStartedAt } from '@/services/nexus/nexus.utils';

export class LocalProfileService {
  private constructor() {} // Prevent instantiation

  /**
   * Upserts user details into local database.
   *
   * Details-only payloads (the `/details` endpoint, profile creation) carry no
   * `social_graph_status`; the tier is only known from a full user view. A whole-row put
   * would erase a tier persisted earlier, so the existing one is carried over. Read and
   * write share a transaction so a concurrent full-view persist cannot slip in between.
   * Concurrent details requests may use different retry budgets and finish out of order;
   * compare only known Nexus revisions, never the client timestamp used for local
   * avatar updates. A response started before a local edit cannot replace that edit.
   *
   * @param userDetails - The user details to upsert
   * @param source - Profile creation is local; fetched details carry a Nexus revision
   * @returns Promise resolving to void
   */
  static async upsertDetails(userDetails: NexusUserDetails, source: 'nexus' | 'local' = 'nexus'): Promise<void> {
    const fetchStartedAt = getNexusResponseStartedAt(userDetails);
    await db.transaction('rw', [UserDetailsModel.table, UserTtlModel.table], async () => {
      const existing = await UserDetailsModel.findById(userDetails.id);
      if (source === 'nexus') {
        if (existing?.nexusIndexedAt !== undefined && existing.nexusIndexedAt > userDetails.indexed_at) return;
        if (existing?.localUpdatedAt !== undefined) {
          if (fetchStartedAt === undefined || fetchStartedAt <= existing.localUpdatedAt) return;
          if (existing.nexusIndexedAt !== undefined && existing.nexusIndexedAt === userDetails.indexed_at) return;
        }
      }
      const localUpdatedAt = source === 'local' ? Date.now() : undefined;
      const social_graph_status = existing?.social_graph_status;
      await UserDetailsModel.upsert({
        ...userDetails,
        nexusIndexedAt: source === 'local' ? existing?.nexusIndexedAt : userDetails.indexed_at,
        ...(localUpdatedAt === undefined ? {} : { localUpdatedAt }),
        ...(social_graph_status === undefined ? {} : { social_graph_status }),
      });
      if (localUpdatedAt !== undefined) {
        await UserTtlModel.upsert({ id: userDetails.id, lastUpdatedAt: localUpdatedAt });
      }
    });
  }

  /**
   * Upserts user counts into local database.
   * @param userId - The user ID to upsert counts for
   * @param userCounts - The user counts to upsert
   * @returns Promise resolving to void
   */
  static async upsertCounts(userId: Pubky, userCounts: NexusUserCounts): Promise<void> {
    await UserCountsModel.upsert({
      id: userId,
      ...userCounts,
    });
  }

  /**
   * Updates user details into local database.
   * @param userDetails - The user details to update
   * @returns Promise resolving to void
   */
  static async updateDetails(user: PubkyAppUser, pubky: Pubky): Promise<void> {
    await db.transaction('rw', [UserDetailsModel.table, UserTtlModel.table], async () => {
      const now = Date.now();
      await UserDetailsModel.update(pubky, {
        name: user.name,
        bio: user.bio,
        image: user.image,
        links: user.links ? user.links.map((link) => ({ title: link.title, url: link.url })) : [],
        indexed_at: now,
        localUpdatedAt: now,
        // Writing a profile revives a tombstone on Nexus, so the cached row must stop reading as one.
        deleted: false,
      });
      await UserTtlModel.upsert({ id: pubky, lastUpdatedAt: now });
    });
  }

  /**
   * Deletes the user account from the local database.
   * @returns Promise resolving to void
   */
  static async deleteAll() {
    try {
      await db.transaction(
        'rw',
        [
          // User tables
          UserCountsModel.table,
          UserDetailsModel.table,
          UserRelationshipsModel.table,
          UserTagsModel.table,
          UserConnectionsModel.table,
          UserTtlModel.table,
          // Post tables
          PostCountsModel.table,
          PostDetailsModel.table,
          PostRelationshipsModel.table,
          PostTagsModel.table,
          PostTtlModel.table,
          // Stream tables
          PostStreamModel.table,
          UserStreamModel.table,
          TagStreamModel.table,
          // Notifications table
          NotificationModel.table,
        ],
        async () => {
          await Promise.all([
            // User tables
            UserCountsModel.clear(),
            UserDetailsModel.clear(),
            UserRelationshipsModel.clear(),
            UserTagsModel.clear(),
            UserConnectionsModel.clear(),
            UserTtlModel.clear(),
            // Post tables
            PostCountsModel.clear(),
            PostDetailsModel.clear(),
            PostRelationshipsModel.clear(),
            PostTagsModel.clear(),
            PostTtlModel.clear(),
            // Stream tables
            PostStreamModel.clear(),
            UserStreamModel.clear(),
            TagStreamModel.clear(),
            // Notifications table
            NotificationModel.clear(),
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
