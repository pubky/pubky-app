import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UserStreamModel } from '@/models/stream/user/userStream';
import { UserConnectionsModel } from '@/models/user/connections/userConnections';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { LocalFollowService } from '@/services/local/follow/follow';
import type { NexusUserCounts } from '@/services/nexus/nexus.types';
const DEFAULT_USER_COUNTS: NexusUserCounts = {
  tagged: 0,
  tags: 0,
  unique_tags: 0,
  posts: 0,
  replies: 0,
  following: 0,
  followers: 0,
  friends: 0,
  bookmarks: 0,
};

const userA = 'pubky_user_A' as Pubky;
const userB = 'pubky_user_B' as Pubky;
const userC = 'pubky_user_C' as Pubky;
const userD = 'pubky_user_D' as Pubky;

async function clearUserTables() {
  await db.transaction(
    'rw',
    [UserCountsModel.table, UserConnectionsModel.table, UserRelationshipsModel.table],
    async () => {
      await UserCountsModel.table.clear();
      await UserConnectionsModel.table.clear();
      await UserRelationshipsModel.table.clear();
    },
  );
}

describe('LocalFollowService.create', () => {
  beforeEach(async () => {
    await db.initialize();
    await clearUserTables();

    // Precreate counts rows so updates succeed deterministically
    await db.transaction('rw', [UserCountsModel.table], async () => {
      await UserCountsModel.table.bulkAdd([
        { id: userA, ...DEFAULT_USER_COUNTS },
        { id: userB, ...DEFAULT_USER_COUNTS },
      ]);
    });
  });

  it('increments following and followers and updates connections', async () => {
    await LocalFollowService.create({ follower: userA, followee: userB });

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    expect(aCounts?.following ?? 0).toBe(1);
    expect(bCounts?.followers ?? 0).toBe(1);
    expect(aConn?.following ?? []).toContain(userB);
    expect(bConn?.followers ?? []).toContain(userA);
  });

  it('runs all writes atomically (rollback when a write fails)', async () => {
    const spy = vi.spyOn(UserConnectionsModel, 'createConnection').mockRejectedValueOnce(new Error('fail'));

    await expect(LocalFollowService.create({ follower: userA, followee: userB })).rejects.toThrow();

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    // Counts rows are precreated in beforeEach; ensure values were not modified
    expect(aCounts?.following ?? 0).toBe(0);
    expect(bCounts?.followers ?? 0).toBe(0);
    expect(aConn).toBeUndefined();
    expect(bConn).toBeUndefined();

    spy.mockRestore();
  });

  it('does not increment counts when connection already exists (idempotent)', async () => {
    // Prepopulate existing follow relation in connections and counts
    await db.transaction('rw', [UserConnectionsModel.table, UserCountsModel.table], async () => {
      await UserConnectionsModel.create({ id: userA, following: [userB], followers: [] });
      await UserConnectionsModel.create({ id: userB, following: [], followers: [userA] });

      await UserCountsModel.update(userA, { following: 1 });
      await UserCountsModel.update(userB, { followers: 1 });
    });

    await LocalFollowService.create({ follower: userA, followee: userB });

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    // Counts unchanged
    expect(aCounts?.following ?? 0).toBe(1);
    expect(bCounts?.followers ?? 0).toBe(1);
    // No duplicate connections
    expect((aConn?.following ?? []).filter((x) => x === userB).length).toBe(1);
    expect((bConn?.followers ?? []).filter((x) => x === userA).length).toBe(1);
  });

  it('double follow does not increment counts twice or duplicate connections', async () => {
    await LocalFollowService.create({ follower: userA, followee: userB });
    await LocalFollowService.create({ follower: userA, followee: userB });

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    // Should remain 1 if gated by mutation
    expect(aCounts?.following ?? 0).toBe(1);
    expect(bCounts?.followers ?? 0).toBe(1);
    // No duplicate entries
    expect((aConn?.following ?? []).filter((x) => x === userB).length).toBe(1);
    expect((bConn?.followers ?? []).filter((x) => x === userA).length).toBe(1);
  });

  it('rolls back connections and counts if a counts write fails', async () => {
    const spy = vi.spyOn(UserCountsModel, 'updateCounts').mockRejectedValueOnce(new Error('counts-fail'));

    try {
      await LocalFollowService.create({ follower: userA, followee: userB });
      expect.unreachable('should throw');
    } catch (err: unknown) {
      const e = err as { message?: string; cause?: { message?: string } };
      expect(e.message ?? '').toMatch('Failed to create follow relationship');
      expect(e.cause?.message ?? '').toMatch('counts-fail');
    }

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    // Nothing should have changed due to rollback
    expect(aCounts?.following ?? 0).toBe(0);
    expect(bCounts?.followers ?? 0).toBe(0);
    expect(aConn).toBeUndefined();
    expect(bConn).toBeUndefined();

    spy.mockRestore();
  });

  it('increments friends only on first follow when followed_by=true', async () => {
    // Relationship snapshot says B follows A already
    await UserRelationshipsModel.create({ id: userB, following: false, followed_by: true });

    // First follow should create following and bump friends for both
    await LocalFollowService.create({ follower: userA, followee: userB });
    // Second follow should be a no-op for friends and counts
    await LocalFollowService.create({ follower: userA, followee: userB });

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    // Friends incremented only once
    expect(aCounts?.friends ?? 0).toBe(1);
    expect(bCounts?.friends ?? 0).toBe(1);
    // Following/followers only once
    expect(aCounts?.following ?? 0).toBe(1);
    expect(bCounts?.followers ?? 0).toBe(1);
    // No duplicate connections
    expect((aConn?.following ?? []).filter((x) => x === userB).length).toBe(1);
    expect((bConn?.followers ?? []).filter((x) => x === userA).length).toBe(1);
  });

  it('does not upsert friends counts when rows are missing (still updates connections)', async () => {
    await UserRelationshipsModel.create({ id: userB, following: false, followed_by: true });

    // Ensure no counts rows exist
    await db.transaction('rw', [UserCountsModel.table], async () => {
      await UserCountsModel.table.clear();
    });

    await LocalFollowService.create({ follower: userA, followee: userB });

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    // No upserts for counts/friends
    expect(aCounts).toBeUndefined();
    expect(bCounts).toBeUndefined();
    // Connections created
    expect(aConn?.following ?? []).toContain(userB);
    expect(bConn?.followers ?? []).toContain(userA);
  });

  it('upserts relationship on first follow and sets following=true', async () => {
    // No relationship exists for userB
    await LocalFollowService.create({ follower: userA, followee: userB });

    const rel = await UserRelationshipsModel.table.get(userB);
    expect(rel).toBeDefined();
    expect(rel?.following).toBe(true);
    // followed_by should default false (or absent) unless upstream sets it later
    expect(rel?.followed_by ?? false).toBe(false);
  });

  it('updates existing relationship to following=true without changing followed_by', async () => {
    await UserRelationshipsModel.create({ id: userB, following: false, followed_by: true });

    await LocalFollowService.create({ follower: userA, followee: userB });

    const rel = await UserRelationshipsModel.table.get(userB);
    expect(rel).toBeDefined();
    expect(rel?.following).toBe(true);
    // Preserve followed_by flag
    expect(rel?.followed_by).toBe(true);
  });

  it('does not upsert counts when rows are missing; still updates connections', async () => {
    // Ensure no counts rows exist
    await db.transaction('rw', [UserCountsModel.table], async () => {
      await UserCountsModel.table.clear();
    });

    await LocalFollowService.create({ follower: userA, followee: userB });

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    // Counts should remain missing (no upsert)
    expect(aCounts).toBeUndefined();
    expect(bCounts).toBeUndefined();
    // Connections should reflect follow
    expect(aConn?.following ?? []).toContain(userB);
    expect(bConn?.followers ?? []).toContain(userA);
  });
});

