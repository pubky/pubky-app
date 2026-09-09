import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserConnectionsModel } from '@/models/user/connections/userConnections';
import { UserConnectionsFields } from '@/models/user/connections/userConnections.schema';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { postStreamDirtyRegistry } from '@/services/local/stream/posts/postStreamDirtyRegistry';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { UserStreamReach } from '@/services/nexus/nexus.types';
import type { CreateFollowParams, DeleteFollowParams, UpdateUserStreamsParams } from './follow.types';

export class LocalFollowService {
  static async create({ follower, followee }: CreateFollowParams) {
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

      // Update user streams and mark dependent post-stream caches dirty (outside transaction)
      await this.updateUserStreams({
        isFollowing: true,
        follower,
        followee,
        friendshipChanged: becomingFriends,
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to create follow relationship', {
        service: ErrorService.Local,
        operation: 'createFollow',
        context: { follower, followee },
        cause: error,
      });
    }
  }

  static async delete({ follower, followee }: DeleteFollowParams) {
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

      // Update user streams and mark dependent post-stream caches dirty (outside transaction)
      await this.updateUserStreams({
        isFollowing: false,
        follower,
        followee,
        friendshipChanged: breakingFriendship,
      });
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
   * Update user streams after follow/unfollow and mark dependent post-stream
   * caches dirty.
   *
   * Post streams are NOT deleted here: mounted feeds keep their current
   * membership and scroll position, and every follow-dependent stream rebuilds
   * from Nexus on its next initial load (navigation back or pull-to-refresh)
   * via the dirty registry (#2294).
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

    // Defer post-stream cache invalidation to each stream's next initial load.
    // Friends membership only changes on an actual friendship transition.
    postStreamDirtyRegistry.markDirty('follow_graph');
    if (friendshipChanged) {
      postStreamDirtyRegistry.markDirty('friends');
    }
    Logger.debug('Marked follow-dependent post streams dirty', { friendshipChanged });

    await Promise.all(ops);
  }
}
