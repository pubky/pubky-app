import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { getFollowDependentStreamScope, isSkipPaginatedStream } from '@/models/stream/post/postStream.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserConnectionsModel } from '@/models/user/connections/userConnections';
import { UserConnectionsFields } from '@/models/user/connections/userConnections.schema';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { UserStreamReach } from '@/services/nexus/nexus.types';
import type {
  CreateFollowParams,
  DeleteFollowParams,
  FollowMutationResult,
  InvalidateTimelineStreamsParams,
  UpdateUserStreamsParams,
} from './follow.types';

export class LocalFollowService {
  /**
   * Local follow writes intentionally do not invalidate post streams themselves.
   * Callers requiring cache coherence must use UserApplication, which owns that
   * cleanup so it can run after the homeserver attempt.
   */
  static async create({ follower, followee }: CreateFollowParams): Promise<FollowMutationResult> {
    try {
      let becomingFriends = false;

      await db.transaction(
        'rw',
        [UserCountsModel.table, UserConnectionsModel.table, UserRelationshipsModel.table],
        async () => {
          const rel = await UserRelationshipsModel.findById(followee);
          // Snapshot: whether followee already follows follower
          const isFollowedBy = !!rel?.followed_by;
          // Snapshot: whether we're already following according to relationship model
          const wasFollowing = !!rel?.following;

          // Connections first
          const [addedFollowing, addedFollower] = await Promise.all([
            UserConnectionsModel.createConnection(follower, followee, UserConnectionsFields.FOLLOWING),
            UserConnectionsModel.createConnection(followee, follower, UserConnectionsFields.FOLLOWERS),
          ]);

          // Gate counts by BOTH relationship state AND connection mutations
          // This handles: 1) Nexus-synced data (relationship exists, connections don't)
          //               2) Local-only data (connections exist, relationship may not)
          const shouldIncrementFollowing = !wasFollowing && addedFollowing;
          const shouldIncrementFollowers = !wasFollowing && addedFollower;

          const ops: Promise<unknown>[] = [];
          if (shouldIncrementFollowing) {
            ops.push(UserCountsModel.updateCounts({ userId: follower, countChanges: { following: 1 } }));
          }
          if (shouldIncrementFollowers) {
            ops.push(UserCountsModel.updateCounts({ userId: followee, countChanges: { followers: 1 } }));
          }
          if (isFollowedBy && shouldIncrementFollowing) {
            becomingFriends = true;
            ops.push(
              UserCountsModel.updateCounts({ userId: follower, countChanges: { friends: 1 } }),
              UserCountsModel.updateCounts({ userId: followee, countChanges: { friends: 1 } }),
            );
          }

          // Upsert relationship (create or update)
          if (rel) {
            if (rel.following === false) {
              ops.push(UserRelationshipsModel.update(followee, { following: true }));
            }
          } else {
            ops.push(UserRelationshipsModel.create({ id: followee, following: true, followed_by: false }));
          }

          await Promise.all(ops);
        },
      );

      // Keep denormalized user streams in sync outside the relationship transaction.
      await this.updateUserStreams({
        isFollowing: true,
        follower,
        followee,
        friendshipChanged: becomingFriends,
      });
      return { friendshipChanged: becomingFriends };
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to create follow relationship', {
        service: ErrorService.Local,
        operation: 'createFollow',
        context: { follower, followee },
        cause: error,
      });
    }
  }

  static async delete({ follower, followee }: DeleteFollowParams): Promise<FollowMutationResult> {
    try {
      let breakingFriendship = false;

      await db.transaction(
        'rw',
        [UserCountsModel.table, UserConnectionsModel.table, UserRelationshipsModel.table],
        async () => {
          const rel = await UserRelationshipsModel.findById(followee);
          // Snapshot: whether we were following according to relationship model
          const wasFollowing = !!rel?.following;
          const wasFriends = !!rel?.followed_by && wasFollowing;

          // Connections first
          const [removedFollowing, removedFollower] = await Promise.all([
            UserConnectionsModel.deleteConnection(follower, followee, UserConnectionsFields.FOLLOWING),
            UserConnectionsModel.deleteConnection(followee, follower, UserConnectionsFields.FOLLOWERS),
          ]);

          // Gate counts by BOTH relationship state AND connection mutations
          // This handles: 1) Nexus-synced data (relationship exists, connections don't)
          //               2) Local-only data (connections exist, relationship may not)
          const shouldDecrementFollowing = wasFollowing || removedFollowing;
          const shouldDecrementFollowers = wasFollowing || removedFollower;

          const ops: Promise<unknown>[] = [];
          if (shouldDecrementFollowing) {
            ops.push(UserCountsModel.updateCounts({ userId: follower, countChanges: { following: -1 } }));
          }
          if (shouldDecrementFollowers) {
            ops.push(UserCountsModel.updateCounts({ userId: followee, countChanges: { followers: -1 } }));
          }
          if (wasFriends || (removedFollowing && !!rel?.followed_by)) {
            breakingFriendship = true;
            ops.push(
              UserCountsModel.updateCounts({ userId: follower, countChanges: { friends: -1 } }),
              UserCountsModel.updateCounts({ userId: followee, countChanges: { friends: -1 } }),
            );
          }

          // Upsert relationship (create or update) with following=false
          if (rel) {
            if (rel.following === true) {
              ops.push(UserRelationshipsModel.update(followee, { following: false }));
            }
          } else {
            ops.push(UserRelationshipsModel.create({ id: followee, following: false, followed_by: false }));
          }

          await Promise.all(ops);
        },
      );

      // Keep denormalized user streams in sync outside the relationship transaction.
      await this.updateUserStreams({
        isFollowing: false,
        follower,
        followee,
        friendshipChanged: breakingFriendship,
      });
      return { friendshipChanged: breakingFriendship };
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to delete follow relationship', {
        service: ErrorService.Local,
        operation: 'deleteFollow',
        context: { follower, followee },
        cause: error,
      });
    }
  }

  /**
   * Invalidates cacheable follow-dependent streams. Popularity streams use the
   * same dependency classifier for mounted refreshes, but are never cached.
   */
  static async invalidateTimelineStreams({ includeFriends }: InvalidateTimelineStreamsParams): Promise<void> {
    const invalidated = await LocalStreamPostsService.deleteByIdPredicate((streamId) => {
      if (isSkipPaginatedStream(streamId)) return false;
      const scope = getFollowDependentStreamScope(streamId);
      return scope === 'follow_graph' || (includeFriends && scope === 'friends');
    });

    Logger.debug('Invalidated follow-dependent timeline streams', {
      cached: invalidated.cachedStreamIds,
      unread: invalidated.unreadStreamIds,
      includeFriends,
    });
  }

  /**
   * Update user streams after follow/unfollow.
   *
   * @param isFollowing - True for follow, false for unfollow
   * @param follower - User performing the follow action
   * @param followee - User being followed/unfollowed
   * @param friendshipChanged - Whether this action changes friendship status
   */
  private static async updateUserStreams({
    isFollowing,
    follower,
    followee,
    friendshipChanged,
  }: UpdateUserStreamsParams): Promise<void> {
    const ops: Promise<unknown>[] = [];

    // Select the appropriate stream operation based on action
    const streamOp = isFollowing ? LocalStreamUsersService.prependToStream : LocalStreamUsersService.removeFromStream;

    // Update following/followers streams
    ops.push(
      streamOp.call(LocalStreamUsersService, `${follower}:${UserStreamReach.FOLLOWING}`, [followee]),
      streamOp.call(LocalStreamUsersService, `${followee}:${UserStreamReach.FOLLOWERS}`, [follower]),
    );

    if (isFollowing) {
      ops.push(LocalStreamUsersService.removeFromStream(UserStreamTypes.RECOMMENDED, [followee]));
    }

    // Update friends streams if friendship status changed
    if (friendshipChanged) {
      ops.push(
        streamOp.call(LocalStreamUsersService, `${follower}:${UserStreamReach.FRIENDS}`, [followee]),
        streamOp.call(LocalStreamUsersService, `${followee}:${UserStreamReach.FRIENDS}`, [follower]),
      );
    }

    await Promise.all(ops);
  }
}
