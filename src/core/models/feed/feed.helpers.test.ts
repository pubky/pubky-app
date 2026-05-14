import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { describe, expect, it } from 'vitest';
import {
  buildFeedStreamId,
  contentToStreamKind,
  layoutToString,
  postKindToString,
  reachToStreamSource,
  reachToString,
  sortToStreamSorting,
  sortToString,
} from '@/models/feed/feed.helpers';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { StreamKind, StreamSource } from '@/services/nexus/stream/posts/postStream.types';

describe('Feed Helpers', () => {
  describe('reachToString', () => {
    it('should convert Following to "following"', () => {
      expect(reachToString(PubkyAppFeedReach.Following)).toBe('following');
    });

    it('should convert Followers to "followers"', () => {
      expect(reachToString(PubkyAppFeedReach.Followers)).toBe('followers');
    });

    it('should convert Friends to "friends"', () => {
      expect(reachToString(PubkyAppFeedReach.Friends)).toBe('friends');
    });

    it('should convert All to "all"', () => {
      expect(reachToString(PubkyAppFeedReach.All)).toBe('all');
    });
  });

  describe('layoutToString', () => {
    it('should convert Columns to "columns"', () => {
      expect(layoutToString(PubkyAppFeedLayout.Columns)).toBe('columns');
    });

    it('should convert Wide to "wide"', () => {
      expect(layoutToString(PubkyAppFeedLayout.Wide)).toBe('wide');
    });

    it('should convert Visual to "visual"', () => {
      expect(layoutToString(PubkyAppFeedLayout.Visual)).toBe('visual');
    });
  });

  describe('sortToString', () => {
    it('should convert Recent to "recent"', () => {
      expect(sortToString(PubkyAppFeedSort.Recent)).toBe('recent');
    });

    it('should convert Popularity to "popularity"', () => {
      expect(sortToString(PubkyAppFeedSort.Popularity)).toBe('popularity');
    });
  });

  describe('postKindToString', () => {
    it('should convert Short to "short"', () => {
      expect(postKindToString(PubkyAppPostKind.Short)).toBe('short');
    });

    it('should convert Long to "long"', () => {
      expect(postKindToString(PubkyAppPostKind.Long)).toBe('long');
    });

    it('should convert Image to "image"', () => {
      expect(postKindToString(PubkyAppPostKind.Image)).toBe('image');
    });

    it('should convert Video to "video"', () => {
      expect(postKindToString(PubkyAppPostKind.Video)).toBe('video');
    });

    it('should convert Link to "link"', () => {
      expect(postKindToString(PubkyAppPostKind.Link)).toBe('link');
    });

    it('should convert File to "file"', () => {
      expect(postKindToString(PubkyAppPostKind.File)).toBe('file');
    });
  });

  describe('reachToStreamSource', () => {
    it('should convert All to StreamSource.ALL', () => {
      expect(reachToStreamSource(PubkyAppFeedReach.All)).toBe(StreamSource.ALL);
    });

    it('should convert Following to StreamSource.FOLLOWING', () => {
      expect(reachToStreamSource(PubkyAppFeedReach.Following)).toBe(StreamSource.FOLLOWING);
    });

    it('should convert Friends to StreamSource.FRIENDS', () => {
      expect(reachToStreamSource(PubkyAppFeedReach.Friends)).toBe(StreamSource.FRIENDS);
    });

    it('should convert Followers to StreamSource.FOLLOWERS', () => {
      expect(reachToStreamSource(PubkyAppFeedReach.Followers)).toBe(StreamSource.FOLLOWERS);
    });
  });

  describe('sortToStreamSorting', () => {
    it('should convert Recent to StreamSorting.TIMELINE', () => {
      expect(sortToStreamSorting(PubkyAppFeedSort.Recent)).toBe(StreamSorting.TIMELINE);
    });

    it('should convert Popularity to StreamSorting.ENGAGEMENT', () => {
      expect(sortToStreamSorting(PubkyAppFeedSort.Popularity)).toBe(StreamSorting.ENGAGEMENT);
    });
  });

  describe('contentToStreamKind', () => {
    it('should return undefined for null (All content)', () => {
      expect(contentToStreamKind(null)).toBeUndefined();
    });

    it('should convert Short to StreamKind.SHORT', () => {
      expect(contentToStreamKind(PubkyAppPostKind.Short)).toBe(StreamKind.SHORT);
    });

    it('should convert Long to StreamKind.LONG', () => {
      expect(contentToStreamKind(PubkyAppPostKind.Long)).toBe(StreamKind.LONG);
    });

    it('should convert Image to StreamKind.IMAGE', () => {
      expect(contentToStreamKind(PubkyAppPostKind.Image)).toBe(StreamKind.IMAGE);
    });

    it('should convert Video to StreamKind.VIDEO', () => {
      expect(contentToStreamKind(PubkyAppPostKind.Video)).toBe(StreamKind.VIDEO);
    });

    it('should convert Link to StreamKind.LINK', () => {
      expect(contentToStreamKind(PubkyAppPostKind.Link)).toBe(StreamKind.LINK);
    });

    it('should convert File to StreamKind.FILE', () => {
      expect(contentToStreamKind(PubkyAppPostKind.File)).toBe(StreamKind.FILE);
    });
  });

  describe('buildFeedStreamId', () => {
    const createFeed = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
      id: '123',
      name: 'Test Feed',
      tags: ['bitcoin'],
      reach: PubkyAppFeedReach.All,
      sort: PubkyAppFeedSort.Recent,
      content: null,
      layout: PubkyAppFeedLayout.Columns,
      created_at: Date.now(),
      updated_at: Date.now(),
      ...overrides,
    });

    it('should build stream ID for timeline:all:all with single tag', () => {
      const feed = createFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        tags: ['bitcoin'],
      });

      expect(buildFeedStreamId(feed)).toBe('timeline:all:all:bitcoin');
    });

    it('should build stream ID with multiple tags', () => {
      const feed = createFeed({
        tags: ['bitcoin', 'lightning', 'tech'],
      });

      expect(buildFeedStreamId(feed)).toBe('timeline:all:all:bitcoin,lightning,tech');
    });

    it('should build stream ID for following source', () => {
      const feed = createFeed({
        reach: PubkyAppFeedReach.Following,
      });

      expect(buildFeedStreamId(feed)).toBe('timeline:following:all:bitcoin');
    });

    it('should build stream ID for friends source', () => {
      const feed = createFeed({
        reach: PubkyAppFeedReach.Friends,
      });

      expect(buildFeedStreamId(feed)).toBe('timeline:friends:all:bitcoin');
    });

    it('should build stream ID for followers source', () => {
      const feed = createFeed({
        reach: PubkyAppFeedReach.Followers,
      });

      expect(buildFeedStreamId(feed)).toBe('timeline:followers:all:bitcoin');
    });

    it('should build stream ID for popularity sorting', () => {
      const feed = createFeed({
        sort: PubkyAppFeedSort.Popularity,
      });

      expect(buildFeedStreamId(feed)).toBe('total_engagement:all:all:bitcoin');
    });

    it('should build stream ID with specific content type', () => {
      const feed = createFeed({
        content: PubkyAppPostKind.Image,
      });

      expect(buildFeedStreamId(feed)).toBe('timeline:all:image:bitcoin');
    });

    it('should build complex stream ID with all options', () => {
      const feed = createFeed({
        reach: PubkyAppFeedReach.Following,
        sort: PubkyAppFeedSort.Popularity,
        content: PubkyAppPostKind.Video,
        tags: ['crypto', 'news'],
      });

      expect(buildFeedStreamId(feed)).toBe('total_engagement:following:video:crypto,news');
    });
  });
});
