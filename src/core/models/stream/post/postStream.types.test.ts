import { describe, expect, it } from 'vitest';
import type { Pubky } from '@/models/models.types';
import {
  buildAuthorCollectionsStreamId,
  buildCollectionItemsStreamId,
  buildDiscoverCollectionsStreamId,
  buildFollowedCollectionsStreamId,
  buildPostReplyStreamId,
  isAuthorStreamSkippingMuteFilter,
  isCollectionItemsStream,
  isSkipPaginatedStream,
} from '@/models/stream/post/postStream.types';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { breakDownStreamId } from '@/services/nexus/stream/posts/postStream.utils';

const TEST_PUBKY = 'erztyis9oiaho93ckucetcf5xnxacecqwhbst5hnd7mmkf69dhby' as Pubky;
const TEST_POST_ID = 'post-pubky-id';

describe('post-stream id builders', () => {
  describe('buildPostReplyStreamId', () => {
    it('produces post_replies:<compositeId>', () => {
      expect(buildPostReplyStreamId(`${TEST_PUBKY}:${TEST_POST_ID}`)).toBe(
        `${StreamSource.REPLIES}:${TEST_PUBKY}:${TEST_POST_ID}`,
      );
    });
  });

  describe('buildAuthorCollectionsStreamId (My Collections)', () => {
    it('produces <pubky>:author:collection', () => {
      expect(buildAuthorCollectionsStreamId(TEST_PUBKY)).toBe(`${TEST_PUBKY}:author:collection`);
    });

    it('round-trips through breakDownStreamId as [pubky, AUTHOR, collection, undefined]', () => {
      const streamId = buildAuthorCollectionsStreamId(TEST_PUBKY);
      expect(breakDownStreamId(streamId)).toEqual([TEST_PUBKY, StreamSource.AUTHOR, 'collection', undefined]);
    });
  });

  describe('buildFollowedCollectionsStreamId (Followed Collections)', () => {
    it('produces the static timeline:bookmarks:collection id', () => {
      expect(buildFollowedCollectionsStreamId()).toBe('timeline:bookmarks:collection');
    });

    it('round-trips through breakDownStreamId as [timeline, BOOKMARKS, collection, undefined]', () => {
      const streamId = buildFollowedCollectionsStreamId();
      expect(breakDownStreamId(streamId)).toEqual(['timeline', StreamSource.BOOKMARKS, 'collection', undefined]);
    });
  });

  describe('buildDiscoverCollectionsStreamId (Discover Collections)', () => {
    it('produces the static total_engagement:all:collection id', () => {
      expect(buildDiscoverCollectionsStreamId()).toBe('total_engagement:all:collection');
    });

    it('round-trips through breakDownStreamId as [total_engagement, ALL, collection, undefined]', () => {
      const streamId = buildDiscoverCollectionsStreamId();
      expect(breakDownStreamId(streamId)).toEqual(['total_engagement', StreamSource.ALL, 'collection', undefined]);
    });
  });

  describe('buildCollectionItemsStreamId (single-collection items)', () => {
    it('produces collection:<authorPubky>:<postId>', () => {
      expect(buildCollectionItemsStreamId(TEST_PUBKY, TEST_POST_ID)).toBe(
        `${StreamSource.COLLECTION}:${TEST_PUBKY}:${TEST_POST_ID}`,
      );
    });

    it('round-trips through breakDownStreamId as [pubky, COLLECTION, postId, undefined]', () => {
      const streamId = buildCollectionItemsStreamId(TEST_PUBKY, TEST_POST_ID);
      expect(breakDownStreamId(streamId)).toEqual([TEST_PUBKY, StreamSource.COLLECTION, TEST_POST_ID, undefined]);
    });
  });
});

describe('isSkipPaginatedStream', () => {
  it('returns true for engagement streams (no stable score cursor)', () => {
    expect(isSkipPaginatedStream(buildDiscoverCollectionsStreamId())).toBe(true);
    expect(isSkipPaginatedStream('total_engagement:all:all')).toBe(true);
  });

  it('returns true for single-collection item streams (index-ordered)', () => {
    expect(isSkipPaginatedStream(buildCollectionItemsStreamId(TEST_PUBKY, TEST_POST_ID))).toBe(true);
  });

  it('returns false for timeline / author / bookmarks streams (timestamp-paginated)', () => {
    expect(isSkipPaginatedStream('timeline:all:all')).toBe(false);
    expect(isSkipPaginatedStream('timeline:bookmarks:collection')).toBe(false);
    expect(isSkipPaginatedStream(buildAuthorCollectionsStreamId(TEST_PUBKY))).toBe(false);
    expect(isSkipPaginatedStream(`${TEST_PUBKY}:author`)).toBe(false);
  });
});

describe('isCollectionItemsStream', () => {
  it('returns true only for single-collection item streams', () => {
    expect(isCollectionItemsStream(buildCollectionItemsStreamId(TEST_PUBKY, TEST_POST_ID))).toBe(true);
    expect(isCollectionItemsStream(buildAuthorCollectionsStreamId(TEST_PUBKY))).toBe(false);
    expect(isCollectionItemsStream('timeline:bookmarks:collection')).toBe(false);
  });
});

describe('isAuthorStreamSkippingMuteFilter', () => {
  it('returns true for author profile streams', () => {
    expect(isAuthorStreamSkippingMuteFilter(`author:${TEST_PUBKY}`)).toBe(true);
    expect(isAuthorStreamSkippingMuteFilter(`author_replies:${TEST_PUBKY}`)).toBe(true);
    expect(isAuthorStreamSkippingMuteFilter(buildAuthorCollectionsStreamId(TEST_PUBKY))).toBe(true);
  });

  it('returns false for global and discover streams', () => {
    expect(isAuthorStreamSkippingMuteFilter('timeline:all:all')).toBe(false);
    expect(isAuthorStreamSkippingMuteFilter(buildDiscoverCollectionsStreamId())).toBe(false);
    expect(isAuthorStreamSkippingMuteFilter(buildCollectionItemsStreamId(TEST_PUBKY, TEST_POST_ID))).toBe(false);
  });
});
