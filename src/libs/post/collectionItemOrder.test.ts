import { describe, expect, it } from 'vitest';
import { sortPostIdsByCollectionOrder } from './collectionItemOrder';

const uriFor = (pubky: string, postId: string) => `pubky://${pubky}/pub/pubky.app/posts/${postId}`;

const idA = 'author_a:post_a';
const idB = 'author_b:post_b';
const idC = 'author_c:post_c';

const uriA = uriFor('author_a', 'post_a');
const uriB = uriFor('author_b', 'post_b');
const uriC = uriFor('author_c', 'post_c');

describe('sortPostIdsByCollectionOrder', () => {
  it('sorts stream ids to match the envelope order', () => {
    expect(sortPostIdsByCollectionOrder([idA, idB, idC], [uriC, uriA, uriB])).toEqual([idC, idA, idB]);
  });

  it('appends ids not present in the envelope in their original stream order', () => {
    expect(sortPostIdsByCollectionOrder([idB, idA, idC], [uriC])).toEqual([idC, idB, idA]);
  });

  it('ignores envelope items with no matching stream id', () => {
    expect(sortPostIdsByCollectionOrder([idB, idA], [uriC, uriA, uriB])).toEqual([idA, idB]);
  });

  it('returns the input when the envelope is missing or empty', () => {
    const postIds = [idB, idA];

    expect(sortPostIdsByCollectionOrder(postIds, undefined)).toBe(postIds);
    expect(sortPostIdsByCollectionOrder(postIds, [])).toBe(postIds);
  });

  it('returns the input when there are fewer than two ids', () => {
    const postIds = [idA];

    expect(sortPostIdsByCollectionOrder(postIds, [uriB, uriA])).toBe(postIds);
  });

  it('skips envelope URIs that cannot be converted to composite ids', () => {
    expect(sortPostIdsByCollectionOrder([idB, idA], ['https://example.com/post', uriA, uriB])).toEqual([idA, idB]);
    expect(sortPostIdsByCollectionOrder([idB, idA], ['https://example.com/post'])).toEqual([idB, idA]);
  });

  it('uses the first occurrence for duplicate envelope URIs', () => {
    expect(sortPostIdsByCollectionOrder([idB, idA], [uriB, uriA, uriB])).toEqual([idB, idA]);
  });
});
