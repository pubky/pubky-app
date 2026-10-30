import {
  buildFile,
  buildPost,
  buildUri,
  decodeContent,
  decodeObject,
  editPost,
  encodeContent,
  parseUri,
} from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { COLLECTION_LAYOUT } from '@/config/collections';
import { ARTICLE_MAX_CHARACTER_LENGTH, POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import { getCharacterCount } from '@/libs/utils/utils';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import type { PostValidatorData } from '@/pipes/pipes.types';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import { withFrozenSpecClock } from '@/test-utils/spec-clock';

const OWNER = fakeOwner(1);
const FRIEND = fakeOwner(2);
const PARENT = buildUri(FRIEND, 'post', '0035QZPT4QG00');

const upload = (byte: number, name = `file-${byte}.png`, type = 'image/png'): TFileAttachmentResult => {
  const bytes = new Uint8Array([byte]);
  return { media: buildFile(OWNER, { bytes, type }), bytes, name, contentType: type };
};

const note = (overrides: Partial<PostValidatorData> = {}): PostValidatorData => ({
  content: 'Hello, world!',
  kind: 'note',
  ...overrides,
});

const articleContent = (title = 'Title', body = 'Body') => JSON.stringify({ title, body });

describe('PostNormalizer', () => {
  withFrozenSpecClock();

  describe('to', () => {
    it('builds the first version of a note where buildPost puts it: one file under posts/{id}/', () => {
      const built = PostNormalizer.to(note(), OWNER);

      expect(built.id).toBe(built.editId);
      expect(built.url).toBe(`pubky://${OWNER}/pub/social/v1/posts/${built.id}/${built.editId}.json`);
      expect(built.object).toMatchObject({ content: 'Hello, world!', kind: 'note', parent: null, embed: null });
      // The body is what goes on the wire; it decodes back to the object
      expect(decodeObject(built.url, built.body, 'post')).toEqual(built.object);
    });

    it.each(['image', 'video', 'link', 'file'] as const)('writes the %s kind as given', (kind) => {
      expect(PostNormalizer.to(note({ kind, attachments: [upload(1)] }), OWNER).object.kind).toBe(kind);
    });

    it('carries the parent, the embed as a plain URI, and a lock', () => {
      const lock = `pubky://${OWNER}/pub/app.locks/0035QZPT4QG00.json`;
      const built = PostNormalizer.to(note({ parentUri: PARENT, embed: PARENT, lock }), OWNER);

      expect(built.object).toMatchObject({ parent: PARENT, embed: PARENT, lock });
    });

    it('references each upload by its media URL with the picked file name, in the order given', () => {
      const built = PostNormalizer.to(note({ attachments: [upload(1, 'one.png'), upload(2, 'two.png')] }), OWNER);

      expect(built.object.attachments).toEqual([
        { uri: upload(1).media.url, name: 'one.png', alt: null },
        { uri: upload(2).media.url, name: 'two.png', alt: null },
      ]);
    });

    it('writes an article with its cover in the envelope and its inline media as the slots (ADR-0023)', () => {
      const cover = upload(9, 'cover.png');
      const inline = upload(1, 'inline.png');
      const built = PostNormalizer.to(
        {
          content: articleContent('On Pubky', '![a](attachment:0)'),
          kind: 'article',
          attachments: [inline],
          coverImage: cover,
        },
        OWNER,
      );

      expect(built.object.kind).toBe('article');
      expect(built.object.attachments).toEqual([{ uri: inline.media.url, name: 'inline.png', alt: null }]);
      expect(decodeContent(built.object)).toEqual({
        kind: 'article',
        content: { title: 'On Pubky', body: '![a](attachment:0)', cover_image: cover.media.url },
      });
    });

    it('writes an article without a cover as cover_image null', () => {
      const built = PostNormalizer.to({ content: articleContent(), kind: 'article' }, OWNER);

      expect(decodeContent(built.object)).toEqual({
        kind: 'article',
        content: { title: 'Title', body: 'Body', cover_image: null },
      });
    });

    it('refuses an article whose content is not a title and a body', () => {
      expect(() => PostNormalizer.to({ content: 'plain text', kind: 'article' }, OWNER)).toThrow(AppError);
    });

    it('refuses a collection: toCollection builds one', () => {
      expect(() => PostNormalizer.to({ content: '{}', kind: 'collection' }, OWNER)).toThrow(
        'A collection is created with toCollection',
      );
    });

    it("wraps the data model's refusal as a validation error carrying its code, field and limit", () => {
      let caught: unknown;
      try {
        PostNormalizer.to(note({ content: 'x'.repeat(POST_MAX_CHARACTER_LENGTH + 1) }), OWNER);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect(caught).toMatchObject({
        code: ValidationErrorCode.INVALID_INPUT,
        service: ErrorService.SocialSpecs,
        operation: 'buildPost',
        context: expect.objectContaining({ code: 'length', field: 'content', limit: POST_MAX_CHARACTER_LENGTH }),
      });
    });

    it('refuses empty content without an embed or an attachment, and accepts it with one', () => {
      expect(() => PostNormalizer.to(note({ content: '' }), OWNER)).toThrow(AppError);
      expect(PostNormalizer.to(note({ content: '', attachments: [upload(1)] }), OWNER).object.content).toBe('');
    });

    it('counts code points like getCharacterCount, so the composer cap and the data model agree', () => {
      // An astral character is two UTF-16 units but one code point to both
      const body = '😀'.repeat(ARTICLE_MAX_CHARACTER_LENGTH);
      expect(getCharacterCount(body)).toBe(ARTICLE_MAX_CHARACTER_LENGTH);
      expect(body.length).toBe(2 * ARTICLE_MAX_CHARACTER_LENGTH);

      expect(() => PostNormalizer.to({ content: articleContent('T', body), kind: 'article' }, OWNER)).not.toThrow();
      expect(() => PostNormalizer.to({ content: articleContent('T', `${body}x`), kind: 'article' }, OWNER)).toThrow(
        AppError,
      );
    });
  });

  describe('toCollection', () => {
    it('builds a collection whose envelope the data model spells, items with no note', () => {
      const built = PostNormalizer.toCollection(
        { name: 'Reading', description: 'Later', items: [PARENT], layout: COLLECTION_LAYOUT.LIST },
        OWNER,
      );

      expect(built.object.kind).toBe('collection');
      expect(built.object.attachments).toEqual([]);
      expect(decodeContent(built.object)).toEqual({
        kind: 'collection',
        content: {
          name: 'Reading',
          description: 'Later',
          items: [{ uri: PARENT, note: null }],
          cover_image: null,
          layout: 'list',
        },
      });
    });

    it('validates the envelope before the data model sees it', () => {
      expect(() => PostNormalizer.toCollection({ name: '   ' }, OWNER)).toThrow('Collection name is required');
    });
  });

  describe('toEdit', () => {
    const head = (input: Parameters<typeof buildPost>[1]) => {
      const built = buildPost(OWNER, input);
      return { url: built.url, post: built.object };
    };

    it('writes the next version above the head, with the content changed and everything else carried', () => {
      const lock = `pubky://${OWNER}/pub/app.locks/0035QZPT4QG00.json`;
      const stored = head({ content: 'Hello', parent: PARENT, embed: PARENT, lock });

      const next = PostNormalizer.toEdit({ owner: OWNER, head: stored, edit: { content: 'Hello again' } });

      const storedVersion = parseUri(stored.url);
      expect(storedVersion.kind).toBe('post');
      if (storedVersion.kind !== 'post') return;
      expect(next.id).toBe(storedVersion.id);
      // Versions sort by edit id: the next one lands above the stored head
      expect(String(next.editId) > String(storedVersion.editId)).toBe(true);
      expect(next.url).not.toBe(stored.url);
      expect(next.object).toEqual({ ...stored.post, content: 'Hello again' });
      expect(next.object.lock).toBe(lock);
    });

    it('keeps the alt text of kept attachments, names new ones, and drops the ones left out', () => {
      const kept = upload(1, 'kept.png');
      const dropped = upload(2, 'dropped.png');
      const added = upload(3, 'added.png');
      const stored = head({
        content: 'pics',
        attachments: [
          { uri: kept.media.url, name: 'kept.png', alt: 'A kept picture' },
          { uri: dropped.media.url, name: 'dropped.png' },
        ],
      });

      const next = PostNormalizer.toEdit({
        owner: OWNER,
        head: stored,
        edit: {
          content: 'pics',
          attachmentUris: [added.media.url, kept.media.url],
          attachmentNames: { [added.media.url]: 'added.png' },
          kind: 'image',
        },
      });

      expect(next.object.attachments).toEqual([
        { uri: added.media.url, name: 'added.png', alt: null },
        { uri: kept.media.url, name: 'kept.png', alt: 'A kept picture' },
      ]);
      expect(next.object.kind).toBe('image');
    });

    it('clears the attachments with null and leaves them with undefined', () => {
      const stored = head({ content: 'pics', attachments: [{ uri: upload(1).media.url }] });

      expect(
        PostNormalizer.toEdit({ owner: OWNER, head: stored, edit: { content: 'x', attachmentUris: null } }).object
          .attachments,
      ).toEqual([]);
      expect(PostNormalizer.toEdit({ owner: OWNER, head: stored, edit: { content: 'x' } }).object.attachments).toEqual(
        stored.post.attachments,
      );
    });

    it('carries the members another client added ($unknown) into the next version', () => {
      const stored = head({ content: 'Hello' });
      const withUnknown = { url: stored.url, post: { ...stored.post, $unknown: '{"mood":"calm"}' } };

      const next = PostNormalizer.toEdit({ owner: OWNER, head: withUnknown, edit: { content: 'Edited' } });

      expect(next.object.$unknown).toBe('{"mood":"calm"}');
      expect(new TextDecoder().decode(next.body)).toContain('"mood":"calm"');
    });

    it("rewrites an article's title and body and keeps its cover unless the edit says otherwise", () => {
      const cover = upload(9).media.url;
      const stored = head({ kind: 'article', title: 'Old', body: 'Old body', cover_image: cover });

      const kept = PostNormalizer.toEdit({
        owner: OWNER,
        head: stored,
        edit: { content: articleContent('New', 'New body') },
      });
      expect(decodeContent(kept.object)).toEqual({
        kind: 'article',
        content: { title: 'New', body: 'New body', cover_image: cover },
      });

      const replaced = upload(8).media.url;
      const withNewCover = PostNormalizer.toEdit({
        owner: OWNER,
        head: stored,
        edit: { content: articleContent('New', 'New body'), coverImage: replaced },
      });
      expect(decodeContent(withNewCover.object)?.content).toMatchObject({ cover_image: replaced });

      const cleared = PostNormalizer.toEdit({ owner: OWNER, head: stored, edit: { coverImage: null } });
      expect(decodeContent(cleared.object)).toEqual({
        kind: 'article',
        content: { title: 'Old', body: 'Old body', cover_image: null },
      });
    });

    it("merges a collection edit onto the stored envelope, keeping each kept item's note", () => {
      const stored = head({
        kind: 'collection',
        name: 'Reading',
        items: [
          { uri: PARENT, note: 'start here' },
          { uri: 'https://example.com/a', note: 'later' },
        ],
      });

      const next = PostNormalizer.toEdit({
        owner: OWNER,
        head: stored,
        edit: {
          collection: { name: 'Renamed', description: 'Now', items: ['https://example.com/b', PARENT], layout: 'grid' },
        },
      });

      expect(decodeContent(next.object)).toEqual({
        kind: 'collection',
        content: {
          name: 'Renamed',
          description: 'Now',
          cover_image: null,
          layout: 'grid',
          items: [
            { uri: 'https://example.com/b', note: null },
            { uri: PARENT, note: 'start here' },
          ],
        },
      });
    });

    it('refuses a collection edit of a note and a text edit of a collection', () => {
      const noteHead = head({ content: 'Hello' });
      const collectionHead = head({ kind: 'collection', name: 'Reading' });

      expect(() =>
        PostNormalizer.toEdit({ owner: OWNER, head: noteHead, edit: { collection: { name: 'x', layout: 'grid' } } }),
      ).toThrow('The stored post is not a collection');
      expect(() => PostNormalizer.toEdit({ owner: OWNER, head: collectionHead, edit: { content: 'text' } })).toThrow(
        'The stored post is not a note',
      );
    });

    it("refuses an edit of another user's head and wraps it with the package's field", () => {
      const theirs = buildPost(FRIEND, { content: 'Theirs' });
      let caught: unknown;
      try {
        PostNormalizer.toEdit({
          owner: OWNER,
          head: { url: theirs.url, post: theirs.object },
          edit: { content: 'Mine' },
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect(caught).toMatchObject({
        service: ErrorService.SocialSpecs,
        operation: 'editPost',
        context: expect.objectContaining({ field: 'headUri' }),
      });
    });

    it('writes above the newest version when the head is an edit, not the first version', () => {
      const first = buildPost(OWNER, { content: 'v1' });
      const second = editPost(OWNER, first.url, { ...first.object, content: 'v2' });

      const third = PostNormalizer.toEdit({
        owner: OWNER,
        head: { url: second.url, post: second.object },
        edit: { content: 'v3' },
      });

      expect(third.id).toBe(first.id);
      expect(third.editId > second.editId).toBe(true);
    });
  });

  describe('toLocalEdit', () => {
    it('projects a note edit: the content, the attachments (null for none) and the local kind', () => {
      const row = { content: 'Hello', attachments: null, kind: 'short' };

      expect(
        PostNormalizer.toLocalEdit({ row, edit: { content: 'Edited', attachmentUris: [], kind: 'note' } }),
      ).toEqual({
        content: 'Edited',
        attachments: null,
        kind: 'short',
      });
      expect(PostNormalizer.toLocalEdit({ row, edit: { attachmentUris: ['pubky://x'], kind: 'image' } })).toEqual({
        content: 'Hello',
        attachments: ['pubky://x'],
        kind: 'image',
      });
      expect(PostNormalizer.toLocalEdit({ row, edit: {} })).toEqual({ content: 'Hello' });
    });

    it("spells an article's envelope with its cover kept, replaced or cleared", () => {
      const cover = upload(9).media.url;
      const row = {
        content: encodeContent({ title: 'Old', body: 'Old body', cover_image: cover }),
        attachments: null,
        kind: 'long',
      };

      expect(PostNormalizer.toLocalEdit({ row, edit: { content: articleContent('New', 'B') } }).content).toBe(
        encodeContent({ title: 'New', body: 'B', cover_image: cover }),
      );
      expect(PostNormalizer.toLocalEdit({ row, edit: { coverImage: null } }).content).toBe(
        encodeContent({ title: 'Old', body: 'Old body', cover_image: null }),
      );
    });

    it('merges a collection edit onto the stored envelope, keeping notes, and starts from an empty one otherwise', () => {
      const stored = encodeContent({
        name: 'Reading',
        description: null,
        cover_image: null,
        layout: null,
        items: [{ uri: PARENT, note: 'start here' }],
      });
      const edit = { collection: { name: 'Renamed', items: [PARENT], layout: COLLECTION_LAYOUT.CARDS } };

      expect(
        PostNormalizer.toLocalEdit({ row: { content: stored, attachments: null, kind: 'collection' }, edit }).content,
      ).toBe(
        encodeContent({
          name: 'Renamed',
          description: null,
          cover_image: null,
          layout: 'grid',
          items: [{ uri: PARENT, note: 'start here' }],
        }),
      );
      // A row Nexus served in the 0.x spelling (plain URIs) has no notes to keep
      const legacy = JSON.stringify({ name: 'Reading', items: [PARENT] });
      expect(
        PostNormalizer.toLocalEdit({ row: { content: legacy, attachments: null, kind: 'collection' }, edit }).content,
      ).toBe(
        encodeContent({
          name: 'Renamed',
          description: null,
          cover_image: null,
          layout: 'grid',
          items: [{ uri: PARENT, note: null }],
        }),
      );
    });
  });
});
