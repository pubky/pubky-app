import { describe, expect, it } from 'vitest';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { CONTENT, ContentType, REACH, ReachType, SORT, SortType } from './home.types';
import {
  getHomeStreamIdFromFilters,
  getKindFromContent,
  getStreamId,
  getStreamIdFromFilters,
  matchesFilters,
  parseStreamId,
  postKindBelongsToStream,
} from './home.utils';

describe('filters.utils', () => {
  describe('getKindFromContent', () => {
    // Content-search stream ids embed this kind segment directly
    // (`content_search:q~…:{kind}`), so every CONTENT filter must map — an
    // unmapped filter would produce an `undefined` segment in the id.
    it.each([
      [CONTENT.ALL, 'all'],
      [CONTENT.SHORT, 'short'],
      [CONTENT.LONG, 'long'],
      [CONTENT.COLLECTIONS, 'collection'],
      [CONTENT.IMAGES, 'image'],
      [CONTENT.VIDEOS, 'video'],
      [CONTENT.LINKS, 'link'],
      [CONTENT.FILES, 'file'],
    ] as const)('maps CONTENT %s to kind segment %s', (content, kind) => {
      expect(getKindFromContent(content)).toBe(kind);
    });

    it('covers every CONTENT filter', () => {
      const covered = new Set([
        CONTENT.ALL,
        CONTENT.SHORT,
        CONTENT.LONG,
        CONTENT.COLLECTIONS,
        CONTENT.IMAGES,
        CONTENT.VIDEOS,
        CONTENT.LINKS,
        CONTENT.FILES,
      ]);
      expect([...covered].sort()).toEqual(Object.values(CONTENT).sort());
    });
  });

  describe('getStreamIdFromFilters', () => {
    describe('SORT mapping', () => {
      it('should map "recent" to "timeline"', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.ALL);
        expect(streamId).toBe('timeline:all:all');
      });

      it('should map "popularity" to "total_engagement"', () => {
        const streamId = getStreamIdFromFilters(SORT.ENGAGEMENT, REACH.ALL, CONTENT.ALL);
        expect(streamId).toBe('total_engagement:all:all');
      });
    });

    describe('REACH mapping', () => {
      it('should map "all" reach', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.ALL);
        expect(streamId).toBe('timeline:all:all');
      });

      it('should map "following" reach', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.FOLLOWING, CONTENT.ALL);
        expect(streamId).toBe('timeline:following:all');
      });

      it('should map "network" reach to wot source', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.NETWORK, CONTENT.ALL);
        expect(streamId).toBe('timeline:wot:all');
      });

      it('should map "friends" reach', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.FRIENDS, CONTENT.ALL);
        expect(streamId).toBe('timeline:friends:all');
      });

      it('should require viewer-aware helper for "me" reach', () => {
        expect(() => getStreamIdFromFilters(SORT.TIMELINE, REACH.ME, CONTENT.ALL)).toThrow(
          'Me reach requires the current user id',
        );
      });
    });

    describe('CONTENT mapping', () => {
      it('should map "all" content', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.ALL);
        expect(streamId).toBe('timeline:all:all');
      });

      it('should map "posts" to "short"', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.SHORT);
        expect(streamId).toBe('timeline:all:short');
      });

      it('should map "articles" to "long"', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.LONG);
        expect(streamId).toBe('timeline:all:long');
      });

      it('should map "collections" to "collection"', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.COLLECTIONS);
        expect(streamId).toBe('timeline:all:collection');
      });

      it('should map "images" to "image"', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.IMAGES);
        expect(streamId).toBe('timeline:all:image');
      });

      it('should map "videos" to "video"', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.VIDEOS);
        expect(streamId).toBe('timeline:all:video');
      });

      it('should map "links" to "link"', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.LINKS);
        expect(streamId).toBe('timeline:all:link');
      });

      it('should map "files" to "file"', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.FILES);
        expect(streamId).toBe('timeline:all:file');
      });
    });

    describe('Combined filters', () => {
      it('should generate correct streamId for popularity + following + images', () => {
        const streamId = getStreamIdFromFilters(SORT.ENGAGEMENT, REACH.FOLLOWING, CONTENT.IMAGES);
        expect(streamId).toBe('total_engagement:following:image');
      });

      it('should generate correct streamId for recent + friends + videos', () => {
        const streamId = getStreamIdFromFilters(SORT.TIMELINE, REACH.FRIENDS, CONTENT.VIDEOS);
        expect(streamId).toBe('timeline:friends:video');
      });
    });
  });

  describe('getStreamId', () => {
    it('should return PostStreamTypes.TIMELINE_ALL_ALL for default filters', () => {
      const streamId = getStreamId(SORT.TIMELINE, REACH.ALL, CONTENT.ALL);
      expect(streamId).toBe(PostStreamTypes.TIMELINE_ALL_ALL);
      expect(streamId).toBe('timeline:all:all');
    });

    it('should return PostStreamTypes.TIMELINE_FOLLOWING_ALL', () => {
      const streamId = getStreamId(SORT.TIMELINE, REACH.FOLLOWING, CONTENT.ALL);
      expect(streamId).toBe(PostStreamTypes.TIMELINE_FOLLOWING_ALL);
      expect(streamId).toBe('timeline:following:all');
    });

    it('should return PostStreamTypes.TIMELINE_FRIENDS_ALL', () => {
      const streamId = getStreamId(SORT.TIMELINE, REACH.FRIENDS, CONTENT.ALL);
      expect(streamId).toBe(PostStreamTypes.TIMELINE_FRIENDS_ALL);
      expect(streamId).toBe('timeline:friends:all');
    });

    it('should return wot source stream id for Network reach', () => {
      const streamId = getStreamId(SORT.TIMELINE, REACH.NETWORK, CONTENT.ALL);
      expect(streamId).toBe('timeline:wot:all');
    });

    it('should return PostStreamTypes.TIMELINE_ALL_IMAGE', () => {
      const streamId = getStreamId(SORT.TIMELINE, REACH.ALL, CONTENT.IMAGES);
      expect(streamId).toBe(PostStreamTypes.TIMELINE_ALL_IMAGE);
      expect(streamId).toBe('timeline:all:image');
    });

    it('should return PostStreamTypes.TIMELINE_ALL_COLLECTION', () => {
      const streamId = getStreamId(SORT.TIMELINE, REACH.ALL, CONTENT.COLLECTIONS);
      expect(streamId).toBe(PostStreamTypes.TIMELINE_ALL_COLLECTION);
      expect(streamId).toBe('timeline:all:collection');
    });

    it('should return PostStreamTypes for all combinations', () => {
      const streamId = getStreamId(SORT.ENGAGEMENT, REACH.FOLLOWING, CONTENT.VIDEOS);
      expect(streamId).toBe(PostStreamTypes.POPULARITY_FOLLOWING_VIDEO);
      expect(streamId).toBe('total_engagement:following:video');
    });
  });

  describe('getHomeStreamIdFromFilters', () => {
    it('should force all reach when no user is authenticated', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.TIMELINE,
        reach: REACH.NETWORK,
        content: CONTENT.ALL,
        currentUserPubky: null,
      });

      expect(streamId).toBe(PostStreamTypes.TIMELINE_ALL_ALL);
    });

    it('should ignore profile tags when no user is authenticated', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.TIMELINE,
        reach: REACH.NETWORK,
        content: CONTENT.ALL,
        currentUserPubky: null,
        profileTags: ['bitcoin'],
        taggedAsActive: true,
      });

      expect(streamId).toBe(PostStreamTypes.TIMELINE_ALL_ALL);
    });

    it('should build a sorting-aware author stream for me reach with all content', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.TIMELINE,
        reach: REACH.ME,
        content: CONTENT.ALL,
        currentUserPubky: 'viewer-pubky',
      });

      expect(streamId).toBe('timeline:author:viewer-pubky:all');
    });

    it('should build author stream with content kind for me reach', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.TIMELINE,
        reach: REACH.ME,
        content: CONTENT.IMAGES,
        currentUserPubky: 'viewer-pubky',
      });

      expect(streamId).toBe('timeline:author:viewer-pubky:image');
    });

    it('should preserve popularity sorting for me reach', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.ENGAGEMENT,
        reach: REACH.ME,
        content: CONTENT.ALL,
        currentUserPubky: 'viewer-pubky',
      });

      expect(streamId).toBe('total_engagement:author:viewer-pubky:all');
    });

    it('should build a depth-2 domain stream when Tagged as is active with profile tags', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.TIMELINE,
        reach: REACH.NETWORK,
        content: CONTENT.ALL,
        currentUserPubky: 'viewer-pubky',
        profileTags: ['dev', 'bitcoin'],
        taggedAsActive: true,
      });

      expect(streamId).toBe('timeline:wot_domain:2:all:bitcoin,dev');
    });

    it.each([REACH.ALL, REACH.FOLLOWING, REACH.FRIENDS, REACH.ME])(
      'uses the same depth-2 Tagged-as stream while preserving %s as the parked base reach',
      (reach) => {
        const streamId = getHomeStreamIdFromFilters({
          sort: SORT.TIMELINE,
          reach,
          content: CONTENT.ALL,
          currentUserPubky: 'viewer-pubky',
          profileTags: ['bitcoin'],
          taggedAsActive: true,
        });

        expect(streamId).toBe('timeline:wot_domain:2:all:bitcoin');
      },
    );

    it('keeps parked profile tags out of the base stream when Tagged as is inactive', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.TIMELINE,
        reach: REACH.FOLLOWING,
        content: CONTENT.ALL,
        currentUserPubky: 'viewer-pubky',
        profileTags: ['bitcoin'],
        taggedAsActive: false,
      });

      expect(streamId).toBe(PostStreamTypes.TIMELINE_FOLLOWING_ALL);
    });

    it('preserves content kind in Tagged-as stream identity', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.TIMELINE,
        reach: REACH.NETWORK,
        content: CONTENT.COLLECTIONS,
        currentUserPubky: 'viewer-pubky',
        profileTags: ['bitcoin'],
        taggedAsActive: true,
      });

      expect(streamId).toBe('timeline:wot_domain:2:collection:bitcoin');
    });

    it('preserves sorting and emoji profile tags in Tagged-as stream identity', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.ENGAGEMENT,
        reach: REACH.NETWORK,
        content: CONTENT.IMAGES,
        currentUserPubky: 'viewer-pubky',
        profileTags: ['🔥'],
        taggedAsActive: true,
      });

      expect(streamId).toBe('total_engagement:wot_domain:2:image:🔥');
    });

    it('uses the base stream while Tagged as has no profile tags', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.TIMELINE,
        reach: REACH.ME,
        content: CONTENT.IMAGES,
        currentUserPubky: 'viewer-pubky',
        profileTags: [],
        taggedAsActive: true,
      });

      expect(streamId).toBe('timeline:author:viewer-pubky:image');
    });

    it('should use plain Network stream when profile tags are empty', () => {
      const streamId = getHomeStreamIdFromFilters({
        sort: SORT.TIMELINE,
        reach: REACH.NETWORK,
        content: CONTENT.ALL,
        currentUserPubky: 'viewer-pubky',
        profileTags: [],
      });

      expect(streamId).toBe('timeline:wot:all');
    });
  });

  describe('matchesFilters', () => {
    it('should return true for matching filters', () => {
      expect(matchesFilters('timeline:all:all', SORT.TIMELINE, REACH.ALL, CONTENT.ALL)).toBe(true);
      expect(matchesFilters('timeline:following:all', SORT.TIMELINE, REACH.FOLLOWING, CONTENT.ALL)).toBe(true);
      expect(matchesFilters('total_engagement:friends:image', SORT.ENGAGEMENT, REACH.FRIENDS, CONTENT.IMAGES)).toBe(
        true,
      );
    });

    it('should return false for non-matching filters', () => {
      expect(matchesFilters('timeline:all:all', SORT.ENGAGEMENT, REACH.ALL, CONTENT.ALL)).toBe(false);
      expect(matchesFilters('timeline:following:all', SORT.TIMELINE, REACH.ALL, CONTENT.ALL)).toBe(false);
      expect(matchesFilters('timeline:all:image', SORT.TIMELINE, REACH.ALL, CONTENT.ALL)).toBe(false);
    });

    it('should return false for Me reach instead of throwing', () => {
      expect(matchesFilters('timeline:all:all', SORT.TIMELINE, REACH.ME, CONTENT.ALL)).toBe(false);
      expect(matchesFilters(`author:${'x'.repeat(52)}`, SORT.TIMELINE, REACH.ME, CONTENT.ALL)).toBe(false);
    });

    it('should work with PostStreamTypes enum values', () => {
      expect(matchesFilters(PostStreamTypes.TIMELINE_ALL_ALL, SORT.TIMELINE, REACH.ALL, CONTENT.ALL)).toBe(true);
      expect(matchesFilters(PostStreamTypes.TIMELINE_FOLLOWING_ALL, SORT.TIMELINE, REACH.FOLLOWING, CONTENT.ALL)).toBe(
        true,
      );
      expect(matchesFilters(PostStreamTypes.TIMELINE_FRIENDS_ALL, SORT.TIMELINE, REACH.FRIENDS, CONTENT.ALL)).toBe(
        true,
      );
      expect(matchesFilters(PostStreamTypes.TIMELINE_ALL_IMAGE, SORT.TIMELINE, REACH.ALL, CONTENT.IMAGES)).toBe(true);
      expect(
        matchesFilters(PostStreamTypes.TIMELINE_ALL_COLLECTION, SORT.TIMELINE, REACH.ALL, CONTENT.COLLECTIONS),
      ).toBe(true);
    });
  });

  describe('parseStreamId', () => {
    describe('Valid streamIds', () => {
      it('should parse timeline:all:all', () => {
        const result = parseStreamId('timeline:all:all');
        expect(result).toEqual({
          sort: SORT.TIMELINE,
          reach: REACH.ALL,
          content: CONTENT.ALL,
        });
      });

      it('should parse timeline:following:all', () => {
        const result = parseStreamId('timeline:following:all');
        expect(result).toEqual({
          sort: SORT.TIMELINE,
          reach: REACH.FOLLOWING,
          content: CONTENT.ALL,
        });
      });

      it('should parse total_engagement:friends:image', () => {
        const result = parseStreamId('total_engagement:friends:image');
        expect(result).toEqual({
          sort: SORT.ENGAGEMENT,
          reach: REACH.FRIENDS,
          content: CONTENT.IMAGES,
        });
      });

      it('should parse timeline:wot:all as Network reach', () => {
        const result = parseStreamId('timeline:wot:all');
        expect(result).toEqual({
          sort: SORT.TIMELINE,
          reach: REACH.NETWORK,
          content: CONTENT.ALL,
        });
      });

      it('should parse PostStreamTypes enum values', () => {
        expect(parseStreamId(PostStreamTypes.TIMELINE_ALL_ALL)).toEqual({
          sort: SORT.TIMELINE,
          reach: REACH.ALL,
          content: CONTENT.ALL,
        });

        expect(parseStreamId(PostStreamTypes.TIMELINE_FOLLOWING_ALL)).toEqual({
          sort: SORT.TIMELINE,
          reach: REACH.FOLLOWING,
          content: CONTENT.ALL,
        });

        expect(parseStreamId(PostStreamTypes.TIMELINE_FRIENDS_ALL)).toEqual({
          sort: SORT.TIMELINE,
          reach: REACH.FRIENDS,
          content: CONTENT.ALL,
        });

        expect(parseStreamId(PostStreamTypes.TIMELINE_ALL_IMAGE)).toEqual({
          sort: SORT.TIMELINE,
          reach: REACH.ALL,
          content: CONTENT.IMAGES,
        });
      });

      it('should parse all content types', () => {
        expect(parseStreamId('timeline:all:all')?.content).toBe(CONTENT.ALL);
        expect(parseStreamId('timeline:all:short')?.content).toBe(CONTENT.SHORT);
        expect(parseStreamId('timeline:all:long')?.content).toBe(CONTENT.LONG);
        expect(parseStreamId('timeline:all:collection')?.content).toBe(CONTENT.COLLECTIONS);
        expect(parseStreamId('timeline:all:image')?.content).toBe(CONTENT.IMAGES);
        expect(parseStreamId('timeline:all:video')?.content).toBe(CONTENT.VIDEOS);
        expect(parseStreamId('timeline:all:link')?.content).toBe(CONTENT.LINKS);
        expect(parseStreamId('timeline:all:file')?.content).toBe(CONTENT.FILES);
      });
    });

    describe('Invalid streamIds', () => {
      it('should return null for invalid format (not 3 parts)', () => {
        expect(parseStreamId('timeline:all')).toBeNull();
        expect(parseStreamId('timeline')).toBeNull();
        expect(parseStreamId('timeline:all:all:extra')).toBeNull();
      });

      it('should return null for unknown sorting', () => {
        expect(parseStreamId('unknown:all:all')).toBeNull();
      });

      it('should return null for unknown source', () => {
        expect(parseStreamId('timeline:unknown:all')).toBeNull();
      });

      it('should return null for unknown kind', () => {
        expect(parseStreamId('timeline:all:unknown')).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(parseStreamId('')).toBeNull();
      });
    });
  });

  describe('Round-trip conversion', () => {
    it('should convert filters -> streamId -> filters consistently', () => {
      const testCases: Array<[typeof SORT.TIMELINE | typeof SORT.ENGAGEMENT, string, string]> = [
        [SORT.TIMELINE, REACH.ALL, CONTENT.ALL],
        [SORT.TIMELINE, REACH.NETWORK, CONTENT.ALL],
        [SORT.TIMELINE, REACH.FOLLOWING, CONTENT.IMAGES],
        [SORT.ENGAGEMENT, REACH.FRIENDS, CONTENT.VIDEOS],
        [SORT.ENGAGEMENT, REACH.ALL, CONTENT.LINKS],
        [SORT.TIMELINE, REACH.ALL, CONTENT.COLLECTIONS],
      ];

      testCases.forEach(([sort, reach, content]) => {
        const streamId = getStreamId(sort as SortType, reach as ReachType, content as ContentType);
        const parsed = parseStreamId(streamId);

        expect(parsed).toEqual({ sort, reach, content });
      });
    });
  });

  describe('postKindBelongsToStream', () => {
    it('allows any kind when the stream content filter is all', () => {
      expect(postKindBelongsToStream('short', PostStreamTypes.TIMELINE_ALL_ALL)).toBe(true);
      expect(postKindBelongsToStream('collection', PostStreamTypes.TIMELINE_ALL_ALL)).toBe(true);
    });

    it('matches post kind to the stream content filter', () => {
      expect(postKindBelongsToStream('collection', PostStreamTypes.TIMELINE_ALL_COLLECTION)).toBe(true);
      expect(postKindBelongsToStream('short', PostStreamTypes.TIMELINE_ALL_COLLECTION)).toBe(false);
      expect(postKindBelongsToStream('short', PostStreamTypes.TIMELINE_ALL_SHORT)).toBe(true);
      expect(postKindBelongsToStream('collection', PostStreamTypes.TIMELINE_ALL_SHORT)).toBe(false);
    });

    it('rejects unknown post kinds when the stream has a specific content filter', () => {
      expect(postKindBelongsToStream('unknown', PostStreamTypes.TIMELINE_ALL_COLLECTION)).toBe(false);
      expect(postKindBelongsToStream('unknown', PostStreamTypes.TIMELINE_ALL_SHORT)).toBe(false);
    });

    it('gates wot_domain streams by their kind segment', () => {
      // PR #2156 review repro: short post must not prepend into an images-only domain feed.
      expect(postKindBelongsToStream('short', 'timeline:wot_domain:2:image:bitcoin')).toBe(false);
      expect(postKindBelongsToStream('image', 'timeline:wot_domain:2:image:bitcoin')).toBe(true);
      expect(postKindBelongsToStream('short', 'timeline:wot_domain:1:collection:bitcoin')).toBe(false);
      expect(postKindBelongsToStream('collection', 'timeline:wot_domain:1:collection:bitcoin')).toBe(true);
      expect(postKindBelongsToStream('short', 'timeline:wot_domain:2:all:bitcoin')).toBe(true);
    });

    it('gates 4-segment tag streams by their kind segment', () => {
      expect(postKindBelongsToStream('short', 'timeline:all:image:bitcoin')).toBe(false);
      expect(postKindBelongsToStream('image', 'timeline:all:image:bitcoin')).toBe(true);
      expect(postKindBelongsToStream('short', 'timeline:all:all:bitcoin,dev')).toBe(true);
    });

    it('gates author-kind streams by their kind segment', () => {
      expect(postKindBelongsToStream('collection', 'pubky123:author:collection')).toBe(true);
      expect(postKindBelongsToStream('short', 'pubky123:author:collection')).toBe(false);
      expect(postKindBelongsToStream('image', 'pubky123:author:image')).toBe(true);
      expect(postKindBelongsToStream('short', 'pubky123:author:image')).toBe(false);
    });

    it('allows any kind for stream ids that encode no kind', () => {
      expect(postKindBelongsToStream('short', 'author:pubky123')).toBe(true);
      expect(postKindBelongsToStream('short', 'author_replies:pubky123')).toBe(true);
      expect(postKindBelongsToStream('collection', 'post_replies:pubky123:post456')).toBe(true);
    });
  });
});
