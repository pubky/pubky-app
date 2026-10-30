import { buildPost, editPost, listPrefix } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { pickHeadVersion } from './post.head';

const OWNER = fakeOwner(1);

describe('pickHeadVersion', () => {
  it('picks the version with the highest edit id, whatever order the listing has', () => {
    const first = buildPost(OWNER, { content: 'v1' });
    const second = editPost(OWNER, first.url, { ...first.object, content: 'v2' });
    const third = editPost(OWNER, second.url, { ...second.object, content: 'v3' });

    expect(pickHeadVersion([third.url, first.url, second.url])).toBe(third.url);
    expect(pickHeadVersion([first.url])).toBe(first.url);
  });

  it('returns null for an empty listing, the post the migration skipped', () => {
    expect(pickHeadVersion([])).toBeNull();
  });

  it('skips entries that are no post version: a foreign file, a directory, a reference', () => {
    const post = buildPost(OWNER, { content: 'v1' });

    expect(
      pickHeadVersion([
        `${listPrefix(OWNER, 'public')}posts/${post.id}/`,
        `pubky://${OWNER}/pub/social/v1/posts/${post.id}`,
        `pubky://${OWNER}/pub/social/v1/posts/${post.id}/notes.txt`,
        'not a uri',
        post.url,
      ]),
    ).toBe(post.url);
  });

  it('keeps a slugged version in the running', () => {
    const post = buildPost(OWNER, { content: 'v1' });
    const slugged = editPost(OWNER, post.url, { ...post.object, content: 'v2' }, { slug: 'renamed' });

    expect(pickHeadVersion([post.url, slugged.url])).toBe(slugged.url);
  });
});
