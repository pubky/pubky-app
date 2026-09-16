import { detectModerationFromTags } from '@/application/moderation/moderation.utils';
import { db } from '@/database/franky/franky';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { ModerationModel } from '@/models/moderation/moderation';
import { type ModerationModelSchema, ModerationType } from '@/models/moderation/moderation.schema';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import { UserStreamModel } from '@/models/stream/user/userStream';
import type { UserStreamId } from '@/models/stream/user/userStream.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import type { UserDetailsModelSchema } from '@/models/user/details/userDetails.schema';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import type { TUserStreamUpsertParams } from '@/services/local/stream/users/users.types';
import { LocalTagCacheService, type TagPreviewGuard } from '@/services/local/tag/tag-cache';
import {
  NexusSocialGraphStatus,
  type NexusTag,
  type NexusUser,
  type NexusUserCounts,
  type NexusUserRelationship,
} from '@/services/nexus/nexus.types';
import { getNexusResponseStartedAt } from '@/services/nexus/nexus.utils';

/** Tag-cache guard plus the fetch stamp used to keep local follow writes. */
export type PersistUsersGuard = TagPreviewGuard & {
  fetchStartedAt?: number;
};

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
   * @param viewerId - When set, a missing relationship row is also a cache miss (#1803)
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
   * @param tagGuard - Tag-cache guard; `viewerId` is required to persist relationship rows.
   *   `fetchStartedAt` skips relationship rows whose user TTL was written at or after that
   *   time so a local follow/unfollow during the request is not overwritten.
   * @returns Array of user IDs (Pubky)
   */
  static async persistUsers(users: NexusUser[], tagGuard: PersistUsersGuard = {}): Promise<Pubky[]> {
    tagGuard = { ...tagGuard, validatedAt: tagGuard.validatedAt ?? getNexusResponseStartedAt(users) };
    if (tagGuard.isCurrent && !tagGuard.isCurrent()) return [];
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
      LocalTagCacheService.savePreviews('user', userTags, tagGuard, userCounts),
      this.persistRelationshipsAndTtl(userIds, userRelationships, userTtl, tagGuard),
      // Persist moderation records for flagged profiles
      userModerations.length > 0 ? ModerationModel.bulkSave(userModerations) : Promise.resolve(),
    ]);

    return userIds;
  }

  /**
   * Guest / viewer-less Nexus payloads skip the relationship row (#1803).
   * When `fetchStartedAt` is set, a user TTL written at or after that stamp
   * means a local follow landed during the request — keep that row.
   */
  private static async persistRelationshipsAndTtl(
    userIds: Pubky[],
    userRelationships: NexusModelTuple<NexusUserRelationship>[],
    userTtl: NexusModelTuple<{ lastUpdatedAt: number }>[],
    tagGuard: PersistUsersGuard,
  ): Promise<void> {
    if (!tagGuard.viewerId) {
      await UserTtlModel.bulkSave(userTtl);
      return;
    }

    await db.transaction('rw', [UserRelationshipsModel.table, UserTtlModel.table], async () => {
      let toSave = userRelationships;
      const fetchStartedAt = tagGuard.fetchStartedAt;
      if (fetchStartedAt !== undefined) {
        const existingTtl = await UserTtlModel.findByIds(userIds);
        const skipIds = new Set(existingTtl.filter((row) => row.lastUpdatedAt >= fetchStartedAt).map((row) => row.id));
        if (skipIds.size > 0) {
          Logger.debug('LocalStreamUsersService: Skipped relationship rows written since the fetch started', {
            ids: Array.from(skipIds).slice(0, 5),
            count: skipIds.size,
          });
          toSave = userRelationships.filter(([id]) => !skipIds.has(id));
        }
      }
      await Promise.all([
        toSave.length > 0 ? UserRelationshipsModel.bulkSave(toSave) : Promise.resolve(),
        UserTtlModel.bulkSave(userTtl),
      ]);
    });
  }
}