describe('LocalFollowService.delete', () => {
  beforeEach(async () => {
    await db.initialize();
    await clearUserTables();

    // Precreate counts rows so updates succeed deterministically
    await db.transaction('rw', [UserCountsModel.table], async () => {
      await UserCountsModel.table.bulkAdd([
        { id: userA, ...DEFAULT_USER_COUNTS, following: 1, friends: 0 },
        { id: userB, ...DEFAULT_USER_COUNTS, followers: 1, friends: 0 },
      ]);
    });

    // Precreate connections simulating existing follow relationship
    await db.transaction('rw', [UserConnectionsModel.table], async () => {
      await UserConnectionsModel.create({
        id: userA,
        following: [userB],
        followers: [],
      });
      await UserConnectionsModel.create({
        id: userB,
        following: [],
        followers: [userA],
      });
    });
  });

  it('decrements following and followers and removes connections', async () => {
    await LocalFollowService.delete({ follower: userA, followee: userB });

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    expect(aCounts?.following ?? 0).toBe(0);
    expect(bCounts?.followers ?? 0).toBe(0);
    expect(aConn?.following ?? []).not.toContain(userB);
    expect(bConn?.followers ?? []).not.toContain(userA);
  });

  it('decrements friends when breaking mutual relationship and preserves other connections', async () => {
    // Update counts to reflect existing friendship
    await db.transaction('rw', [UserCountsModel.table], async () => {
      await UserCountsModel.update(userA, { friends: 1 });
      await UserCountsModel.update(userB, { friends: 1 });
    });

    // Seed relationships showing mutual follow (friends)
    await UserRelationshipsModel.create({ id: userB, following: true, followed_by: true });

    // Add additional connections
    await db.transaction('rw', [UserConnectionsModel.table], async () => {
      await UserConnectionsModel.update(userA, {
        following: [userB, userC, userD],
        followers: [userD],
      });
      await UserConnectionsModel.update(userB, {
        following: [userA, userC],
        followers: [userA, userD],
      });
    });

    await LocalFollowService.delete({ follower: userA, followee: userB });

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    // Friends decrements for both sides
    expect(aCounts?.friends ?? 0).toBe(0);
    expect(bCounts?.friends ?? 0).toBe(0);
    // Following / followers decrement by 1
    expect(aCounts?.following ?? 0).toBe(0);
    expect(bCounts?.followers ?? 0).toBe(0);

    // User B removed from A's following, A removed from B's followers
    const aFollowing = aConn?.following ?? [];
    const bFollowers = bConn?.followers ?? [];
    expect(aFollowing).not.toContain(userB);
    expect(bFollowers).not.toContain(userA);
    // Other entries preserved
    expect(aFollowing).toEqual([userC, userD]);
    expect(bFollowers).toEqual([userD]);
  });

  it('runs all writes atomically (rollback when a write fails)', async () => {
    const spy = vi.spyOn(UserConnectionsModel, 'deleteConnection').mockRejectedValueOnce(new Error('fail'));

    await expect(LocalFollowService.delete({ follower: userA, followee: userB })).rejects.toThrow();

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    // Counts remain unchanged (still showing existing follow)
    expect(aCounts?.following ?? 0).toBe(1);
    expect(bCounts?.followers ?? 0).toBe(1);
    // Connections remain unchanged
    expect(aConn?.following ?? []).toContain(userB);
    expect(bConn?.followers ?? []).toContain(userA);

    spy.mockRestore();
  });

  it('clamps counts to zero on unfollow even if counts are already zero', async () => {
    // Adjust counts to zero; connections already precreated in beforeEach
    await db.transaction('rw', [UserCountsModel.table], async () => {
      await UserCountsModel.update(userA, { following: 0 });
      await UserCountsModel.update(userB, { followers: 0 });
    });

    await LocalFollowService.delete({ follower: userA, followee: userB });

    const [aCounts, bCounts] = await Promise.all([UserCountsModel.table.get(userA), UserCountsModel.table.get(userB)]);

    // Should clamp at zero, not negative
    expect(aCounts?.following ?? 0).toBe(0);
    expect(bCounts?.followers ?? 0).toBe(0);
  });

  it('does not upsert counts on unfollow when rows are missing', async () => {
    // Clear counts; connections already exist from beforeEach
    await db.transaction('rw', [UserCountsModel.table], async () => {
      await UserCountsModel.table.clear();
    });

    await LocalFollowService.delete({ follower: userA, followee: userB });

    const [aCounts, bCounts, aConn, bConn] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
      UserConnectionsModel.table.get(userA),
      UserConnectionsModel.table.get(userB),
    ]);

    // No upsert performed
    expect(aCounts).toBeUndefined();
    expect(bCounts).toBeUndefined();
    // Connections removed
    expect(aConn?.following ?? []).not.toContain(userB);
    expect(bConn?.followers ?? []).not.toContain(userA);
  });
});

