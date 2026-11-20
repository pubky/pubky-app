import { decodeContent, decodeObject } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import { GuardedPostBuilder } from './guardedPost.builder';
import { GuardedContentParser } from './locks.parser';

const HOST = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const guarded = (name: string) => `pubky://${HOST}/priv/app.locks/content/${name}`;

describe('GuardedPostBuilder.toPrimary', () => {
  it('encodes a note as a v1 post by kind alone, declared octet-stream for the homeserver', () => {
    const file = GuardedPostBuilder.toPrimary({ content: 'secret', kind: 'short', attachmentUris: [guarded('a')] });

    expect(file.contentType).toBe('application/octet-stream');
    expect(decodeObject({ kind: 'post', root: 'private' }, file.bytes)).toEqual({
      content: 'secret',
      kind: 'note',
      parent: null,
      embed: null,
      attachments: [{ uri: guarded('a'), name: null, alt: null }],
      lock: null,
    });
  });

  it('keeps a locked article in the slot-0 convention: envelope without a cover, attachments as slots', () => {
    const file = GuardedPostBuilder.toPrimary({
      content: JSON.stringify({ title: 'Title', body: '![a](attachment:1)' }),
      kind: 'long',
      attachmentUris: [guarded('cover'), guarded('a')],
    });
    const post = decodeObject({ kind: 'post', root: 'private' }, file.bytes);

    expect(post.kind).toBe('article');
    expect(post.attachments.map(({ uri }) => uri)).toEqual([guarded('cover'), guarded('a')]);
    expect(decodeContent(post)).toEqual({
      kind: 'article',
      content: { title: 'Title', body: '![a](attachment:1)', cover_image: null },
    });
  });

  it('reads back through the parser in the local vocabulary', () => {
    const file = GuardedPostBuilder.toPrimary({ content: 'secret', kind: 'image', attachmentUris: [guarded('a')] });

    expect(GuardedContentParser.parsePost(file.bytes)).toEqual({
      content: 'secret',
      kind: 'image',
      attachments: [guarded('a')],
    });
  });

  it('refuses a kind this client cannot write and an article without a title and a body', () => {
    expect(() => GuardedPostBuilder.toPrimary({ content: 'x', kind: 'unknown', attachmentUris: [] })).toThrow(AppError);
    expect(() =>
      GuardedPostBuilder.toPrimary({ content: 'not an envelope', kind: 'long', attachmentUris: [] }),
    ).toThrow(AppError);
  });

  it("wraps the data model's refusal with its code and field", () => {
    let caught: unknown;
    try {
      GuardedPostBuilder.toPrimary({ content: 'x'.repeat(2001), kind: 'short', attachmentUris: [] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({
      code: ValidationErrorCode.INVALID_INPUT,
      service: ErrorService.SocialSpecs,
      context: expect.objectContaining({ code: 'length', field: 'content', limit: 2000 }),
    });
  });
});
