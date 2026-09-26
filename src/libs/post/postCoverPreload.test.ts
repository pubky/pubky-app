import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePostCoverPreloadUrls } from './postCoverPreload';
import { POST_COVER_DESKTOP_VARIANT, POST_COVER_MOBILE_VARIANT } from './postCoverVariant';

vi.mock('@/services/nexus/file/file.api', () => ({
  filesApi: {
    getFileUrl: vi.fn(
      ({ pubky, file_id, variant }: { pubky: string; file_id: string; variant: string }) =>
        `https://cdn.test/files/${pubky}/${file_id}/${variant}`,
    ),
  },
}));

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const ATTACHMENT = `pubky://${AUTHOR}/pub/pubky.app/files/0035R8SA18DE0`;
const article = (body: string) => JSON.stringify({ title: 'How to Think About Names', body });
const cover = {
  mobile: `https://cdn.test/files/${AUTHOR}/0035R8SA18DE0/${POST_COVER_MOBILE_VARIANT}`,
  desktop: `https://cdn.test/files/${AUTHOR}/0035R8SA18DE0/${POST_COVER_DESKTOP_VARIANT}`,
};

describe('resolvePostCoverPreloadUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves both cover variants of slot 0, the ones the hero renders', () => {
    const urls = resolvePostCoverPreloadUrls({
      kind: 'long',
      content: article('My name is John Carvalho.'),
      attachments: [ATTACHMENT],
    });

    // Built from the shared constants, so the preload can never ask for a different file
    // than the `<picture>` in PostArticleDetail: `feed` below the desktop breakpoint, `large`
    // above it.
    expect(POST_COVER_MOBILE_VARIANT).toBe('feed');
    expect(POST_COVER_DESKTOP_VARIANT).toBe('large');
    expect(urls).toEqual(cover);
  });

  it('returns null when the body references slot 0, which makes it an inline image', () => {
    const urls = resolvePostCoverPreloadUrls({
      kind: 'long',
      content: article('Intro\n\n![diagram](attachment:0)\n\nOutro'),
      attachments: [ATTACHMENT],
    });

    expect(urls).toBeNull();
  });

  it('returns null for a post that is not an article', () => {
    expect(resolvePostCoverPreloadUrls({ kind: 'short', content: 'gm', attachments: [ATTACHMENT] })).toBeNull();
    expect(
      resolvePostCoverPreloadUrls({ kind: 'long', content: 'plain text, not article JSON', attachments: [ATTACHMENT] }),
    ).toBeNull();
  });

  it('returns null when the post has no attachments', () => {
    expect(resolvePostCoverPreloadUrls({ kind: 'long', content: article('Body'), attachments: null })).toBeNull();
    expect(resolvePostCoverPreloadUrls({ kind: 'long', content: article('Body'), attachments: [] })).toBeNull();
  });

  it('returns null for a slot-0 reference that is not a CDN file URI', () => {
    const urls = resolvePostCoverPreloadUrls({
      kind: 'long',
      content: article('Body'),
      attachments: ['https://example.com/hero.png'],
    });

    expect(urls).toBeNull();
  });

  it('ignores later attachments, which render inline in the body', () => {
    const urls = resolvePostCoverPreloadUrls({
      kind: 'long',
      content: article('Body'),
      attachments: [ATTACHMENT, `pubky://${AUTHOR}/pub/pubky.app/files/0035R8SA18DE1`],
    });

    expect(urls).toEqual(cover);
  });
});
