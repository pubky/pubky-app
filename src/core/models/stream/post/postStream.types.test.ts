import { describe, expect, it } from 'vitest';
import type { Pubky } from '@/models/models.types';
import {
  advanceCursor,
  buildAuthorCollectionsStreamId,
  buildCollectionItemsStreamId,
  buildDiscoverCollectionsStreamId,
  buildFollowedCollectionsStreamId,
  buildPostReplyStreamId,
  buildSortedAuthorStreamId,
  buildWotDomainStreamId,
  getPostStreamKind,
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

    it('supports the depth-0 (Me/observer-only) trust set', () => {
      expect(buildWotDomainStreamId(StreamSorting.TIMELINE, 0, 'all', ['dev', 'bitcoin'])).toBe(
        'timeline:wot_domain:0:all:bitcoin,dev',
      );
    });

    it('keeps profile tags canonical while preserving post-tag order in the sixth segment', () => {
      expect(
        buildWotDomainStreamId(StreamSorting.TIMELINE, 2, 'all', ['developer', 'bitcoiner'], ['second', 'first']),
      ).toBe('timeline:wot_domain:2:all:bitcoiner,developer:second,first');
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

  describe('buildSortedAuthorStreamId', () => {
    it('includes sorting and optional post tags in custom Me identity', () => {
      expect(buildSortedAuthorStreamId(StreamSorting.TIMELINE, TEST_PUBKY, 'all')).toBe(
        `timeline:author:${TEST_PUBKY}:all`,
      );
      expect(buildSortedAuthorStreamId(StreamSorting.ENGAGEMENT, TEST_PUBKY, StreamKind.IMAGE, ['photo'])).toBe(
        `total_engagement:author:${TEST_PUBKY}:image:photo`,
      );
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
    expect(isSkipPaginatedStream(buildSortedAuthorStreamId(StreamSorting.ENGAGEMENT, TEST_PUBKY, 'all'))).toBe(true);
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

describe('getPostStreamKind', () => {
  it('extracts the kind from sorting-first stream ids', () => {
    expect(getPostStreamKind('timeline:all:all')).toBe('all');
    expect(getPostStreamKind('timeline:following:short')).toBe(StreamKind.SHORT);
    expect(getPostStreamKind('total_engagement:friends:image')).toBe(StreamKind.IMAGE);
    expect(getPostStreamKind('timeline:wot:short')).toBe(StreamKind.SHORT);
    expect(getPostStreamKind('timeline:bookmarks:collection')).toBe(StreamKind.COLLECTION);
  });

  it('extracts the kind from 4-segment tag stream ids', () => {
    expect(getPostStreamKind('timeline:all:image:bitcoin')).toBe(StreamKind.IMAGE);
    expect(getPostStreamKind('timeline:all:all:bitcoin,dev')).toBe('all');
  });

  it('extracts the kind from wot_domain stream ids', () => {
    expect(getPostStreamKind(buildWotDomainStreamId(StreamSorting.TIMELINE, 2, StreamKind.IMAGE, ['bitcoin']))).toBe(
      StreamKind.IMAGE,
    );
    expect(getPostStreamKind('timeline:wot_domain:2:collection:bitcoin')).toBe(StreamKind.COLLECTION);
    expect(getPostStreamKind('total_engagement:wot_domain:1:all:🔥')).toBe('all');
    expect(getPostStreamKind('timeline:wot_domain:0:short:dev')).toBe(StreamKind.SHORT);
    // #2190 shape with a trailing post-tags segment keeps the kind at index 3.
    expect(getPostStreamKind('timeline:wot_domain:2:image:bitcoin:dev')).toBe(StreamKind.IMAGE);
  });

  it('extracts the kind from author-kind stream ids', () => {
    expect(getPostStreamKind(`${TEST_PUBKY}:author:image`)).toBe(StreamKind.IMAGE);
    expect(getPostStreamKind(buildAuthorCollectionsStreamId(TEST_PUBKY))).toBe(StreamKind.COLLECTION);
  });

  it('extracts the kind from sorted-author stream ids (#2190 shape)', () => {
    expect(getPostStreamKind(`timeline:author:${TEST_PUBKY}:image`)).toBe(StreamKind.IMAGE);
    expect(getPostStreamKind(`total_engagement:author:${TEST_PUBKY}:all:bitcoin`)).toBe('all');
  });

  it('returns undefined for stream ids that encode no kind', () => {
    expect(getPostStreamKind(`author:${TEST_PUBKY}`)).toBeUndefined();
    expect(getPostStreamKind(`author_replies:${TEST_PUBKY}`)).toBeUndefined();
    expect(getPostStreamKind(buildPostReplyStreamId(`${TEST_PUBKY}:${TEST_POST_ID}`))).toBeUndefined();
    expect(getPostStreamKind(buildCollectionItemsStreamId(TEST_PUBKY, TEST_POST_ID))).toBeUndefined();
  });

  it('returns undefined for invalid kind segments', () => {
    expect(getPostStreamKind('timeline:wot_domain:2:not-a-kind:bitcoin')).toBeUndefined();
    expect(getPostStreamKind('timeline:all:not-a-kind')).toBeUndefined();
  });
});

describe('isAuthorStreamSkippingMuteFilter', () => {
  it('returns true for author profile streams', () => {
    expect(isAuthorStreamSkippingMuteFilter(`author:${TEST_PUBKY}`)).toBe(true);
    expect(isAuthorStreamSkippingMuteFilter(`author_replies:${TEST_PUBKY}`)).toBe(true);
    expect(isAuthorStreamSkippingMuteFilter(buildAuthorCollectionsStreamId(TEST_PUBKY))).toBe(true);
    expect(isAuthorStreamSkippingMuteFilter(`${TEST_PUBKY}:author:image`)).toBe(true);
    expect(isAuthorStreamSkippingMuteFilter(buildSortedAuthorStreamId(StreamSorting.TIMELINE, TEST_PUBKY, 'all'))).toBe(
      true,
    );
  });

  it('returns false for global and discover streams', () => {
    expect(isAuthorStreamSkippingMuteFilter('timeline:all:all')).toBe(false);
    expect(isAuthorStreamSkippingMuteFilter(buildDiscoverCollectionsStreamId())).toBe(false);
    expect(isAuthorStreamSkippingMuteFilter(buildCollectionItemsStreamId(TEST_PUBKY, TEST_POST_ID))).toBe(false);
  });
});

describe('advanceCursor', () => {
  const discover = buildDiscoverCollectionsStreamId(); // total_engagement:all:collection (skip)
  const hot = 'total_engagement:all:all'; // engagement (skip)
  const items = buildCollectionItemsStreamId(TEST_PUBKY, TEST_POST_ID); // collection:… (skip)
  const timeline = 'timeline:all:all'; // score-cursor stream

  it('advances skip streams by the RAW page size, ignoring how many survive filtering', () => {
    // A page of 10 raw ids advances the offset by 10 even if all 10 are filtered out.
    expect(advanceCursor(hot, 0, { ids: Array.from({ length: 10 }, (_, i) => `p${i}`), lastScore: null })).toBe(10);
    expect(advanceCursor(discover, 40, { ids: ['a', 'b', 'c'], lastScore: null })).toBe(43);
    expect(advanceCursor(items, 5, { ids: [], lastScore: null })).toBe(5);
  });

  it('never uses lastScore for skip streams (Nexus returns null for them)', () => {
    // Even if a score leaks in, skip streams advance purely by raw count.
    expect(advanceCursor(hot, 0, { ids: ['a', 'b'], lastScore: 999 })).toBe(2);
  });

  it('advances score streams to the last raw postscore', () => {
    expect(advanceCursor(timeline, 100, { ids: ['a', 'b'], lastScore: 1717171717 })).toBe(1717171717);
  });

  it('holds position for score streams when no score is present (empty/last page)', () => {
    expect(advanceCursor(timeline, 1717171717, { ids: [], lastScore: null })).toBe(1717171717);
    expect(advanceCursor(timeline, 1717171717, { ids: [], lastScore: undefined })).toBe(1717171717);
  });

  it('keeps a falsy-but-valid score of 0 (guards `??` vs `||`)', () => {
    expect(advanceCursor(timeline, 100, { ids: ['a'], lastScore: 0 })).toBe(0);
  });
});
