import { PubkyAppPostKind } from 'pubky-app-specs';
import { describe, expect, it } from 'vitest';
import { inferPostKindForCreate, resolveTagTargetCompositeIdForPostCreate } from '@/pipes/post/post.kind';

describe('inferPostKindForCreate', () => {
  it('returns video when at least one video attachment exists', () => {
    const kind = inferPostKindForCreate({
      content: 'Look at this',
      attachments: [
        new File(['image-content'], 'image.png', { type: 'image/png' }),
        new File(['video-content'], 'clip.mp4', { type: 'video/mp4' }),
      ],
    });

    expect(kind).toBe(PubkyAppPostKind.Video);
  });

  it('returns image when attachments contain image and no video', () => {
    const kind = inferPostKindForCreate({
      content: 'Look at this',
      attachments: [
        new File(['image-content'], 'image.png', { type: 'image/png' }),
        new File(['pdf-content'], 'doc.pdf', { type: 'application/pdf' }),
      ],
    });

    expect(kind).toBe(PubkyAppPostKind.Image);
  });

  it('returns file when attachments are non-image and non-video', () => {
    const kind = inferPostKindForCreate({
      content: 'A document',
      attachments: [new File(['pdf-content'], 'doc.pdf', { type: 'application/pdf' })],
    });

    expect(kind).toBe(PubkyAppPostKind.File);
  });

  it('returns link when content contains url and there are no attachments', () => {
    const kind = inferPostKindForCreate({
      content: 'Read https://pubky.app',
    });

    expect(kind).toBe(PubkyAppPostKind.Link);
  });

  it('returns short when there is no attachment and no url', () => {
    const kind = inferPostKindForCreate({
      content: 'Just plain text',
    });

    expect(kind).toBe(PubkyAppPostKind.Short);
  });

  it('returns short for ignored protocols like mailto and ftp', () => {
    const kind = inferPostKindForCreate({
      content: 'Contact me at mailto:test@example.com or ftp://example.com/file.txt',
    });

    expect(kind).toBe(PubkyAppPostKind.Short);
  });

  it('does not mark markdown links as link kind', () => {
    const kind = inferPostKindForCreate({
      content: 'See [pubky](https://pubky.app) for details',
    });

    expect(kind).toBe(PubkyAppPostKind.Short);
  });

  it('prioritizes link over attachments', () => {
    const kind = inferPostKindForCreate({
      content: 'Watch https://pubky.app/video',
      attachments: [new File(['video-content'], 'clip.mp4', { type: 'video/mp4' })],
    });

    expect(kind).toBe(PubkyAppPostKind.Link);
  });

  it('prioritizes link over image attachments', () => {
    const kind = inferPostKindForCreate({
      content: 'Check https://pubky.app',
      attachments: [new File(['image-content'], 'photo.png', { type: 'image/png' })],
    });

    expect(kind).toBe(PubkyAppPostKind.Link);
  });

  it('returns long when isArticle is true', () => {
    const kind = inferPostKindForCreate({
      content: JSON.stringify({ title: 'My Article', body: 'Article body' }),
      isArticle: true,
    });

    expect(kind).toBe(PubkyAppPostKind.Long);
  });

  it('returns long for article even when content contains a url', () => {
    const kind = inferPostKindForCreate({
      content: JSON.stringify({ title: 'Title', body: 'See https://pubky.app' }),
      isArticle: true,
    });

    expect(kind).toBe(PubkyAppPostKind.Long);
  });
});

describe('resolveTagTargetCompositeIdForPostCreate', () => {
  const authorId = 'authorpubky111111111111111111111111111111111111111';
  const newPostId = 'newpost1';
  const originalPostId = 'otherauthor222222222222222222222222222222222222222:original1';

  it('targets the new post when not a repost', () => {
    expect(
      resolveTagTargetCompositeIdForPostCreate({
        authorId,
        newPostId,
        content: '',
        attachments: undefined,
      }),
    ).toBe(`${authorId}:${newPostId}`);
  });

  it('targets the original post for a simple repost (no text, no attachments)', () => {
    expect(
      resolveTagTargetCompositeIdForPostCreate({
        authorId,
        newPostId,
        originalPostId,
        content: '',
        attachments: undefined,
      }),
    ).toBe(originalPostId);
  });

  it('targets the new post for a quote repost with text', () => {
    expect(
      resolveTagTargetCompositeIdForPostCreate({
        authorId,
        newPostId,
        originalPostId,
        content: 'my take',
        attachments: undefined,
      }),
    ).toBe(`${authorId}:${newPostId}`);
  });

  it('targets the new post for a quote repost with attachment only', () => {
    expect(
      resolveTagTargetCompositeIdForPostCreate({
        authorId,
        newPostId,
        originalPostId,
        content: '',
        attachments: [new File(['x'], 'a.png', { type: 'image/png' })],
      }),
    ).toBe(`${authorId}:${newPostId}`);
  });
});
