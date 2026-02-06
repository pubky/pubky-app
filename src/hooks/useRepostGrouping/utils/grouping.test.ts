import { describe, it, expect } from 'vitest';
import type { PostDetailsModelSchema, PostRelationshipsModelSchema } from '@/core';
import { groupPlainReposts } from './grouping';

describe('groupPlainReposts', () => {
  const createDetails = (
    id: string,
    content: string,
    indexed_at: number,
    attachments: string[] | null = null,
  ): PostDetailsModelSchema => ({
    id,
    content,
    indexed_at,
    kind: 'short',
    uri: `pubky://${id.split(':')[0]}/pub/pubky.app/posts/${id.split(':')[1]}`,
    attachments,
  });

  const createRelationships = (id: string, reposted: string | null): PostRelationshipsModelSchema => ({
    id,
    reposted,
    replied: null,
    mentioned: [],
  });

  it('returns empty array for empty input', () => {
    const result = groupPlainReposts([], new Map(), new Map(), null);
    expect(result).toEqual([]);
  });

  it('returns single post items for non-reposts', () => {
    const postIds = ['user1:post1', 'user2:post2'];
    const detailsMap = new Map([
      ['user1:post1', createDetails('user1:post1', 'Hello', 1000)],
      ['user2:post2', createDetails('user2:post2', 'World', 2000)],
    ]);
    const relationshipsMap = new Map([
      ['user1:post1', createRelationships('user1:post1', null)],
      ['user2:post2', createRelationships('user2:post2', null)],
    ]);

    const result = groupPlainReposts(postIds, detailsMap, relationshipsMap, null);

    expect(result).toEqual([
      { type: 'single', postId: 'user1:post1' },
      { type: 'single', postId: 'user2:post2' },
    ]);
  });

  it('returns single post item for quote reposts (with content)', () => {
    const postIds = ['user1:repost1'];
    const detailsMap = new Map([['user1:repost1', createDetails('user1:repost1', 'My thoughts on this', 1000)]]);
    const relationshipsMap = new Map([
      ['user1:repost1', createRelationships('user1:repost1', 'pubky://original/pub/pubky.app/posts/post1')],
    ]);

    const result = groupPlainReposts(postIds, detailsMap, relationshipsMap, null);

    expect(result).toEqual([{ type: 'single', postId: 'user1:repost1' }]);
  });

  it('returns single post item for single plain repost', () => {
    const postIds = ['user1:repost1'];
    const detailsMap = new Map([['user1:repost1', createDetails('user1:repost1', '', 1000)]]);
    const relationshipsMap = new Map([
      ['user1:repost1', createRelationships('user1:repost1', 'pubky://original/pub/pubky.app/posts/post1')],
    ]);

    const result = groupPlainReposts(postIds, detailsMap, relationshipsMap, null);

    expect(result).toEqual([{ type: 'single', postId: 'user1:repost1' }]);
  });

  it('groups multiple plain reposts of the same original post', () => {
    const postIds = ['user1:repost1', 'user2:repost2'];
    const detailsMap = new Map([
      ['user1:repost1', createDetails('user1:repost1', '', 1000)],
      ['user2:repost2', createDetails('user2:repost2', '', 2000)],
    ]);
    const relationshipsMap = new Map([
      ['user1:repost1', createRelationships('user1:repost1', 'pubky://original/pub/pubky.app/posts/post1')],
      ['user2:repost2', createRelationships('user2:repost2', 'pubky://original/pub/pubky.app/posts/post1')],
    ]);

    const result = groupPlainReposts(postIds, detailsMap, relationshipsMap, null);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('repost-group');
    if (result[0].type === 'repost-group') {
      expect(result[0].originalPostId).toBe('original:post1');
      expect(result[0].reposterIds).toContain('user1');
      expect(result[0].reposterIds).toContain('user2');
      expect(result[0].repostPostIds).toHaveLength(2);
      expect(result[0].earliestTimestamp).toBe(1000);
    }
  });

  it('identifies current user repost in group', () => {
    const postIds = ['user1:repost1', 'currentUser:repost2'];
    const detailsMap = new Map([
      ['user1:repost1', createDetails('user1:repost1', '', 1000)],
      ['currentUser:repost2', createDetails('currentUser:repost2', '', 2000)],
    ]);
    const relationshipsMap = new Map([
      ['user1:repost1', createRelationships('user1:repost1', 'pubky://original/pub/pubky.app/posts/post1')],
      ['currentUser:repost2', createRelationships('currentUser:repost2', 'pubky://original/pub/pubky.app/posts/post1')],
    ]);

    const result = groupPlainReposts(postIds, detailsMap, relationshipsMap, 'currentUser');

    expect(result).toHaveLength(1);
    if (result[0].type === 'repost-group') {
      expect(result[0].includesCurrentUser).toBe(true);
      expect(result[0].currentUserRepostId).toBe('currentUser:repost2');
    }
  });

  it('does not mark includesCurrentUser when current user not in group', () => {
    const postIds = ['user1:repost1', 'user2:repost2'];
    const detailsMap = new Map([
      ['user1:repost1', createDetails('user1:repost1', '', 1000)],
      ['user2:repost2', createDetails('user2:repost2', '', 2000)],
    ]);
    const relationshipsMap = new Map([
      ['user1:repost1', createRelationships('user1:repost1', 'pubky://original/pub/pubky.app/posts/post1')],
      ['user2:repost2', createRelationships('user2:repost2', 'pubky://original/pub/pubky.app/posts/post1')],
    ]);

    const result = groupPlainReposts(postIds, detailsMap, relationshipsMap, 'currentUser');

    expect(result).toHaveLength(1);
    if (result[0].type === 'repost-group') {
      expect(result[0].includesCurrentUser).toBe(false);
      expect(result[0].currentUserRepostId).toBeUndefined();
    }
  });

  it('maintains timeline order with mixed content', () => {
    const postIds = ['user1:post1', 'user2:repost1', 'user3:repost2', 'user4:post2'];
    const detailsMap = new Map([
      ['user1:post1', createDetails('user1:post1', 'Regular post', 1000)],
      ['user2:repost1', createDetails('user2:repost1', '', 2000)],
      ['user3:repost2', createDetails('user3:repost2', '', 3000)],
      ['user4:post2', createDetails('user4:post2', 'Another post', 4000)],
    ]);
    const relationshipsMap = new Map([
      ['user1:post1', createRelationships('user1:post1', null)],
      ['user2:repost1', createRelationships('user2:repost1', 'pubky://original/pub/pubky.app/posts/origPost')],
      ['user3:repost2', createRelationships('user3:repost2', 'pubky://original/pub/pubky.app/posts/origPost')],
      ['user4:post2', createRelationships('user4:post2', null)],
    ]);

    const result = groupPlainReposts(postIds, detailsMap, relationshipsMap, null);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'single', postId: 'user1:post1' });
    expect(result[1].type).toBe('repost-group');
    expect(result[2]).toEqual({ type: 'single', postId: 'user4:post2' });
  });

  it('deduplicates same user reposting multiple times', () => {
    const postIds = ['user1:repost1', 'user1:repost2', 'user2:repost3'];
    const detailsMap = new Map([
      ['user1:repost1', createDetails('user1:repost1', '', 1000)],
      ['user1:repost2', createDetails('user1:repost2', '', 2000)],
      ['user2:repost3', createDetails('user2:repost3', '', 3000)],
    ]);
    const relationshipsMap = new Map([
      ['user1:repost1', createRelationships('user1:repost1', 'pubky://original/pub/pubky.app/posts/post1')],
      ['user1:repost2', createRelationships('user1:repost2', 'pubky://original/pub/pubky.app/posts/post1')],
      ['user2:repost3', createRelationships('user2:repost3', 'pubky://original/pub/pubky.app/posts/post1')],
    ]);

    const result = groupPlainReposts(postIds, detailsMap, relationshipsMap, null);

    expect(result).toHaveLength(1);
    if (result[0].type === 'repost-group') {
      expect(result[0].reposterIds).toHaveLength(2);
      expect(result[0].reposterIds).toContain('user1');
      expect(result[0].reposterIds).toContain('user2');
    }
  });

  it('handles missing details gracefully', () => {
    const postIds = ['user1:post1'];
    const detailsMap = new Map<string, PostDetailsModelSchema | undefined>();
    const relationshipsMap = new Map([['user1:post1', createRelationships('user1:post1', null)]]);

    const result = groupPlainReposts(postIds, detailsMap, relationshipsMap, null);

    expect(result).toEqual([{ type: 'single', postId: 'user1:post1' }]);
  });

  it('handles missing relationships gracefully', () => {
    const postIds = ['user1:post1'];
    const detailsMap = new Map([['user1:post1', createDetails('user1:post1', 'Hello', 1000)]]);
    const relationshipsMap = new Map<string, PostRelationshipsModelSchema | undefined>();

    const result = groupPlainReposts(postIds, detailsMap, relationshipsMap, null);

    expect(result).toEqual([{ type: 'single', postId: 'user1:post1' }]);
  });
});
