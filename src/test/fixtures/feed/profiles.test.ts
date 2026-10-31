import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { postReferenceSpellings } from '@/pipes/post/post.reference';
import { VRT_FEED_POSTS } from './posts';
import { VRT_AUTHOR_PUBKYS } from './profiles';

describe('VRT author fixtures', () => {
  it('spell fakeOwner(1) to fakeOwner(8), in order', () => {
    expect(Object.values(VRT_AUTHOR_PUBKYS)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => fakeOwner(n)));
  });

  it('give every feed post a reference social v1 can spell', () => {
    for (const post of VRT_FEED_POSTS) {
      expect(postReferenceSpellings(post.details.author, post.postId)[1]).toBe(post.details.uri);
    }
  });
});
