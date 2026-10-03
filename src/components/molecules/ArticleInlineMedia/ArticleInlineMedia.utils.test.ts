import { describe, expect, it, vi } from 'vitest';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import type { ArticleMediaFile } from './ArticleInlineMedia.types';
import { resolveArticleMedia } from './ArticleInlineMedia.utils';

vi.mock('@/libs/file/pubkyFileCdnUrl', () => ({
  pubkyUriToCdnUrl: (uri: string, variant: string) => `cdn://${uri}/${variant}`,
}));

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const OTHER = 'zzzz96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const fileUri = (id: string, owner = AUTHOR) => `pubky://${owner}/pub/pubky.app/files/${id}`;
const attachments = [fileUri('cover'), fileUri('clip'), fileUri('song'), fileUri('paper')];
const files: ArticleMediaFile[] = [
  { uri: fileUri('paper'), content_type: 'application/pdf', name: 'paper.pdf' },
  { uri: fileUri('song'), content_type: 'audio/mpeg', name: 'song.mp3' },
  { uri: fileUri('clip'), content_type: 'video/mp4', name: 'clip.mp4' },
  { uri: fileUri('cover'), content_type: 'image/jpeg', name: 'cover.jpg' },
];
const cdn = (src: string) =>
  resolveArticleMedia({ src, attachments, authorId: AUTHOR, postId: `${AUTHOR}:p`, files, metadataSettled: true });

describe('resolveArticleMedia — attachment slots on the CDN', () => {
  it('types each slot from the file row matched by uri, whatever order the rows arrive in', () => {
    expect(cdn('attachment:1')).toEqual({
      kind: 'video',
      url: `cdn://${fileUri('clip')}/main`,
      name: 'clip.mp4',
      external: false,
    });
    expect(cdn('attachment:2')).toEqual({
      kind: 'audio',
      url: `cdn://${fileUri('song')}/main`,
      name: 'song.mp3',
      external: false,
    });
    expect(cdn('attachment:3')).toEqual({
      kind: 'pdf',
      url: `cdn://${fileUri('paper')}/main`,
      name: 'paper.pdf',
      external: false,
    });
    expect(cdn('attachment:0')).toEqual({ kind: 'image' });
  });

  it('marks a row of a type nothing renders as unsupported, and an empty type as an image', () => {
    const typed = (content_type: string) =>
      resolveArticleMedia({
        src: 'attachment:1',
        attachments,
        authorId: AUTHOR,
        postId: `${AUTHOR}:p`,
        files: [{ uri: fileUri('clip'), content_type, name: 'archive.zip' }],
        metadataSettled: true,
      });

    expect(typed('application/zip')).toEqual({ kind: 'unsupported' });
    expect(typed('')).toEqual({ kind: 'image' });
  });

  it('leaves invalid references to the image path, which renders the placeholder', () => {
    expect(cdn('attachment:9')).toEqual({ kind: 'image' });
    expect(cdn('attachment:01')).toEqual({ kind: 'image' });
    expect(cdn('')).toEqual({ kind: 'image' });
    expect(
      resolveArticleMedia({
        src: 'attachment:1',
        attachments: [fileUri('x'), fileUri('clip', OTHER)],
        authorId: AUTHOR,
        postId: 'p',
        files,
        metadataSettled: true,
      }),
    ).toEqual({ kind: 'image' });
  });

  it('reserves space while a slot has no row yet, and falls back to the image path once settled', () => {
    const base = { src: 'attachment:1', attachments, authorId: AUTHOR, postId: 'p', files: [] };
    expect(resolveArticleMedia({ ...base, metadataSettled: false })).toEqual({ kind: 'loading' });
    expect(resolveArticleMedia({ ...base, metadataSettled: true })).toEqual({ kind: 'image' });
  });

  it('prefers the aligned same-session local entry over the file row', () => {
    const localStoreAttachments: AttachmentConstructed[] = [
      { type: 'image/png', name: 'cover.png', urls: { main: 'blob:cover' } },
      { type: 'video/mp4', name: 'fresh.mp4', urls: { main: 'blob:fresh' } },
      { type: 'audio/wav', name: 'fresh.wav', urls: { main: 'blob:wav' } },
      { type: 'application/pdf', name: 'fresh.pdf', urls: { main: 'blob:pdf' } },
    ];
    const resolved = resolveArticleMedia({
      src: 'attachment:1',
      attachments,
      authorId: AUTHOR,
      postId: 'p',
      files: [],
      metadataSettled: false,
      localStoreAttachments,
    });

    expect(resolved).toEqual({ kind: 'video', url: 'blob:fresh', name: 'fresh.mp4', external: false });
  });

  it('ignores a local store entry whose length does not match the attachments (stale after an edit)', () => {
    const localStoreAttachments: AttachmentConstructed[] = [
      { type: 'video/mp4', name: 'x.mp4', urls: { main: 'blob:x' } },
    ];
    const resolved = resolveArticleMedia({
      src: 'attachment:1',
      attachments,
      authorId: AUTHOR,
      postId: 'p',
      files,
      metadataSettled: true,
      localStoreAttachments,
    });

    expect(resolved).toEqual({
      kind: 'video',
      url: `cdn://${fileUri('clip')}/main`,
      name: 'clip.mp4',
      external: false,
    });
  });
});

describe('resolveArticleMedia — unlocked content', () => {
  const localAttachments: AttachmentConstructed[] = [
    { type: 'image/png', name: 'attachment-0', urls: { main: 'blob:cover' }, slot: 0 },
    { type: 'video/mp4', name: 'attachment-1', urls: { main: 'blob:clip' }, slot: 2 },
  ];

  it('types a slot from the bytes the reader holds', () => {
    expect(resolveArticleMedia({ src: 'attachment:2', localAttachments })).toEqual({
      kind: 'video',
      url: 'blob:clip',
      name: 'attachment-1',
      external: false,
    });
    expect(resolveArticleMedia({ src: 'attachment:0', localAttachments })).toEqual({ kind: 'image' });
  });

  it('leaves a lost slot to the image path', () => {
    expect(resolveArticleMedia({ src: 'attachment:1', localAttachments })).toEqual({ kind: 'image' });
  });
});

describe('resolveArticleMedia — direct destinations', () => {
  it('types an https URL by its extension and marks it external', () => {
    expect(cdn('https://example.com/clip.mp4')).toEqual({
      kind: 'video',
      url: 'https://example.com/clip.mp4',
      name: undefined,
      external: true,
    });
    expect(cdn('https://example.com/paper.pdf?dl=1')).toEqual({
      kind: 'pdf',
      url: 'https://example.com/paper.pdf?dl=1',
      name: undefined,
      external: true,
    });
  });

  it('keeps images, unknown extensions, pubky URIs and other schemes on the image path', () => {
    expect(cdn('https://example.com/pic.png')).toEqual({ kind: 'image' });
    expect(cdn('https://example.com/file')).toEqual({ kind: 'image' });
    expect(cdn(fileUri('direct', OTHER))).toEqual({ kind: 'image' });
    expect(cdn('http://example.com/clip.mp4')).toEqual({ kind: 'image' });
    expect(cdn('javascript:alert(1)')).toEqual({ kind: 'image' });
  });
});
