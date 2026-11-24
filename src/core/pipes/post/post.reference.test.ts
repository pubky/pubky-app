import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import { postReferenceSpellings } from './post.reference';

const POST_ID = '00357R34CQ8Q0';

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
