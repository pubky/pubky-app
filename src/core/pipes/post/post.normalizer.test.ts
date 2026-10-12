import { buildFile, buildPost, buildUri, decodeContent, decodeObject, encodeContent } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import { COLLECTION_LAYOUT } from '@/config/collections';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import { buildArticleContent } from '@/libs/post/articleContent';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import type { PostValidatorData } from '@/pipes/pipes.types';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import { TEST_POST_IDS, TEST_PUBKY } from '../pipes.test-utils';

const owner = TEST_PUBKY.USER_1;
const media = [1, 2].map((byte) => buildFile(owner, { bytes: Uint8Array.of(byte), type: 'image/png' }));
const mediaUrl = (n: number) => media[n].url;
const lockUrl = `pubky://${TEST_PUBKY.USER_2}/pub/app.locks/locks/0035S78QPP4S0.json`;

const attachment = (n: number, name = `photo-${n}.png`): TFileAttachmentResult => ({
  media: media[n],
  bytes: Uint8Array.of(n + 1),
  name,
  contentType: 'image/png',
});

const expectValidationError = (run: () => unknown) => {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  expect((caught as AppError).code).toBe(ValidationErrorCode.INVALID_INPUT);
  return caught as AppError;
};

describe('PostNormalizer', () => {
  const note = (overrides?: Partial<PostValidatorData>): PostValidatorData => ({
    content: 'Hello, world!',
    kind: 'note',
    ...overrides,
  });

  describe('to', () => {
    it('builds the first version of a public note', () => {
      const post = PostNormalizer.to(note(), owner);

      expect(post.editId).toBe(post.id);
      expect(post.url).toBe(`pubky://${owner}/pub/social/v1/posts/${post.id}/${post.id}.json`);
      expect(decodeObject(post.url, post.body, 'post')).toEqual({
        content: 'Hello, world!',
        kind: 'note',
        parent: null,
        embed: null,
        attachments: [],
        lock: null,
      });
    });

    it('carries parent, embed and lock as written', () => {
      const parent = buildUri(TEST_PUBKY.USER_2, 'post', TEST_POST_IDS.POST_1);
      const embed = buildUri(TEST_PUBKY.USER_2, 'post', TEST_POST_IDS.POST_2);
      const post = PostNormalizer.to(note({ parentUri: parent, embed, lock: lockUrl }), owner);
      expect(post.object).toMatchObject({ parent, embed, lock: lockUrl });
    });

    it('lists the uploads in the order given, with their names', () => {
      const post = PostNormalizer.to(note({ kind: 'image', attachments: [attachment(0), attachment(1)] }), owner);
      expect(post.object.attachments).toEqual([
        { uri: mediaUrl(0), alt: null, name: 'photo-0.png' },
        { uri: mediaUrl(1), alt: null, name: 'photo-1.png' },
      ]);
    });

    it('writes an article envelope from the composer JSON', () => {
      const post = PostNormalizer.to(note({ kind: 'article', content: buildArticleContent(' Title ', 'Body') }), owner);
      expect(decodeContent(post.object)).toEqual({
        kind: 'article',
        content: { title: 'Title', body: 'Body', cover_image: null },
      });
    });

    it('refuses an article whose content is no title and body', () => {
      const error = expectValidationError(() => PostNormalizer.to(note({ kind: 'article', content: 'plain' }), owner));
      expect(error.service).toBe(ErrorService.Local);
    });

    it('refuses empty content without an embed or attachment, with the package message', () => {
      const error = expectValidationError(() => PostNormalizer.to(note({ content: '' }), owner));
      expect(error.service).toBe(ErrorService.PubkyAppSpecs);
      expect(error.message).toMatch(/^Validation Error: /);
    });

    it('accepts a note at the content limit and refuses one past it', () => {
      expect(() => PostNormalizer.to(note({ content: '😀'.repeat(2000) }), owner)).not.toThrow();
      expectValidationError(() => PostNormalizer.to(note({ content: 'a'.repeat(2001) }), owner));
    });
  });

  describe('toCollection', () => {
    it('writes the envelope with items as references', () => {
      const item = buildUri(TEST_PUBKY.USER_2, 'post', TEST_POST_IDS.POST_1);
      const post = PostNormalizer.toCollection(
        {
          name: 'Reads',
          description: 'Good ones',
          items: [item],
          coverImage: mediaUrl(0),
          layout: COLLECTION_LAYOUT.VISUAL,
        },
        owner,
      );

      expect(post.object.kind).toBe('collection');
      expect(decodeContent(post.object)).toEqual({
        kind: 'collection',
        content: {
          name: 'Reads',
          description: 'Good ones',
          items: [{ uri: item, note: null }],
          cover_image: mediaUrl(0),
          layout: 'visual',
        },
      });
    });

    it('validates the envelope before the package sees it', () => {
      expectValidationError(() => PostNormalizer.toCollection({ name: '   ' }, owner));
    });
  });

  describe('toEdit', () => {
    const storedNote = () => {
      const first = buildPost(owner, {
        kind: 'image',
        content: 'Before',
        attachments: [{ uri: mediaUrl(0), alt: 'a cat', name: 'cat.png' }],
        lock: lockUrl,
      });
      return { url: first.url, post: { ...first.object, $unknown: '{"mood":"happy"}' }, first };
    };

    it('writes the next version above the head', () => {
      const { url, post, first } = storedNote();
      const edited = PostNormalizer.toEdit({ owner, head: { url, post }, edit: { content: 'After' } });

      expect(edited.id).toBe(first.id);
      expect(edited.editId > first.editId).toBe(true);
      expect(edited.object.content).toBe('After');
    });

    it('carries the lock, the alt text and members another client added', () => {
      const { url, post } = storedNote();
      const edited = PostNormalizer.toEdit({ owner, head: { url, post }, edit: { content: 'After' } });

      expect(edited.object).toMatchObject({
        lock: lockUrl,
        attachments: [{ uri: mediaUrl(0), alt: 'a cat', name: 'cat.png' }],
        $unknown: '{"mood":"happy"}',
      });
    });

    it('reorders attachments, keeping each kept one, naming each new one', () => {
      const { url, post } = storedNote();
      const edited = PostNormalizer.toEdit({
        owner,
        head: { url, post },
        edit: {
          attachmentUris: [mediaUrl(1), mediaUrl(0)],
          attachmentNames: { [mediaUrl(1)]: 'dog.png' },
          kind: 'image',
        },
      });

      expect(edited.object.attachments).toEqual([
        { uri: mediaUrl(1), alt: null, name: 'dog.png' },
        { uri: mediaUrl(0), alt: 'a cat', name: 'cat.png' },
      ]);
    });

    it('clears attachments and changes the kind', () => {
      const { url, post } = storedNote();
      const edited = PostNormalizer.toEdit({
        owner,
        head: { url, post },
        edit: { content: 'Text only', attachmentUris: null, kind: 'note' },
      });
      expect(edited.object).toMatchObject({ attachments: [], kind: 'note' });
    });

    it('edits an article title and body inside the stored envelope, keeping its cover', () => {
      const first = buildPost(owner, { kind: 'article', title: 'Old', body: 'Old body', cover_image: mediaUrl(0) });
      const edited = PostNormalizer.toEdit({
        owner,
        head: { url: first.url, post: first.object },
        edit: { content: buildArticleContent('New', 'New body') },
      });
      expect(decodeContent(edited.object)).toEqual({
        kind: 'article',
        content: { title: 'New', body: 'New body', cover_image: mediaUrl(0) },
      });
    });

    it('merges a collection onto the stored envelope, keeping item notes', () => {
      const kept = buildUri(TEST_PUBKY.USER_2, 'post', TEST_POST_IDS.POST_1);
      const added = buildUri(TEST_PUBKY.USER_2, 'post', TEST_POST_IDS.POST_2);
      const first = buildPost(owner, { kind: 'collection', name: 'Reads', items: [{ uri: kept, note: 'start here' }] });
      const edited = PostNormalizer.toEdit({
        owner,
        head: { url: first.url, post: first.object },
        edit: { collection: { name: 'Reads', items: [added, kept], layout: COLLECTION_LAYOUT.LIST } },
      });

      const envelope = decodeContent(edited.object);
      expect(envelope?.kind === 'collection' && envelope.content.items).toEqual([
        { uri: added, note: null },
        { uri: kept, note: 'start here' },
      ]);
    });

    it('refuses a collection edit of a note', () => {
      const { url, post } = storedNote();
      expectValidationError(() =>
        PostNormalizer.toEdit({ owner, head: { url, post }, edit: { collection: { name: 'x', layout: 'grid' } } }),
      );
    });

    it('refuses an edit in another user tree', () => {
      const other = buildPost(TEST_PUBKY.USER_2, { content: 'Theirs' });
      expectValidationError(() =>
        PostNormalizer.toEdit({ owner, head: { url: other.url, post: other.object }, edit: { content: 'Mine now' } }),
      );
    });

    it('refuses an edit that empties the content', () => {
      const first = buildPost(owner, { content: 'Something' });
      expectValidationError(() =>
        PostNormalizer.toEdit({ owner, head: { url: first.url, post: first.object }, edit: { content: '' } }),
      );
    });

    it('keeps an article envelope that has unknown members', () => {
      const first = buildPost(owner, { kind: 'article', title: 'T', body: 'B' });
      const content = encodeContent({ title: 'T', body: 'B', cover_image: null, $unknown: '{"subtitle":"S"}' });
      const edited = PostNormalizer.toEdit({
        owner,
        head: { url: first.url, post: { ...first.object, content } },
        edit: { content: buildArticleContent('T2', 'B2') },
      });
      expect(edited.object.content).toContain('"subtitle":"S"');
    });
  });
});
