import { describe, expect, it } from 'vitest';
import { parsePostReference } from './post.reference';

const AUTHOR = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const POST_ID = '00357R34CQ8Q0';
const COMPOSITE_ID = `${AUTHOR}:${POST_ID}`;
const POST_URI = `pubky://${AUTHOR}/pub/social/v1/posts/${POST_ID}`;

describe('parsePostReference', () => {
  it('parses a localhost app post URL', () => {
    expect(parsePostReference(`http://localhost:3000/post/${AUTHOR}/${POST_ID}`)).toEqual({
      compositeId: COMPOSITE_ID,
      pubky: AUTHOR,
      postId: POST_ID,
      postUri: POST_URI,
    });
  });

  it('parses an https app post URL', () => {
    expect(parsePostReference(`https://pubky.app/post/${AUTHOR}/${POST_ID}`)?.compositeId).toBe(COMPOSITE_ID);
  });

  it('rejects non-post URLs and malformed author IDs', () => {
    expect(parsePostReference('http://localhost:3000/profile/someone')).toBeNull();
    expect(parsePostReference(`http://localhost:3000/post/short-author/${POST_ID}`)).toBeNull();
    expect(parsePostReference('not a post')).toBeNull();
    // 52 characters, but not a key the data model can decode
    expect(parsePostReference(`http://localhost:3000/post/${'a'.repeat(52)}/${POST_ID}`)).toBeNull();
  });

  it('rejects pubky URIs, composite IDs, and relative routes', () => {
    expect(parsePostReference(POST_URI)).toBeNull();
    expect(parsePostReference(COMPOSITE_ID)).toBeNull();
    expect(parsePostReference(`/post/${AUTHOR}/${POST_ID}`)).toBeNull();
  });
});
