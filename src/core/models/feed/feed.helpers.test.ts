import { describe, expect, it } from 'vitest';
import {
  buildFeedStreamId,
  contentToStreamKind,
  reachToStreamSource,
  sortToStreamSorting,
} from '@/models/feed/feed.helpers';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { StreamKind, StreamSource } from '@/services/nexus/stream/posts/postStream.types';

describe('Feed Helpers', () => {
  const TEST_VIEWER = 'viewer-pubky';
  describe('reachToStreamSource', () => {
    it('should convert All to StreamSource.ALL', () => {
      expect(reachToStreamSource('all')).toBe(StreamSource.ALL);
    });

    it('should convert Following to StreamSource.FOLLOWING', () => {
      expect(reachToStreamSource('following')).toBe(StreamSource.FOLLOWING);
    });

    it('should convert Friends to StreamSource.FRIENDS', () => {
      expect(reachToStreamSource('friends')).toBe(StreamSource.FRIENDS);
    });

    it('should convert Followers to StreamSource.FOLLOWERS', () => {
      expect(reachToStreamSource('followers')).toBe(StreamSource.FOLLOWERS);
    });

    it('should convert Wot to StreamSource.WOT', () => {
      expect(reachToStreamSource('wot')).toBe(StreamSource.WOT);
    });
  });

  describe('sortToStreamSorting', () => {
    it('should convert Recent to StreamSorting.TIMELINE', () => {
      expect(sortToStreamSorting('recent')).toBe(StreamSorting.TIMELINE);
    });

    it('should convert Popularity to StreamSorting.ENGAGEMENT', () => {
      expect(sortToStreamSorting('popularity')).toBe(StreamSorting.ENGAGEMENT);
    });
  });

  describe('contentToStreamKind', () => {
    it('should return undefined for null (All content)', () => {
      expect(contentToStreamKind(null)).toBeUndefined();
    });

    it('should convert Short to StreamKind.SHORT', () => {
      expect(contentToStreamKind('note')).toBe(StreamKind.SHORT);
    });

    it('should convert Long to StreamKind.LONG', () => {
      expect(contentToStreamKind('article')).toBe(StreamKind.LONG);
    });

    it('should convert Image to StreamKind.IMAGE', () => {
      expect(contentToStreamKind('image')).toBe(StreamKind.IMAGE);
    });

    it('should convert Video to StreamKind.VIDEO', () => {
      expect(contentToStreamKind('video')).toBe(StreamKind.VIDEO);
    });

    it('should convert Link to StreamKind.LINK', () => {
      expect(contentToStreamKind('link')).toBe(StreamKind.LINK);
    });

    it('should convert File to StreamKind.FILE', () => {
      expect(contentToStreamKind('file')).toBe(StreamKind.FILE);
    });

    it('should convert Collection to StreamKind.COLLECTION', () => {
      expect(contentToStreamKind('collection')).toBe(StreamKind.COLLECTION);
    });
  });

  describe('buildFeedStreamId', () => {
    const createFeed = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
      id: '123',
      name: 'Test Feed',
      tags: ['bitcoin'],
      domain_tags: [],
      reach: 'all',
      sort: 'recent',
      content: null,
      layout: 'columns',
      created_at: Date.now(),
      updated_at: Date.now(),
      ...overrides,
    });

    it('should build stream ID for timeline:all:all with single tag', () => {
      const feed = createFeed({
        reach: 'all',
        sort: 'recent',
        content: null,
        tags: ['bitcoin'],
      });

      expect(buildFeedStreamId(feed, TEST_VIEWER)).toBe('timeline:all:all:bitcoin');
    });

    it('should build stream ID with multiple tags', () => {
      const feed = createFeed({
        tags: ['bitcoin', 'lightning', 'tech'],
      });

      expect(buildFeedStreamId(feed, TEST_VIEWER)).toBe('timeline:all:all:bitcoin,lightning,tech');
    });

    it('should build stream ID for following source', () => {
      const feed = createFeed({
        reach: 'following',
      });

      expect(buildFeedStreamId(feed, TEST_VIEWER)).toBe('timeline:following:all:bitcoin');
    });

    it('should build stream ID for friends source', () => {
      const feed = createFeed({
        reach: 'friends',
      });

      expect(buildFeedStreamId(feed, TEST_VIEWER)).toBe('timeline:friends:all:bitcoin');
    });

    it('should build stream ID for followers source', () => {
      const feed = createFeed({
        reach: 'followers',
      });

      expect(buildFeedStreamId(feed, TEST_VIEWER)).toBe('timeline:followers:all:bitcoin');
    });

    it('should build stream ID for popularity sorting', () => {
      const feed = createFeed({
        sort: 'popularity',
      });

      expect(buildFeedStreamId(feed, TEST_VIEWER)).toBe('total_engagement:all:all:bitcoin');
    });

    it('should build stream ID with specific content type', () => {
      const feed = createFeed({
        content: 'image',
      });

      expect(buildFeedStreamId(feed, TEST_VIEWER)).toBe('timeline:all:image:bitcoin');
    });

    it('keeps the 0.x kind names in the stream id for the v1 note and article filters', () => {
      // Nexus still speaks `short`/`long`, so a feed stored with the v1 names keeps its stream and cache.
      expect(buildFeedStreamId(createFeed({ content: 'note' }), TEST_VIEWER)).toBe('timeline:all:short:bitcoin');
      expect(buildFeedStreamId(createFeed({ content: 'article' }), TEST_VIEWER)).toBe('timeline:all:long:bitcoin');
    });

    it('should build Network post-only and profile-only streams', () => {
      expect(buildFeedStreamId(createFeed({ reach: 'wot' }), TEST_VIEWER)).toBe('timeline:wot:all:bitcoin');
      expect(
        buildFeedStreamId(createFeed({ reach: 'wot', tags: [], domain_tags: ['developer', 'bitcoiner'] }), TEST_VIEWER),
      ).toBe('timeline:wot_domain:2:all:bitcoiner,developer');
    });

    it('should build combined Following/Friends domain streams at depth 1', () => {
      const following = createFeed({
        reach: 'following',
        tags: ['second', 'first'],
        domain_tags: ['bitcoiner'],
      });
      const friends: FeedModelSchema = { ...following, reach: 'friends' };

      expect(buildFeedStreamId(following, TEST_VIEWER)).toBe('timeline:wot_domain:1:all:bitcoiner:second,first');
      expect(buildFeedStreamId(friends, TEST_VIEWER)).toBe('timeline:wot_domain:1:all:bitcoiner:second,first');
    });

    it('should keep Recent and Popularity custom Me streams collision-safe', () => {
      const meFeed = createFeed({ reach: 'me', tags: ['bitcoin'] });

      expect(buildFeedStreamId(meFeed, TEST_VIEWER)).toBe(`timeline:author:${TEST_VIEWER}:all:bitcoin`);
      expect(buildFeedStreamId({ ...meFeed, sort: 'popularity' }, TEST_VIEWER)).toBe(
        `total_engagement:author:${TEST_VIEWER}:all:bitcoin`,
      );
    });

    it('should build depth-0 Me domain streams with profile tags (#2150)', () => {
      expect(
        buildFeedStreamId(createFeed({ reach: 'me', tags: [], domain_tags: ['developer', 'bitcoiner'] }), TEST_VIEWER),
      ).toBe('timeline:wot_domain:0:all:bitcoiner,developer');
    });

    it('should combine Me profile tags with post tags in the sixth segment', () => {
      expect(
        buildFeedStreamId(
          createFeed({ reach: 'me', tags: ['second', 'first'], domain_tags: ['bitcoiner'] }),
          TEST_VIEWER,
        ),
      ).toBe('timeline:wot_domain:0:all:bitcoiner:second,first');
    });

    it('should reject profile tags for unsupported reach values', () => {
      expect(() => buildFeedStreamId(createFeed({ reach: 'all', domain_tags: ['bitcoiner'] }), TEST_VIEWER)).toThrow(
        'Profile tags are not supported for this feed reach',
      );
    });

    it('should build complex stream ID with all options', () => {
      const feed = createFeed({
        reach: 'following',
        sort: 'popularity',
        content: 'video',
        tags: ['crypto', 'news'],
      });

      expect(buildFeedStreamId(feed, TEST_VIEWER)).toBe('total_engagement:following:video:crypto,news');
    });
  });
});
