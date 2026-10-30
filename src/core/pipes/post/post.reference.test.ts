import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import { parsePostReference, postReferenceSpellings } from './post.reference';

const AUTHOR = 'a'.repeat(52);
const POST_ID = '00357R34CQ8Q0';
const COMPOSITE_ID = `${AUTHOR}:${POST_ID}`;
const POST_URI = `pubky://${AUTHOR}/pub/pubky.app/posts/${POST_ID}`;

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
  });

  it('rejects pubky URIs, composite IDs, and relative routes', () => {
    expect(parsePostReference(POST_URI)).toBeNull();
    expect(parsePostReference(COMPOSITE_ID)).toBeNull();
    expect(parsePostReference(`/post/${AUTHOR}/${POST_ID}`)).toBeNull();
  });
});

describe('postReferenceSpellings', () => {
  const owner = fakeOwner(1);

  it('spells the v1 reference first and the 0.x URI second', () => {
    expect(postReferenceSpellings(owner, POST_ID)).toEqual([
      `pubky://${owner}/pub/social/v1/posts/${POST_ID}`,
      `pubky://${owner}/pub/pubky.app/posts/${POST_ID}`,
    ]);
  });

  it.each([
    ['a key the data model cannot decode', 'a'.repeat(52), POST_ID, 'format'],
    ['a post id that is not one', owner, 'not-a-post-id', 'format'],
  ])('refuses %s as a validation AppError carrying the package code', (_, pubky, postId, code) => {
    let caught: unknown;
    try {
      postReferenceSpellings(pubky, postId);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({
      code: ValidationErrorCode.INVALID_INPUT,
      service: ErrorService.SocialSpecs,
      operation: 'postReferenceSpellings',
      context: expect.objectContaining({ code }),
    });
  });
});
