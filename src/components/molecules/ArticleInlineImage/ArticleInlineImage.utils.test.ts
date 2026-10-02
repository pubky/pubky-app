import { describe, expect, it, vi } from 'vitest';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { resolveArticleImageSrc, resolveUnlockedArticleImageSrc } from './ArticleInlineImage.utils';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getFileUrl: vi.fn(({ fileId, variant }: { fileId: string; variant: string }) => `cdn://${fileId}?v=${variant}`),
  },
}));

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const OTHER = 'z4dr71ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1abc';
const fileUri = (id: string, owner = AUTHOR) => `pubky://${owner}/pub/pubky.app/files/${id}`;

const resolve = (src: string | null | undefined, attachments: string[] = []) =>
  resolveArticleImageSrc({ src, attachments, authorId: AUTHOR });

describe('resolveArticleImageSrc', () => {
  it('resolves valid attachment references to CDN main URLs', () => {
    expect(resolve('attachment:0', [fileUri('cover')])).toEqual({
      kind: 'attachment',
      url: `cdn://${AUTHOR}:cover?v=main`,
      index: 0,
    });
    expect(resolve('attachment:1', [fileUri('cover'), fileUri('inline')])).toEqual({
      kind: 'attachment',
      url: `cdn://${AUTHOR}:inline?v=main`,
      index: 1,
    });
  });

  it('rejects out-of-range references', () => {
    expect(resolve('attachment:3', [fileUri('a')])).toEqual({ kind: 'invalid' });
    expect(resolve('attachment:0', [])).toEqual({ kind: 'invalid' });
  });

  it('rejects references whose target is not an author-owned file URI', () => {
    expect(resolve('attachment:0', [fileUri('theirs', OTHER)])).toEqual({ kind: 'invalid' });
    expect(resolve('attachment:0', ['https://example.com/a.png'])).toEqual({ kind: 'invalid' });
    expect(resolve('attachment:0', [`pubky://${AUTHOR}/pub/pubky.app/blobs/b`])).toEqual({ kind: 'invalid' });
  });

  it('rejects malformed attachment-scheme destinations', () => {
    expect(resolve('attachment:01', [fileUri('a')])).toEqual({ kind: 'invalid' });
    expect(resolve('ATTACHMENT:0', [fileUri('a')])).toEqual({ kind: 'invalid' });
  });

  it('resolves direct pubky file URIs regardless of owner', () => {
    expect(resolve(fileUri('mine'))).toEqual({ kind: 'pubky', url: `cdn://${AUTHOR}:mine?v=main` });
    expect(resolve(fileUri('theirs', OTHER))).toEqual({ kind: 'pubky', url: `cdn://${OTHER}:theirs?v=main` });
  });

  it('rejects pubky URIs that are not file resources', () => {
    expect(resolve(`pubky://${AUTHOR}/pub/pubky.app/posts/p1`)).toEqual({ kind: 'invalid' });
  });

  it('allows https URLs and rejects every other scheme', () => {
    expect(resolve('https://example.com/pic.png')).toEqual({ kind: 'external', url: 'https://example.com/pic.png' });
    expect(resolve('http://example.com/pic.png')).toEqual({ kind: 'invalid' });
    expect(resolve('data:image/png;base64,AAAA')).toEqual({ kind: 'invalid' });
    expect(resolve('blob:https://app/123')).toEqual({ kind: 'invalid' });
    expect(resolve('javascript:alert(1)')).toEqual({ kind: 'invalid' });
    expect(resolve('not a url')).toEqual({ kind: 'invalid' });
    expect(resolve('')).toEqual({ kind: 'invalid' });
    expect(resolve(undefined)).toEqual({ kind: 'invalid' });
  });
});

describe('resolveUnlockedArticleImageSrc', () => {
  const media = (name: string, slot: number, type = 'image/png'): AttachmentConstructed => ({
    type,
    name,
    urls: { main: `blob:${name}` },
    slot,
  });
  const resolveUnlocked = (src: string | null | undefined, localAttachments: AttachmentConstructed[] = []) =>
    resolveUnlockedArticleImageSrc({ src, localAttachments });

  it('resolves an attachment reference to the local object URL of that slot', () => {
    expect(resolveUnlocked('attachment:1', [media('cover', 0), media('inline', 1)])).toEqual({
      kind: 'attachment',
      url: 'blob:inline',
      index: 1,
    });
  });

  it('resolves by slot when a lost attachment left a gap', () => {
    const localAttachments = [media('cover', 0), media('second-image', 2)];

    expect(resolveUnlocked('attachment:2', localAttachments)).toEqual({
      kind: 'attachment',
      url: 'blob:second-image',
      index: 2,
    });
    // The lost slot shows the placeholder, never the image that moved into its position.
    expect(resolveUnlocked('attachment:1', localAttachments)).toEqual({ kind: 'invalid' });
  });

  it('rejects a slot that does not hold an image', () => {
    expect(resolveUnlocked('attachment:0', [media('clip', 0, 'video/mp4')])).toEqual({ kind: 'invalid' });
  });

  it('rejects malformed attachment references', () => {
    expect(resolveUnlocked('attachment:01', [media('cover', 0)])).toEqual({ kind: 'invalid' });
    expect(resolveUnlocked('ATTACHMENT:0', [media('cover', 0)])).toEqual({ kind: 'invalid' });
  });

  it('keeps the policy of a normal article for every other destination', () => {
    expect(resolveUnlocked('https://example.com/pic.png')).toEqual({
      kind: 'external',
      url: 'https://example.com/pic.png',
    });
    expect(resolveUnlocked(fileUri('shared', OTHER))).toEqual({ kind: 'pubky', url: `cdn://${OTHER}:shared?v=main` });
    expect(resolveUnlocked('http://example.com/pic.png')).toEqual({ kind: 'invalid' });
    expect(resolveUnlocked('blob:whatever')).toEqual({ kind: 'invalid' });
    expect(resolveUnlocked(undefined)).toEqual({ kind: 'invalid' });
  });
});
