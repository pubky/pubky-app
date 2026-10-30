import { buildFile, buildPost, decodeContent, encodeContent } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { resolveArticleCover } from './articleCover';

const AUTHOR = fakeOwner(1);
const media = (byte: number) => buildFile(AUTHOR, { bytes: new Uint8Array([byte]), type: 'image/png' }).url;
const COVER = media(1);
const INLINE_A = media(2);
const INLINE_B = media(3);
const LEGACY_COVER = `pubky://${AUTHOR}/pub/pubky.app/files/0035R8SA18DE0`;
const LEGACY_INLINE = `pubky://${AUTHOR}/pub/pubky.app/files/0035R8SA18DE1`;

/** A v1 article as this app writes it: the cover in the envelope, the inline media as slots from 0. */
const written = (body: string, cover: string | null) =>
  buildPost(AUTHOR, { kind: 'article', title: 'Title', body, cover_image: cover }).object.content;

/** The 0.x envelope, which has no cover member. */
const legacy = (body: string) => JSON.stringify({ title: 'Title', body });

describe('resolveArticleCover', () => {
  describe('shape A: written by this app', () => {
    it('takes the cover from the envelope and indexes the attachments directly', () => {
      const resolved = resolveArticleCover({
        content: written('![a](attachment:0)\n\n![b](attachment:1)', COVER),
        attachments: [INLINE_A, INLINE_B],
      });

      expect(resolved).toEqual({ cover: COVER, slots: [INLINE_A, INLINE_B], legacyCoverSlot: false });
      expect(resolved.slots[0]).toBe(INLINE_A);
    });

    it('has no cover when the envelope holds none, whatever slot 0 holds', () => {
      expect(resolveArticleCover({ content: written('![a](attachment:0)', null), attachments: [INLINE_A] })).toEqual({
        cover: null,
        slots: [INLINE_A],
        legacyCoverSlot: false,
      });
    });

    it('reads a cover beside an empty attachment list', () => {
      expect(resolveArticleCover({ content: written('text', COVER), attachments: [] })).toEqual({
        cover: COVER,
        slots: [],
        legacyCoverSlot: false,
      });
    });
  });

  describe("shape A': migrated by pubky-social-migrator 1.0.0-rc.1", () => {
    it('shifts every slot by one when the body references attachments but never slot 0', () => {
      // The migrator promoted `attachments[0]` into `cover_image` and removed it from the list,
      // but left the body's references as the 0.x article numbered them (from 1, after the cover)
      const migrated = encodeContent({
        title: 'Title',
        body: '![a](attachment:1)\n\n![b](attachment:2)',
        cover_image: COVER,
      });
      const resolved = resolveArticleCover({ content: migrated, attachments: [INLINE_A, INLINE_B] });

      expect(resolved.cover).toBe(COVER);
      expect(resolved.legacyCoverSlot).toBe(false);
      expect(resolved.slots[1]).toBe(INLINE_A);
      expect(resolved.slots[2]).toBe(INLINE_B);
      expect(resolved.slots[0]).toBe('');
    });

    it('is the exact shape the migrator produces from a 0.x article with a cover and inline media', () => {
      // 0.x: attachments [cover, inline], body references slot 1 (the inline file)
      const legacyArticle = resolveArticleCover({
        content: legacy('![a](attachment:1)'),
        attachments: [LEGACY_COVER, LEGACY_INLINE],
      });
      expect(legacyArticle.cover).toBe(LEGACY_COVER);
      expect(legacyArticle.slots[1]).toBe(LEGACY_INLINE);

      // Migrated: the cover moved into the envelope, the list lost it, the body kept its numbers
      const migrated = resolveArticleCover({
        content: encodeContent({ title: 'Title', body: '![a](attachment:1)', cover_image: COVER }),
        attachments: [INLINE_A],
      });
      expect(migrated.cover).toBe(COVER);
      expect(migrated.slots[1]).toBe(INLINE_A);
    });
  });

  describe('shape B: a 0.x article (ADR-0023 slot-0 rule)', () => {
    it('takes slot 0 as the cover unless the body references it', () => {
      expect(
        resolveArticleCover({ content: legacy('![a](attachment:1)'), attachments: [LEGACY_COVER, LEGACY_INLINE] }),
      ).toEqual({ cover: LEGACY_COVER, slots: [LEGACY_COVER, LEGACY_INLINE], legacyCoverSlot: true });

      expect(resolveArticleCover({ content: legacy('![a](attachment:0)'), attachments: [LEGACY_INLINE] })).toEqual({
        cover: null,
        slots: [LEGACY_INLINE],
        legacyCoverSlot: false,
      });
    });

    it('leaves slot 0 to a cover but finds none without attachments', () => {
      expect(resolveArticleCover({ content: legacy('text'), attachments: null })).toEqual({
        cover: null,
        slots: [],
        legacyCoverSlot: true,
      });
    });

    it('treats content that is no article envelope as a body without references', () => {
      expect(resolveArticleCover({ content: 'not json', attachments: [LEGACY_COVER] })).toEqual({
        cover: LEGACY_COVER,
        slots: [LEGACY_COVER],
        legacyCoverSlot: true,
      });
    });
  });

  it('reads the envelope the data model spells', () => {
    const post = buildPost(AUTHOR, {
      kind: 'article',
      title: 'Title',
      body: '![a](attachment:0)',
      cover_image: COVER,
      attachments: [{ uri: INLINE_A }],
    });
    const envelope = decodeContent(post.object);

    expect(envelope?.kind).toBe('article');
    expect(resolveArticleCover({ content: post.object.content, attachments: [INLINE_A] }).cover).toBe(COVER);
  });
});
