import { describe, expect, it } from 'vitest';
import { collectionItemsToPostIds, sortPostIdsByMembership } from './collectionItemOrder';

const uriFor = (pubky: string, postId: string) => `pubky://${pubky}/pub/pubky.app/posts/${postId}`;

const idA = 'author_a:post_a';
const idB = 'author_b:post_b';
const idC = 'author_c:post_c';

const uriA = uriFor('author_a', 'post_a');
const uriB = uriFor('author_b', 'post_b');
const uriC = uriFor('author_c', 'post_c');

describe('sortPostIdsByMembership', () => {
  it('sorts stream ids to match the membership order', () => {
    expect(sortPostIdsByMembership([idA, idB, idC], [idC, idA, idB])).toEqual([idC, idA, idB]);
  });

  it('appends ids not present in the membership in their original stream order', () => {
    expect(sortPostIdsByMembership([idB, idA, idC], [idC])).toEqual([idC, idB, idA]);
  });

  it('ignores membership ids with no matching stream id', () => {
    expect(sortPostIdsByMembership([idB, idA], [idC, idA, idB])).toEqual([idA, idB]);
  });

  it('returns the input when the membership is missing or empty', () => {
    const postIds = [idB, idA];

    expect(sortPostIdsByMembership(postIds, undefined)).toBe(postIds);
    expect(sortPostIdsByMembership(postIds, [])).toBe(postIds);
  });

  it('returns the input when there are fewer than two ids', () => {
    const postIds = [idA];

    expect(sortPostIdsByMembership(postIds, [idB, idA])).toBe(postIds);
  });

  it('uses the first occurrence for duplicate membership ids', () => {
    expect(sortPostIdsByMembership([idB, idA], [idB, idA, idB])).toEqual([idB, idA]);
  });
});

describe('collectionItemsToPostIds', () => {
  it('maps envelope URIs to composite post ids in envelope order', () => {
    expect(collectionItemsToPostIds([uriB, uriA, uriC])).toEqual([idB, idA, idC]);
  });

  it('returns undefined for an unresolved envelope and an empty array for an empty one', () => {
    expect(collectionItemsToPostIds(undefined)).toBeUndefined();
    expect(collectionItemsToPostIds([])).toEqual([]);
  });

  it('drops malformed URIs and duplicates', () => {
    expect(collectionItemsToPostIds(['https://example.com/post', uriA, uriB, uriA])).toEqual([idA, idB]);
  });
});
