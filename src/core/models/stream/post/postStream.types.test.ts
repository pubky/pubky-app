import { describe, expect, it } from 'vitest';
import type { Pubky } from '@/models/models.types';
import {
  buildAuthorCollectionsStreamId,
  buildCollectionItemsStreamId,
  buildDiscoverCollectionsStreamId,
  buildFollowedCollectionsStreamId,
  buildPostReplyStreamId,
  buildWotDomainStreamId,
  isAuthorStreamSkippingMuteFilter,
  isCollectionItemsStream,
  isSkipPaginatedStream,
  isWotDomainStream,
} from '@/models/stream/post/postStream.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { StreamKind, StreamSource } from '@/services/nexus/stream/posts/postStream.types';
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

  describe('buildWotDomainStreamId', () => {
    it('produces a canonical wot_domain stream id', () => {
      expect(buildWotDomainStreamId(StreamSorting.TIMELINE, 1, 'all', ['dev', 'bitcoin'])).toBe(
        'timeline:wot_domain:1:all:bitcoin,dev',
      );
    });

    it('supports emoji profile tags and content-specific kind', () => {
      expect(buildWotDomainStreamId(StreamSorting.ENGAGEMENT, 2, StreamKind.IMAGE, ['🔥'])).toBe(
        'total_engagement:wot_domain:2:image:🔥',
      );
    });

    it('round-trips through breakDownStreamId as named fields', () => {
      const streamId = buildWotDomainStreamId(StreamSorting.TIMELINE, 2, StreamKind.COLLECTION, ['bitcoin']);
      expect(breakDownStreamId(streamId)).toEqual({
        sorting: StreamSorting.TIMELINE,
        invokeEndpoint: StreamSource.WOT_DOMAIN,
        kind: StreamKind.COLLECTION,
        wotDepth: 2,
        domainTags: 'bitcoin',
      });
    });

    it('identifies wot_domain stream ids', () => {
      expect(isWotDomainStream('timeline:wot_domain:1:all:bitcoin')).toBe(true);
      expect(isWotDomainStream('timeline:wot:all')).toBe(false);
    });
  });

  describe('buildAuthorCollectionsStreamId (My Collections)', () => {
    it('produces <pubky>:author:collection', () => {
      expect(buildAuthorCollectionsStreamId(TEST_PUBKY)).toBe(`${TEST_PUBKY}:author:collection`);
    });

    it('round-trips through breakDownStreamId as named fields', () => {
      const streamId = buildAuthorCollectionsStreamId(TEST_PUBKY);
      expect(breakDownStreamId(streamId)).toEqual({
        sorting: TEST_PUBKY,
        invokeEndpoint: StreamSource.AUTHOR,
        kind: StreamKind.COLLECTION,
      });
    });
  });

  describe('buildFollowedCollectionsStreamId (Followed Collections)', () => {
    it('produces the static timeline:bookmarks:collection id', () => {
      expect(buildFollowedCollectionsStreamId()).toBe('timeline:bookmarks:collection');
    });

    it('round-trips through breakDownStreamId as named fields', () => {
      const streamId = buildFollowedCollectionsStreamId();
      expect(breakDownStreamId(streamId)).toEqual({
        sorting: StreamSorting.TIMELINE,
        invokeEndpoint: StreamSource.BOOKMARKS,
        kind: StreamKind.COLLECTION,
      });
    });
  });

  describe('buildDiscoverCollectionsStreamId (Discover Collections)', () => {
    it('produces the static total_engagement:all:collection id', () => {
      expect(buildDiscoverCollectionsStreamId()).toBe('total_engagement:all:collection');
    });

    it('round-trips through breakDownStreamId as named fields', () => {
      const streamId = buildDiscoverCollectionsStreamId();
      expect(breakDownStreamId(streamId)).toEqual({
        sorting: StreamSorting.ENGAGEMENT,
        invokeEndpoint: StreamSource.ALL,
        kind: StreamKind.COLLECTION,
      });
    });
  });

  describe('buildCollectionItemsStreamId (single-collection items)', () => {
    it('produces collection:<authorPubky>:<postId>', () => {
      expect(buildCollectionItemsStreamId(TEST_PUBKY, TEST_POST_ID)).toBe(
        `${StreamSource.COLLECTION}:${TEST_PUBKY}:${TEST_POST_ID}`,
      );
    });

    it('round-trips through breakDownStreamId as named fields', () => {
      const streamId = buildCollectionItemsStreamId(TEST_PUBKY, TEST_POST_ID);
      expect(breakDownStreamId(streamId)).toEqual({
        sorting: TEST_PUBKY,
        invokeEndpoint: StreamSource.COLLECTION,
        kind: TEST_POST_ID,
      });
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
