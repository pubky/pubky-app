import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePostCoverPreloadUrl } from './postCoverPreload';
import { POST_COVER_VARIANT } from './postCoverVariant';

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

describe('resolvePostCoverPreloadUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the cover variant of slot 0, the same one the hero renders', () => {
    const url = resolvePostCoverPreloadUrl({
      kind: 'long',
      content: article('My name is John Carvalho.'),
      attachments: [ATTACHMENT],
    });

    // Built from the shared constant, so the preload can never ask for a
    // different file than the `<img>` in PostArticleDetail.
    expect(POST_COVER_VARIANT).toBe('feed');
    expect(url).toBe(`https://cdn.test/files/${AUTHOR}/0035R8SA18DE0/${POST_COVER_VARIANT}`);
  });

  it('returns null when the body references slot 0, which makes it an inline image', () => {
    const url = resolvePostCoverPreloadUrl({
      kind: 'long',
      content: article('Intro\n\n![diagram](attachment:0)\n\nOutro'),
      attachments: [ATTACHMENT],
    });

    expect(url).toBeNull();
  });

  it('returns null for a post that is not an article', () => {
    expect(resolvePostCoverPreloadUrl({ kind: 'short', content: 'gm', attachments: [ATTACHMENT] })).toBeNull();
    expect(
      resolvePostCoverPreloadUrl({ kind: 'long', content: 'plain text, not article JSON', attachments: [ATTACHMENT] }),
    ).toBeNull();
  });

  it('returns null when the post has no attachments', () => {
    expect(resolvePostCoverPreloadUrl({ kind: 'long', content: article('Body'), attachments: null })).toBeNull();
    expect(resolvePostCoverPreloadUrl({ kind: 'long', content: article('Body'), attachments: [] })).toBeNull();
  });

  it('returns null for a slot-0 reference that is not a CDN file URI', () => {
    const url = resolvePostCoverPreloadUrl({
      kind: 'long',
      content: article('Body'),
      attachments: ['https://example.com/hero.png'],
    });

    expect(url).toBeNull();
  });

  it('ignores later attachments, which render inline in the body', () => {
    const url = resolvePostCoverPreloadUrl({
      kind: 'long',
      content: article('Body'),
      attachments: [ATTACHMENT, `pubky://${AUTHOR}/pub/pubky.app/files/0035R8SA18DE1`],
    });

    expect(url).toBe(`https://cdn.test/files/${AUTHOR}/0035R8SA18DE0/${POST_COVER_VARIANT}`);
  });
});
