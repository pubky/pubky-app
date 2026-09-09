import { detectModerationFromTags } from '@/application/moderation/moderation.utils';
import { db } from '@/database/franky/franky';
import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';
import type { Pubky } from '@/models/models.types';
import { ModerationModel } from '@/models/moderation/moderation';
import { type ModerationModelSchema, ModerationType } from '@/models/moderation/moderation.schema';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import { UserStreamModel } from '@/models/stream/user/userStream';
import type { UserStreamId } from '@/models/stream/user/userStream.types';
import { UserConnectionsModel } from '@/models/user/connections/userConnections';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import type { UserDetailsModelSchema } from '@/models/user/details/userDetails.schema';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import type { TUserStreamUpsertParams } from '@/services/local/stream/users/users.types';
import {
  NexusSocialGraphStatus,
  type NexusTag,
  type NexusUser,
  type NexusUserCounts,
  type NexusUserRelationship,
} from '@/services/nexus/nexus.types';

const KNOWN_SOCIAL_GRAPH_STATUSES = new Set<string>(Object.values(NexusSocialGraphStatus));

/**
 * Nexus decides the badge tiers; a value this build does not know (a new tier, a renamed
 * one) is treated as "no ranking" so the badge hides instead of rendering an empty pill.
 */
function toSocialGraphStatus(value: NexusUser['social_graph_status']): NexusSocialGraphStatus | null {
  return value && KNOWN_SOCIAL_GRAPH_STATUSES.has(value) ? value : null;
}

/**
 * Local Stream Users Service
 *
 * Simple service to manage user stream IDs in IndexedDB.
 * Only stores arrays of user IDs (Pubky), no user data.
 * Handles followers, following, friends, and other user stream types.
 */
export class LocalStreamUsersService {
  private constructor() {}

  /**
   * Save or update a stream of user IDs
   * @param streamId - Composite ID in format 'userId:streamType' (e.g., 'user-ABC:followers')
   */
  static async upsert({ streamId, stream }: TUserStreamUpsertParams): Promise<void> {
    await UserStreamModel.upsert(streamId, stream);
  }

  /**
   * Get a stream of user IDs by stream ID
   * @param streamId - Composite ID in format 'userId:streamType' (e.g., 'user-ABC:followers')
   */
  static async findById(streamId: string): Promise<{ stream: Pubky[] } | null> {
    return await UserStreamModel.findById(streamId);
  }

  /**
   * Delete a user stream from cache
   * @param streamId - Composite ID in format 'userId:streamType' (e.g., 'user-ABC:followers')
   */
  static async deleteById(streamId: string): Promise<void> {
    await UserStreamModel.deleteById(streamId);
  }

  /**
   * Prepend user ID(s) to a stream
   * Only adds users if not already present
   *
   * @param streamId - The stream to prepend to
   * @param userIds - The user ID(s) to prepend
   */
  static async prependToStream(streamId: UserStreamId, userIds: Pubky[]): Promise<void> {
    await UserStreamModel.prependItems(streamId, userIds);
  }

  /**
   * Remove user ID(s) from a stream
   *
   * @param streamId - The stream to remove from
   * @param userIds - The user ID(s) to remove
   */
  static async removeFromStream(streamId: UserStreamId, userIds: Pubky[]): Promise<void> {
    await UserStreamModel.removeItems(streamId, userIds);
  }

  /**
   * Find which users are not yet persisted in cache
   * Used to identify missing user data that needs to be fetched
   *
   * @param userIds - Array of user IDs to check
   * @returns Array of user IDs that are not persisted in cache
   */
  static async getNotPersistedUsersInCache(userIds: Pubky[], viewerId?: Pubky): Promise<Pubky[]> {
    const [details, relationships] = await Promise.all([
      UserDetailsModel.findByIdsPreserveOrder(userIds),
      viewerId ? UserRelationshipsModel.findByIds(userIds) : Promise.resolve([]),
    ]);
    const hydratedRelationships = new Set(relationships.map((row) => row.id));
    return userIds.filter((id, index) => details[index] === undefined || (viewerId && !hydratedRelationships.has(id)));
  }

