import { buildFile, buildPost, decodeContent, encodeContent } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { isArticleCoverContentType, resolveArticleCover } from './articleCover';

const AUTHOR = fakeOwner(1);
const media = (byte: number, type = 'image/png') => buildFile(AUTHOR, { bytes: new Uint8Array([byte]), type }).url;
const COVER = media(1);
const INLINE_A = media(2);
const INLINE_B = media(3);
const PDF = media(4, 'application/pdf');
const VIDEO = media(5, 'video/mp4');
const LEGACY_COVER = `pubky://${AUTHOR}/pub/pubky.app/files/0035R8SA18DE0`;
const LEGACY_INLINE = `pubky://${AUTHOR}/pub/pubky.app/files/0035R8SA18DE1`;

const IMAGE = 'image/jpeg';

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

      expect(resolved).toEqual({
        cover: COVER,
        slots: [INLINE_A, INLINE_B],
        legacyCoverSlot: false,
        coverCandidate: null,
      });
      expect(resolved.slots[0]).toBe(INLINE_A);
    });

    it('has no cover when the envelope holds none, whatever slot 0 holds', () => {
      expect(resolveArticleCover({ content: written('![a](attachment:0)', null), attachments: [INLINE_A] })).toEqual({
        cover: null,
        slots: [INLINE_A],
        legacyCoverSlot: false,
        coverCandidate: null,
      });
    });

    it('reads a cover beside an empty attachment list', () => {
      expect(resolveArticleCover({ content: written('text', COVER), attachments: [] })).toEqual({
        cover: COVER,
        slots: [],
        legacyCoverSlot: false,
        coverCandidate: null,
      });
    });

    it('ignores the kind of slot 0: the envelope names the cover', () => {
      // Slot 0 is an inline PDF here; the cover is the envelope's whatever the slot holds
      const resolved = resolveArticleCover({
        content: written('![a](attachment:0)', COVER),
        attachments: [PDF],
        slotZeroContentType: 'application/pdf',
      });

      expect(resolved.cover).toBe(COVER);
      expect(resolved.coverCandidate).toBeNull();
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
      expect(resolved.coverCandidate).toBeNull();
      expect(resolved.slots[1]).toBe(INLINE_A);
      expect(resolved.slots[2]).toBe(INLINE_B);
      expect(resolved.slots[0]).toBe('');
    });

    it('is the exact shape the migrator produces from a 0.x article with a cover and inline media', () => {
      // 0.x: attachments [cover, inline], body references slot 1 (the inline file)
      const legacyArticle = resolveArticleCover({
        content: legacy('![a](attachment:1)'),
        attachments: [LEGACY_COVER, LEGACY_INLINE],
        slotZeroContentType: IMAGE,
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

    it('trusts an envelope cover rc.1 promoted from a non-image slot 0; the reader drops it from its row', () => {
      // rc.1 promoted ANY slot 0: `[pdf, image]` became cover_image = pdf, attachments [image].
      // The envelope is what it is; whether it renders is the metadata read's call, not this one's.
      const resolved = resolveArticleCover({
        content: encodeContent({ title: 'Title', body: '![a](attachment:1)', cover_image: PDF }),
        attachments: [INLINE_A],
        slotZeroContentType: IMAGE,
      });

      expect(resolved).toEqual({ cover: PDF, slots: ['', INLINE_A], legacyCoverSlot: false, coverCandidate: null });
    });

    it('is not what a `[video]` article becomes: with no reference there is no shift', () => {
      // rc.1 promoted the video into the envelope and left no inline media behind: shape A for the
      // reader (no references to shift); the row drops the cover, as for any non-image envelope cover
      const resolved = resolveArticleCover({
        content: encodeContent({ title: 'Title', body: 'text', cover_image: VIDEO }),
        attachments: [],
      });

      expect(resolved).toEqual({ cover: VIDEO, slots: [], legacyCoverSlot: false, coverCandidate: null });
    });
  });

  describe('shape B: a 0.x article (ADR-0023 slot-0 rule, image-only)', () => {
    it('leaves slot 0 as a candidate until its kind is known', () => {
      expect(
        resolveArticleCover({ content: legacy('![a](attachment:1)'), attachments: [LEGACY_COVER, LEGACY_INLINE] }),
      ).toEqual({
        cover: null,
        slots: [LEGACY_COVER, LEGACY_INLINE],
        legacyCoverSlot: true,
        coverCandidate: LEGACY_COVER,
      });
    });

    it('takes slot 0 as the cover once its row says image', () => {
      expect(
        resolveArticleCover({
          content: legacy('![a](attachment:1)'),
          attachments: [LEGACY_COVER, LEGACY_INLINE],
          slotZeroContentType: IMAGE,
        }),
      ).toEqual({
        cover: LEGACY_COVER,
        slots: [LEGACY_COVER, LEGACY_INLINE],
        legacyCoverSlot: true,
        coverCandidate: null,
      });
    });

    it('never makes a referenced slot 0 the cover, whatever it is', () => {
      for (const slotZeroContentType of [undefined, IMAGE, 'application/pdf', null]) {
        expect(
          resolveArticleCover({
            content: legacy('![a](attachment:0)'),
            attachments: [LEGACY_INLINE],
            slotZeroContentType,
          }),
        ).toEqual({
          cover: null,
          slots: [LEGACY_INLINE],
          legacyCoverSlot: false,
          coverCandidate: null,
        });
      }
    });

    it('[pdf, image]: a PDF at slot 0 is no cover and the image stays the inline slot the body names', () => {
      const resolved = resolveArticleCover({
        content: legacy('![a](attachment:1)'),
        attachments: [PDF, INLINE_A],
        slotZeroContentType: 'application/pdf',
      });

      expect(resolved).toEqual({ cover: null, slots: [PDF, INLINE_A], legacyCoverSlot: false, coverCandidate: null });
      expect(resolved.slots[1]).toBe(INLINE_A);
    });

    it('[image, pdf]: the image at slot 0 is the cover and the PDF stays inline', () => {
      const resolved = resolveArticleCover({
        content: legacy('![a](attachment:1)'),
        attachments: [COVER, PDF],
        slotZeroContentType: 'image/png',
      });

      expect(resolved).toEqual({ cover: COVER, slots: [COVER, PDF], legacyCoverSlot: true, coverCandidate: null });
    });

    it('[video]: a video at slot 0 is no cover', () => {
      expect(
        resolveArticleCover({ content: legacy('text'), attachments: [VIDEO], slotZeroContentType: 'video/mp4' }),
      ).toEqual({ cover: null, slots: [VIDEO], legacyCoverSlot: false, coverCandidate: null });
    });

    it('has no cover when the read settled without a row for slot 0', () => {
      expect(
        resolveArticleCover({ content: legacy('text'), attachments: [LEGACY_COVER], slotZeroContentType: null }),
      ).toEqual({ cover: null, slots: [LEGACY_COVER], legacyCoverSlot: false, coverCandidate: null });
    });

    it('leaves slot 0 to a cover but finds none without attachments', () => {
      // Unlocked (Locks) content: no Nexus attachments, the reader holds the files; the rule still applies
      expect(resolveArticleCover({ content: legacy('text'), attachments: null })).toEqual({
        cover: null,
        slots: [],
        legacyCoverSlot: true,
        coverCandidate: null,
      });
      expect(resolveArticleCover({ content: legacy('text'), attachments: null, slotZeroContentType: IMAGE })).toEqual({
        cover: null,
        slots: [],
        legacyCoverSlot: true,
        coverCandidate: null,
      });
    });

    it('treats content that is no article envelope as a body without references', () => {
      expect(resolveArticleCover({ content: 'not json', attachments: [LEGACY_COVER] })).toEqual({
        cover: null,
        slots: [LEGACY_COVER],
        legacyCoverSlot: true,
        coverCandidate: LEGACY_COVER,
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

describe('isArticleCoverContentType', () => {
  it('accepts images only', () => {
    expect(isArticleCoverContentType('image/png')).toBe(true);
    expect(isArticleCoverContentType('image/gif')).toBe(true);
    expect(isArticleCoverContentType('video/mp4')).toBe(false);
    expect(isArticleCoverContentType('audio/mpeg')).toBe(false);
    expect(isArticleCoverContentType('application/pdf')).toBe(false);
    expect(isArticleCoverContentType('')).toBe(false);
  });
});