describe('LocalFollowService - Stream Updates', () => {
  beforeEach(async () => {
    await db.initialize();
    await clearUserTables();

    // Clear stream tables
    await db.transaction('rw', [UserStreamModel.table, PostStreamModel.table, UserCountsModel.table], async () => {
      await UserStreamModel.table.clear();
      await PostStreamModel.table.clear();
      // Precreate counts rows
      await UserCountsModel.table.bulkAdd([
        { id: userA, ...DEFAULT_USER_COUNTS },
        { id: userB, ...DEFAULT_USER_COUNTS },
      ]);
    });
  });

  describe('follow - user stream updates', () => {
    it('adds followee to follower following stream', async () => {
      await LocalFollowService.create({ follower: userA, followee: userB });

      const followingStream = await UserStreamModel.findById(`${userA}:following`);
      expect(followingStream?.stream).toContain(userB);
    });

    it('adds follower to followee followers stream', async () => {
      await LocalFollowService.create({ follower: userA, followee: userB });

      const followersStream = await UserStreamModel.findById(`${userB}:followers`);
      expect(followersStream?.stream).toContain(userA);
    });

    it('adds both users to friends streams when becoming friends', async () => {
      // Setup: B already follows A
      await UserRelationshipsModel.create({ id: userB, following: false, followed_by: true });

      await LocalFollowService.create({ follower: userA, followee: userB });

      const [aFriendsStream, bFriendsStream] = await Promise.all([
        UserStreamModel.findById(`${userA}:friends`),
        UserStreamModel.findById(`${userB}:friends`),
      ]);

      expect(aFriendsStream?.stream).toContain(userB);
      expect(bFriendsStream?.stream).toContain(userA);
    });

    it('does not add to friends stream when not mutual follow', async () => {
      await LocalFollowService.create({ follower: userA, followee: userB });

      const [aFriendsStream, bFriendsStream] = await Promise.all([
        UserStreamModel.findById(`${userA}:friends`),
        UserStreamModel.findById(`${userB}:friends`),
      ]);

      expect(aFriendsStream).toBeNull();
      expect(bFriendsStream).toBeNull();
    });

    it('does not duplicate entries when following same user twice', async () => {
      await LocalFollowService.create({ follower: userA, followee: userB });
      await LocalFollowService.create({ follower: userA, followee: userB });

      const followingStream = await UserStreamModel.findById(`${userA}:following`);
      const followersStream = await UserStreamModel.findById(`${userB}:followers`);

      expect(followingStream?.stream.filter((id) => id === userB).length).toBe(1);
      expect(followersStream?.stream.filter((id) => id === userA).length).toBe(1);
    });
  });

  describe('unfollow - user stream updates', () => {
    beforeEach(async () => {
      // Setup existing follow relationship with streams
      await db.transaction('rw', [UserConnectionsModel.table, UserCountsModel.table], async () => {
        await UserConnectionsModel.create({ id: userA, following: [userB], followers: [] });
        await UserConnectionsModel.create({ id: userB, following: [], followers: [userA] });
        await UserCountsModel.update(userA, { following: 1 });
        await UserCountsModel.update(userB, { followers: 1 });
      });

      // Setup streams
      await db.transaction('rw', [UserStreamModel.table], async () => {
        await UserStreamModel.upsert(`${userA}:following`, [userB]);
        await UserStreamModel.upsert(`${userB}:followers`, [userA]);
      });
    });

    it('removes followee from follower following stream', async () => {
      await LocalFollowService.delete({ follower: userA, followee: userB });

      const followingStream = await UserStreamModel.findById(`${userA}:following`);
      expect(followingStream?.stream).not.toContain(userB);
    });

    it('removes follower from followee followers stream', async () => {
      await LocalFollowService.delete({ follower: userA, followee: userB });

      const followersStream = await UserStreamModel.findById(`${userB}:followers`);
      expect(followersStream?.stream).not.toContain(userA);
    });

    it('removes both users from friends streams when breaking friendship', async () => {
      // Setup mutual follow (friends)
      await UserRelationshipsModel.create({ id: userB, following: true, followed_by: true });
      await db.transaction('rw', [UserStreamModel.table, UserCountsModel.table], async () => {
        await UserStreamModel.upsert(`${userA}:friends`, [userB]);
        await UserStreamModel.upsert(`${userB}:friends`, [userA]);
        await UserCountsModel.update(userA, { friends: 1 });
        await UserCountsModel.update(userB, { friends: 1 });
      });

      await LocalFollowService.delete({ follower: userA, followee: userB });

      const [aFriendsStream, bFriendsStream] = await Promise.all([
        UserStreamModel.findById(`${userA}:friends`),
        UserStreamModel.findById(`${userB}:friends`),
      ]);

      expect(aFriendsStream?.stream).not.toContain(userB);
      expect(bFriendsStream?.stream).not.toContain(userA);
    });

    it('does not modify friends streams when not breaking friendship', async () => {
      await LocalFollowService.delete({ follower: userA, followee: userB });

      const [aFriendsStream, bFriendsStream] = await Promise.all([
        UserStreamModel.findById(`${userA}:friends`),
        UserStreamModel.findById(`${userB}:friends`),
      ]);

      // Streams should not exist if they were never created
      expect(aFriendsStream).toBeNull();
      expect(bFriendsStream).toBeNull();
    });
  });

  // Note: TypeScript TS2684 errors are suppressed because BaseStreamModel generic types
  // have complex this-context requirements that don't affect runtime behavior
  describe('timeline stream invalidation', () => {
    beforeEach(async () => {
      // Seed some timeline streams (only TIMELINE streams are cached, not POPULARITY/engagement)
      await db.transaction('rw', [PostStreamModel.table], async () => {
        // @ts-expect-error - BaseStreamModel generic type constraint
        await PostStreamModel.upsert(PostStreamTypes.TIMELINE_FOLLOWING_ALL, ['post1', 'post2']);
        // @ts-expect-error - BaseStreamModel generic type constraint
        await PostStreamModel.upsert(PostStreamTypes.TIMELINE_FOLLOWING_SHORT, ['post1']);
        // @ts-expect-error - BaseStreamModel generic type constraint
        await PostStreamModel.upsert(PostStreamTypes.TIMELINE_FRIENDS_ALL, ['post3', 'post4']);
        // @ts-expect-error - BaseStreamModel generic type constraint
        await PostStreamModel.upsert(PostStreamTypes.TIMELINE_FRIENDS_SHORT, ['post3']);
      });
    });

    it('invalidates following timeline streams on follow', async () => {
      await LocalFollowService.create({ follower: userA, followee: userB });

      // Following streams should be deleted
      const [timelineAll, timelineShort] = await Promise.all([
        // @ts-expect-error - BaseStreamModel generic type constraint
        PostStreamModel.findById(PostStreamTypes.TIMELINE_FOLLOWING_ALL),
        // @ts-expect-error - BaseStreamModel generic type constraint
        PostStreamModel.findById(PostStreamTypes.TIMELINE_FOLLOWING_SHORT),
      ]);

      expect(timelineAll).toBeNull();
      expect(timelineShort).toBeNull();
    });

    it('does not invalidate friends streams when not becoming friends', async () => {
      await LocalFollowService.create({ follower: userA, followee: userB });

      // Friends streams should still exist
      const [friendsAll, friendsShort] = await Promise.all([
        // @ts-expect-error - BaseStreamModel generic type constraint
        PostStreamModel.findById(PostStreamTypes.TIMELINE_FRIENDS_ALL),
        // @ts-expect-error - BaseStreamModel generic type constraint
        PostStreamModel.findById(PostStreamTypes.TIMELINE_FRIENDS_SHORT),
      ]);

      expect(friendsAll?.stream).toEqual(['post3', 'post4']);
      expect(friendsShort?.stream).toEqual(['post3']);
    });

    it('invalidates both following and friends streams when becoming friends', async () => {
      // Setup: B already follows A
      await UserRelationshipsModel.create({ id: userB, following: false, followed_by: true });

      await LocalFollowService.create({ follower: userA, followee: userB });

      // All timeline streams should be deleted
      const [followingAll, friendsAll] = await Promise.all([
        // @ts-expect-error - BaseStreamModel generic type constraint
        PostStreamModel.findById(PostStreamTypes.TIMELINE_FOLLOWING_ALL),
        // @ts-expect-error - BaseStreamModel generic type constraint
        PostStreamModel.findById(PostStreamTypes.TIMELINE_FRIENDS_ALL),
      ]);

      expect(followingAll).toBeNull();
      expect(friendsAll).toBeNull();
    });

    it('invalidates following timeline streams on unfollow', async () => {
      // Setup existing follow
      await db.transaction('rw', [UserConnectionsModel.table, UserCountsModel.table], async () => {
        await UserConnectionsModel.create({ id: userA, following: [userB], followers: [] });
        await UserConnectionsModel.create({ id: userB, following: [], followers: [userA] });
        await UserCountsModel.update(userA, { following: 1 });
        await UserCountsModel.update(userB, { followers: 1 });
      });

      await LocalFollowService.delete({ follower: userA, followee: userB });

      // Following streams should be deleted
      const [timelineAll, timelineShort] = await Promise.all([
        // @ts-expect-error - BaseStreamModel generic type constraint
        PostStreamModel.findById(PostStreamTypes.TIMELINE_FOLLOWING_ALL),
        // @ts-expect-error - BaseStreamModel generic type constraint
        PostStreamModel.findById(PostStreamTypes.TIMELINE_FOLLOWING_SHORT),
      ]);

      expect(timelineAll).toBeNull();
      expect(timelineShort).toBeNull();
    });

    it('invalidates both following and friends streams when breaking friendship', async () => {
      // Setup mutual follow (friends)
      await UserRelationshipsModel.create({ id: userB, following: true, followed_by: true });
      await db.transaction('rw', [UserConnectionsModel.table, UserCountsModel.table], async () => {
        await UserConnectionsModel.create({ id: userA, following: [userB], followers: [] });
        await UserConnectionsModel.create({ id: userB, following: [], followers: [userA] });
        await UserCountsModel.update(userA, { following: 1, friends: 1 });
        await UserCountsModel.update(userB, { followers: 1, friends: 1 });
      });

      await LocalFollowService.delete({ follower: userA, followee: userB });

      // All timeline streams should be deleted
      const [followingAll, friendsAll] = await Promise.all([
        // @ts-expect-error - BaseStreamModel generic type constraint
        PostStreamModel.findById(PostStreamTypes.TIMELINE_FOLLOWING_ALL),
        // @ts-expect-error - BaseStreamModel generic type constraint
        PostStreamModel.findById(PostStreamTypes.TIMELINE_FRIENDS_ALL),
      ]);

      expect(followingAll).toBeNull();
      expect(friendsAll).toBeNull();
    });
  });
});

