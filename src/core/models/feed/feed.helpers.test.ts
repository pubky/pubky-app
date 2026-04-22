import { describe, it, expect } from 'vitest';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import * as Core from '@/core';

describe('Feed Helpers', () => {
  describe('reachToString', () => {
    it('should convert Following to "following"', () => {
      expect(Core.reachToString(PubkyAppFeedReach.Following)).toBe('following');
    });

    it('should convert Followers to "followers"', () => {
      expect(Core.reachToString(PubkyAppFeedReach.Followers)).toBe('followers');
    });

    it('should convert Friends to "friends"', () => {
      expect(Core.reachToString(PubkyAppFeedReach.Friends)).toBe('friends');
    });

    it('should convert All to "all"', () => {
      expect(Core.reachToString(PubkyAppFeedReach.All)).toBe('all');
    });
  });

  describe('layoutToString', () => {
    it('should convert Columns to "columns"', () => {
      expect(Core.layoutToString(PubkyAppFeedLayout.Columns)).toBe('columns');
    });

    it('should convert Wide to "wide"', () => {
      expect(Core.layoutToString(PubkyAppFeedLayout.Wide)).toBe('wide');
    });

    it('should convert Visual to "visual"', () => {
      expect(Core.layoutToString(PubkyAppFeedLayout.Visual)).toBe('visual');
    });
  });

  describe('sortToString', () => {
    it('should convert Recent to "recent"', () => {
      expect(Core.sortToString(PubkyAppFeedSort.Recent)).toBe('recent');
    });

    it('should convert Popularity to "popularity"', () => {
      expect(Core.sortToString(PubkyAppFeedSort.Popularity)).toBe('popularity');
    });
  });

  describe('postKindToString', () => {
    it('should convert Short to "short"', () => {
      expect(Core.postKindToString(PubkyAppPostKind.Short)).toBe('short');
    });

    it('should convert Long to "long"', () => {
      expect(Core.postKindToString(PubkyAppPostKind.Long)).toBe('long');
    });

    it('should convert Image to "image"', () => {
      expect(Core.postKindToString(PubkyAppPostKind.Image)).toBe('image');
    });

    it('should convert Video to "video"', () => {
      expect(Core.postKindToString(PubkyAppPostKind.Video)).toBe('video');
    });

    it('should convert Link to "link"', () => {
      expect(Core.postKindToString(PubkyAppPostKind.Link)).toBe('link');
    });

    it('should convert File to "file"', () => {
      expect(Core.postKindToString(PubkyAppPostKind.File)).toBe('file');
    });
  });

  describe('reachToStreamSource', () => {
    it('should convert All to StreamSource.ALL', () => {
      expect(Core.reachToStreamSource(PubkyAppFeedReach.All)).toBe(Core.StreamSource.ALL);
    });

    it('should convert Following to StreamSource.FOLLOWING', () => {
      expect(Core.reachToStreamSource(PubkyAppFeedReach.Following)).toBe(Core.StreamSource.FOLLOWING);
    });

    it('should convert Friends to StreamSource.FRIENDS', () => {
      expect(Core.reachToStreamSource(PubkyAppFeedReach.Friends)).toBe(Core.StreamSource.FRIENDS);
    });

    it('should convert Followers to StreamSource.FOLLOWERS', () => {
      expect(Core.reachToStreamSource(PubkyAppFeedReach.Followers)).toBe(Core.StreamSource.FOLLOWERS);
    });
  });

  describe('sortToStreamSorting', () => {
    it('should convert Recent to StreamSorting.TIMELINE', () => {
      expect(Core.sortToStreamSorting(PubkyAppFeedSort.Recent)).toBe(Core.StreamSorting.TIMELINE);
    });

    it('should convert Popularity to StreamSorting.ENGAGEMENT', () => {
      expect(Core.sortToStreamSorting(PubkyAppFeedSort.Popularity)).toBe(Core.StreamSorting.ENGAGEMENT);
    });
  });

  describe('contentToStreamKind', () => {
    it('should return undefined for null (All content)', () => {
      expect(Core.contentToStreamKind(null)).toBeUndefined();
    });

    it('should convert Short to StreamKind.SHORT', () => {
      expect(Core.contentToStreamKind(PubkyAppPostKind.Short)).toBe(Core.StreamKind.SHORT);
    });

    it('should convert Long to StreamKind.LONG', () => {
      expect(Core.contentToStreamKind(PubkyAppPostKind.Long)).toBe(Core.StreamKind.LONG);
    });

    it('should convert Image to StreamKind.IMAGE', () => {
      expect(Core.contentToStreamKind(PubkyAppPostKind.Image)).toBe(Core.StreamKind.IMAGE);
    });

    it('should convert Video to StreamKind.VIDEO', () => {
      expect(Core.contentToStreamKind(PubkyAppPostKind.Video)).toBe(Core.StreamKind.VIDEO);
    });

    it('should convert Link to StreamKind.LINK', () => {
      expect(Core.contentToStreamKind(PubkyAppPostKind.Link)).toBe(Core.StreamKind.LINK);
    });

    it('should convert File to StreamKind.FILE', () => {
      expect(Core.contentToStreamKind(PubkyAppPostKind.File)).toBe(Core.StreamKind.FILE);
    });
  });

  describe('buildFeedStreamId', () => {
    const createFeed = (overrides: Partial<Core.FeedModelSchema> = {}): Core.FeedModelSchema => ({
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

      expect(Core.buildFeedStreamId(feed)).toBe('timeline:all:all:bitcoin');
    });

    it('should build stream ID with multiple tags', () => {
      const feed = createFeed({
        tags: ['bitcoin', 'lightning', 'tech'],
      });

      expect(Core.buildFeedStreamId(feed)).toBe('timeline:all:all:bitcoin,lightning,tech');
    });

    it('should build stream ID for following source', () => {
      const feed = createFeed({
        reach: PubkyAppFeedReach.Following,
      });

      expect(Core.buildFeedStreamId(feed)).toBe('timeline:following:all:bitcoin');
    });

    it('should build stream ID for friends source', () => {
      const feed = createFeed({
        reach: PubkyAppFeedReach.Friends,
      });

      expect(Core.buildFeedStreamId(feed)).toBe('timeline:friends:all:bitcoin');
    });

    it('should build stream ID for followers source', () => {
      const feed = createFeed({
        reach: PubkyAppFeedReach.Followers,
      });

      expect(Core.buildFeedStreamId(feed)).toBe('timeline:followers:all:bitcoin');
    });

    it('should build stream ID for popularity sorting', () => {
      const feed = createFeed({
        sort: PubkyAppFeedSort.Popularity,
      });

      expect(Core.buildFeedStreamId(feed)).toBe('total_engagement:all:all:bitcoin');
    });

    it('should build stream ID with specific content type', () => {
      const feed = createFeed({
        content: PubkyAppPostKind.Image,
      });

      expect(Core.buildFeedStreamId(feed)).toBe('timeline:all:image:bitcoin');
    });

    it('should build complex stream ID with all options', () => {
      const feed = createFeed({
        reach: PubkyAppFeedReach.Following,
        sort: PubkyAppFeedSort.Popularity,
        content: PubkyAppPostKind.Video,
        tags: ['crypto', 'news'],
      });

      expect(Core.buildFeedStreamId(feed)).toBe('total_engagement:following:video:crypto,news');
    });
  });
});
