import { describe, it, expect } from 'vitest';
import { PubkyAppPostKind } from 'pubky-app-specs';
import * as Core from '@/core';

describe('inferPostKindForCreate', () => {
  it('returns video when at least one video attachment exists', () => {
    const kind = Core.inferPostKindForCreate({
      content: 'Look at this',
      attachments: [
        new File(['image-content'], 'image.png', { type: 'image/png' }),
        new File(['video-content'], 'clip.mp4', { type: 'video/mp4' }),
      ],
    });

    expect(kind).toBe(PubkyAppPostKind.Video);
  });

  it('returns image when attachments contain image and no video', () => {
    const kind = Core.inferPostKindForCreate({
      content: 'Look at this',
      attachments: [
        new File(['image-content'], 'image.png', { type: 'image/png' }),
        new File(['pdf-content'], 'doc.pdf', { type: 'application/pdf' }),
      ],
    });

    expect(kind).toBe(PubkyAppPostKind.Image);
  });

  it('returns file when attachments are non-image and non-video', () => {
    const kind = Core.inferPostKindForCreate({
      content: 'A document',
      attachments: [new File(['pdf-content'], 'doc.pdf', { type: 'application/pdf' })],
    });

    expect(kind).toBe(PubkyAppPostKind.File);
  });

  it('returns link when content contains url and there are no attachments', () => {
    const kind = Core.inferPostKindForCreate({
      content: 'Read https://pubky.app',
    });

    expect(kind).toBe(PubkyAppPostKind.Link);
  });

  it('returns short when there is no attachment and no url', () => {
    const kind = Core.inferPostKindForCreate({
      content: 'Just plain text',
    });

    expect(kind).toBe(PubkyAppPostKind.Short);
  });

  it('returns short for ignored protocols like mailto and ftp', () => {
    const kind = Core.inferPostKindForCreate({
      content: 'Contact me at mailto:test@example.com or ftp://example.com/file.txt',
    });

    expect(kind).toBe(PubkyAppPostKind.Short);
  });

  it('does not mark markdown links as link kind', () => {
    const kind = Core.inferPostKindForCreate({
      content: 'See [pubky](https://pubky.app) for details',
    });

    expect(kind).toBe(PubkyAppPostKind.Short);
  });

  it('prioritizes link over attachments', () => {
    const kind = Core.inferPostKindForCreate({
      content: 'Watch https://pubky.app/video',
      attachments: [new File(['video-content'], 'clip.mp4', { type: 'video/mp4' })],
    });

    expect(kind).toBe(PubkyAppPostKind.Link);
  });

  it('prioritizes link over image attachments', () => {
    const kind = Core.inferPostKindForCreate({
      content: 'Check https://pubky.app',
      attachments: [new File(['image-content'], 'photo.png', { type: 'image/png' })],
    });

    expect(kind).toBe(PubkyAppPostKind.Link);
  });

  it('returns long when isArticle is true', () => {
    const kind = Core.inferPostKindForCreate({
      content: JSON.stringify({ title: 'My Article', body: 'Article body' }),
      isArticle: true,
    });

    expect(kind).toBe(PubkyAppPostKind.Long);
  });

  it('returns long for article even when content contains a url', () => {
    const kind = Core.inferPostKindForCreate({
      content: JSON.stringify({ title: 'Title', body: 'See https://pubky.app' }),
      isArticle: true,
    });

    expect(kind).toBe(PubkyAppPostKind.Long);
  });
});