/**
 * Bug regression test: Unfollow/re-follow counter double-counting
 *
 * This test replicates the exact bug scenario from the bug report:
 * - Fresh DB with data synced from Nexus (relationship exists, connections do NOT)
 * - Unfollow from Friends list should decrement counters
 * - Re-follow should increment counters back to original values (not double-count)
 *
 * Root cause: UserConnectionsModel is never populated from Nexus sync, but the
 * follow/unfollow logic originally relied solely on connection mutations to gate
 * counter updates. This caused counters to not decrement on unfollow (because
 * deleteConnection returned false) but increment on re-follow (because
 * createConnection returned true).
 */
describe('Bug regression: Nexus-synced data without connections', () => {
  beforeEach(async () => {
    await db.initialize();
    await clearUserTables();
  });

  it('does not double-count when unfollow/re-follow with Nexus-synced relationship data', async () => {
    // Simulate Nexus sync: relationship and counts exist, but connections do NOT
    // This is exactly what happens when viewing a Friends list after fresh login
    await db.transaction('rw', [UserRelationshipsModel.table, UserCountsModel.table], async () => {
      // User A is following User B (mutual - they are friends)
      await UserRelationshipsModel.create({
        id: userB,
        following: true,
        followed_by: true,
      });

      // Counts reflect the existing relationship
      await UserCountsModel.table.bulkAdd([
        { id: userA, ...DEFAULT_USER_COUNTS, following: 1, friends: 1 },
        { id: userB, ...DEFAULT_USER_COUNTS, followers: 1, friends: 1 },
      ]);
    });

    // NOTE: UserConnectionsModel is intentionally NOT populated
    // This simulates Nexus sync which only populates relationships, not connections

    // Step 1: Unfollow from Friends list
    await LocalFollowService.delete({ follower: userA, followee: userB });

    // Verify counters DECREMENTED (this was the bug - they didn't decrement before)
    const [aCountsAfterUnfollow, bCountsAfterUnfollow] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
    ]);

    expect(aCountsAfterUnfollow?.following ?? -1).toBe(0);
    expect(aCountsAfterUnfollow?.friends ?? -1).toBe(0);
    expect(bCountsAfterUnfollow?.followers ?? -1).toBe(0);
    expect(bCountsAfterUnfollow?.friends ?? -1).toBe(0);

    // Step 2: Re-follow the same user
    await LocalFollowService.create({ follower: userA, followee: userB });

    // Verify counters are back to 1 (not 2 - that was the double-counting bug)
    const [aCountsAfterRefollow, bCountsAfterRefollow] = await Promise.all([
      UserCountsModel.table.get(userA),
      UserCountsModel.table.get(userB),
    ]);

    expect(aCountsAfterRefollow?.following ?? -1).toBe(1);
    expect(aCountsAfterRefollow?.friends ?? -1).toBe(1);
    expect(bCountsAfterRefollow?.followers ?? -1).toBe(1);
    expect(bCountsAfterRefollow?.friends ?? -1).toBe(1);
  });

  it('decrements counters on unfollow even when connections table is empty', async () => {
    // Simulate Nexus sync: only relationship and counts, no connections
    await db.transaction('rw', [UserRelationshipsModel.table, UserCountsModel.table], async () => {
      await UserRelationshipsModel.create({
        id: userB,
        following: true,
        followed_by: false,
      });
      await UserCountsModel.table.bulkAdd([
        { id: userA, ...DEFAULT_USER_COUNTS, following: 1 },
        { id: userB, ...DEFAULT_USER_COUNTS, followers: 1 },
      ]);
    });

    // Unfollow with empty connections table
    await LocalFollowService.delete({ follower: userA, followee: userB });

    const [aCounts, bCounts] = await Promise.all([UserCountsModel.table.get(userA), UserCountsModel.table.get(userB)]);

    // Counters should decrement based on relationship state
    expect(aCounts?.following ?? -1).toBe(0);
    expect(bCounts?.followers ?? -1).toBe(0);
  });
});