  /**
   * Persist user data to normalized tables
   * Separates user details, counts, tags, relationships, and TTL records
   * Also detects and persists moderation status for flagged profiles
   *
   * Relationship rows (`following` / `followed_by`) are only meaningful relative to a viewer.
   * When the batch was fetched without a `viewerId`, Nexus returns a viewer-agnostic
   * relationship, so the row is skipped instead of caching "unknown" as "not following".
   * A missing row reads as a cache miss and triggers a viewer-aware fetch (#1803).
   *
   * @param users - Array of users from Nexus API
   * @param viewerId - The signed-in user the batch was fetched for, when available
   * @returns Array of user IDs (Pubky)
   */
  static async persistUsers(users: NexusUser[], viewerId?: Pubky | null): Promise<Pubky[]> {
    const userCounts: NexusModelTuple<NexusUserCounts>[] = [];
    const userRelationships: NexusModelTuple<NexusUserRelationship>[] = [];
    const userTags: NexusModelTuple<NexusTag[]>[] = [];
    const userDetails: UserDetailsModelSchema[] = [];
    const userModerations: ModerationModelSchema[] = [];
    const userTtl: NexusModelTuple<{ lastUpdatedAt: number }>[] = [];

    const userIds: Pubky[] = [];
    const now = Date.now();

    for (const user of users) {
      const userId = user.details.id;
      userIds.push(userId);
      userCounts.push([userId, user.counts]);
      userRelationships.push([userId, user.relationship]);
      userTags.push([userId, user.tags]);
      // The badge tier lives on the Nexus user view, not on `details`; it rides on the
      // details row so profile reads stay a single lookup. An absent field (older Nexus)
      // is stored as `null` so readers treat it as "no ranking" rather than "never fetched".
      userDetails.push({ ...user.details, social_graph_status: toSocialGraphStatus(user.social_graph_status) });
      userTtl.push([userId, { lastUpdatedAt: now }]);

      // Detect moderation from user tags
      const isModerated = detectModerationFromTags(user.tags);
      if (isModerated) {
        userModerations.push({
          id: userId,
          type: ModerationType.PROFILE,
          is_blurred: true,
          created_at: Date.now(),
        });
      }
    }

    // Bulk save to normalized tables
    await Promise.all([
      UserDetailsModel.bulkSave(userDetails),
      this.persistViewerData(userCounts, userRelationships, viewerId),
      UserTagsModel.bulkSave(userTags),
      UserTtlModel.bulkSave(userTtl),
      // Persist moderation records for flagged profiles
      userModerations.length > 0 ? ModerationModel.bulkSave(userModerations) : Promise.resolve(),
    ]);

    return userIds;
  }

  private static async persistViewerData(
    counts: NexusModelTuple<NexusUserCounts>[],
    relationships: NexusModelTuple<NexusUserRelationship>[],
    viewerId?: Pubky | null,
  ): Promise<void> {
    try {
      // Serialize with follow reconciliation and optimistic mutations. Read the authority inside
      // the transaction so even a Nexus request begun before the SSE event cannot overwrite it.
      await db.transaction(
        'rw',
        [UserConnectionsModel.table, UserRelationshipsModel.table, UserCountsModel.table],
        async () => {
          const connections = viewerId ? await UserConnectionsModel.findById(viewerId) : null;
          const following = connections?.followingSyncedAt !== undefined ? new Set(connections.following) : null;
          // A viewerless request can have started before session restoration and finish after sync.
          const countConnections = viewerId ? [] : await UserConnectionsModel.findByIds(counts.map(([id]) => id));
          const followingCounts = new Map(
            countConnections
              .filter((row) => row.followingSyncedAt !== undefined)
              .map((row) => [row.id, row.following.length]),
          );
          if (following && viewerId) followingCounts.set(viewerId, following.size);
          if (viewerId) {
            const local = following ? [] : await UserRelationshipsModel.findByIds(relationships.map(([id]) => id));
            const overrides = new Map(local.filter((row) => row.followingBy === viewerId).map((row) => [row.id, row]));
            await UserRelationshipsModel.bulkSave(
              relationships.map(([id, relationship]) => {
                const override = overrides.get(id);
                return [
                  id,
                  {
                    ...relationship,
                    ...(following
                      ? { following: following.has(id) }
                      : override
                        ? { following: override.following, followingBy: viewerId }
                        : {}),
                  },
                ];
              }),
            );
          }
          await UserCountsModel.bulkSave(
            counts.map(([id, value]) => [
              id,
              followingCounts.has(id) ? { ...value, following: followingCounts.get(id)! } : value,
            ]),
          );
        },
      );
    } catch (error) {
      throw toAppError(error, ErrorService.Local, 'persistViewerData');
    }
  }
}
