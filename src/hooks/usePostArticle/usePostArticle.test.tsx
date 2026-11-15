import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { POST_COVER_DESKTOP_VARIANT, POST_COVER_MOBILE_VARIANT } from '@/libs/post/postCoverVariant';
import { toast } from '@/molecules/Toaster/toast';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { usePostArticle } from './usePostArticle';

// Mock toast
vi.mock('@/molecules/Toaster/toast');

// Mock dependencies
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getMetadata: vi.fn(),
    fetchFiles: vi.fn(),
    getFileUrl: vi.fn(),
  },
}));
vi.mock('@/services/nexus/file/file.types', () => ({
  FileVariant: {
    MAIN: 'main',
    FEED: 'feed',
    LARGE: 'large',
    SMALL: 'small',
  },
}));

const mockGetMetadata = vi.mocked(FileController.getMetadata);
const mockGetFileUrl = vi.mocked(FileController.getFileUrl);

// Helper to create mock file metadata
const createMockImageMetadata = (id: string, name = 'cover.jpg'): NexusFileDetails => ({
  id,
  name,
  content_type: 'image/jpeg',
  size: 1024,
  src: `https://example.com/files/${id}`,
  created_at: Date.now(),
  indexed_at: Date.now(),
  metadata: {},
  owner_id: id.split(':')[0],
  uri: `pubky://${id.split(':')[0]}/pub/pubky.app/files/${id.split(':')[1]}`,
  urls: {
    main: `https://example.com/files/${id}/main`,
    feed: `https://example.com/files/${id}/feed`,
    small: `https://example.com/files/${id}/small`,
  },
});

const createMockPdfMetadata = (id: string, name = 'document.pdf'): NexusFileDetails => ({
  id,
  name,
  content_type: 'application/pdf',
  size: 4096,
  src: `https://example.com/files/${id}`,
  created_at: Date.now(),
  indexed_at: Date.now(),
  metadata: {},
  owner_id: id.split(':')[0],
  uri: `pubky://${id.split(':')[0]}/pub/pubky.app/files/${id.split(':')[1]}`,
  urls: {
    main: `https://example.com/files/${id}/main`,
    feed: `https://example.com/files/${id}/feed`,
    small: `https://example.com/files/${id}/small`,
  },
});

describe('usePostArticle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `https://cdn.example.com/${fileId}/${variant}`);
  });

  describe('Content Parsing', () => {
    it('parses title and body from JSON content', () => {
      const content = JSON.stringify({ title: 'My Article Title', body: 'This is the article body content.' });

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments: null,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      expect(result.current.title).toBe('My Article Title');
      expect(result.current.body).toBe('This is the article body content.');
    });

    it('returns the title and body on the first render', () => {
      const content = JSON.stringify({ title: 'My Article Title', body: 'The body.' });
      const renders: string[] = [];

      renderHook(() => {
        const result = usePostArticle({ content, attachments: null, coverImageVariant: FileVariant.FEED });
        renders.push(result.title);
        return result;
      });

      expect(renders[0]).toBe('My Article Title');
    });

    it('handles empty title and body', () => {
      const content = JSON.stringify({ title: '', body: '' });

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments: null,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      expect(result.current.title).toBe('');
      expect(result.current.body).toBe('');
    });

    it('handles content with special characters', () => {
      const content = JSON.stringify({
        title: 'Title with "quotes" & <special> characters',
        body: 'Body with\nnewlines\tand\ttabs',
      });

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments: null,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      expect(result.current.title).toBe('Title with "quotes" & <special> characters');
      expect(result.current.body).toBe('Body with\nnewlines\tand\ttabs');
    });
  });

  describe('Cover Image Loading', () => {
    it('returns null coverImage when attachments is null', () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments: null,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      expect(result.current.coverImage).toBeNull();
      expect(mockGetMetadata).not.toHaveBeenCalled();
    });

    it('returns null coverImage when attachments is empty array', () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments: [],
          coverImageVariant: FileVariant.FEED,
        }),
      );

      expect(result.current.coverImage).toBeNull();
      expect(mockGetMetadata).not.toHaveBeenCalled();
    });

    it('loads cover image when attachment is an image', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const attachments = ['pubky://user123/pub/pubky.app/files/file456'];
      const mockMetadata = createMockImageMetadata('user123:file456', 'beautiful-cover.jpg');
      mockMetadata.metadata = { width: '800', height: '1200' };

      mockGetMetadata.mockResolvedValue([mockMetadata]);

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('beautiful-cover.jpg');
      });

      expect(mockGetMetadata).toHaveBeenCalledWith({ fileAttachments: attachments });
      expect(mockGetFileUrl).toHaveBeenCalledWith({
        fileId: 'user123:file456',
        variant: FileVariant.FEED,
      });
      expect(result.current.coverImage).toEqual({
        src: 'https://cdn.example.com/user123:file456/feed',
        alt: 'beautiful-cover.jpg',
        width: 800,
        height: 1200,
      });
    });

    it('uses correct variant for cover image URL', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const attachments = ['pubky://user123/pub/pubky.app/files/file456'];
      const mockMetadata = createMockImageMetadata('user123:file456');

      mockGetMetadata.mockResolvedValue([mockMetadata]);

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments,
          coverImageVariant: FileVariant.MAIN,
        }),
      );

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('cover.jpg');
      });

      expect(mockGetFileUrl).toHaveBeenCalledWith({
        fileId: 'user123:file456',
        variant: FileVariant.MAIN,
      });
    });

    it('resolves the desktop source from the desktop variant of the same file', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const attachments = ['pubky://user123/pub/pubky.app/files/file456'];
      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user123:file456', 'hero.png')]);

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments,
          coverImageVariant: FileVariant.FEED,
          coverImageDesktopVariant: FileVariant.LARGE,
        }),
      );

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('hero.png');
      });

      expect(result.current.coverImage).toEqual({
        src: 'https://cdn.example.com/user123:file456/feed',
        desktopSrc: 'https://cdn.example.com/user123:file456/large',
        alt: 'hero.png',
      });
    });

    it('resolves the desktop fallback source next to the desktop variant', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const attachments = ['pubky://user123/pub/pubky.app/files/file456'];
      const mockMetadata = createMockImageMetadata('user123:file456', 'beautiful-cover.jpg');

      mockGetMetadata.mockResolvedValue([mockMetadata]);

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments,
          coverImageVariant: FileVariant.FEED,
          coverImageDesktopVariant: FileVariant.LARGE,
          coverImageDesktopFallbackVariant: FileVariant.MAIN,
        }),
      );

      // Provisional (no row yet): no fallback, so a slot 0 that is not an image cannot pull its
      // original upload through the `<img>`.
      expect(result.current.coverImage?.desktopFallbackSrc).toBeUndefined();

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('beautiful-cover.jpg');
      });

      // The hero needs a desktop size it can degrade to when `large` is not served yet.
      expect(mockGetFileUrl).toHaveBeenCalledWith({ fileId: 'user123:file456', variant: FileVariant.MAIN });
      expect(result.current.coverImage).toEqual({
        src: 'https://cdn.example.com/user123:file456/feed',
        desktopSrc: 'https://cdn.example.com/user123:file456/large',
        desktopFallbackSrc: 'https://cdn.example.com/user123:file456/main',
        alt: 'beautiful-cover.jpg',
      });
    });

    it('clears a loaded cover image when the attachment is removed', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const attachments = ['pubky://user123/pub/pubky.app/files/file456'];
      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user123:file456')]);

      const { result, rerender } = renderHook(
        ({ attachments }: { attachments: string[] | null }) =>
          usePostArticle({
            content,
            attachments,
            coverImageVariant: FileVariant.FEED,
          }),
        { initialProps: { attachments: attachments as string[] | null } },
      );

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('cover.jpg');
      });

      rerender({ attachments: null });

      await waitFor(() => {
        expect(result.current.coverImage).toBeNull();
      });
    });

    it('clears a loaded cover image when the attachment is replaced by a non-image', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user123:file456')]);

      const { result, rerender } = renderHook(
        ({ attachments }: { attachments: string[] | null }) =>
          usePostArticle({
            content,
            attachments,
            coverImageVariant: FileVariant.FEED,
          }),
        { initialProps: { attachments: ['pubky://user123/pub/pubky.app/files/file456'] as string[] | null } },
      );

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('cover.jpg');
      });

      mockGetMetadata.mockResolvedValue([createMockPdfMetadata('user123:file789')]);
      rerender({ attachments: ['pubky://user123/pub/pubky.app/files/file789'] });

      await waitFor(() => {
        expect(result.current.coverImage).toBeNull();
      });
    });

    it('does not set cover image when attachment is not an image', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const attachments = ['pubky://user123/pub/pubky.app/files/file456'];
      const mockMetadata = createMockPdfMetadata('user123:file456');

      mockGetMetadata.mockResolvedValue([mockMetadata]);

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      // The attachment uri names a cover, so it paints before the row lands; the row is the only
      // thing that can say slot 0 is not an image, and the provisional cover drops once it does.
      expect(result.current.coverImage).not.toBeNull();

      await waitFor(() => {
        expect(result.current.coverImage).toBeNull();
      });
    });

    it('drops the provisional cover once the lookup settles with no file row', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const attachments = ['pubky://user123/pub/pubky.app/files/file456'];

      mockGetMetadata.mockResolvedValue([]);

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      // The uri names a cover, so it paints before the lookup answers.
      expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');

      // Nexus omits a file it no longer serves: a settled lookup with no row is authoritative, so
      // the hero does not stay a broken image.
      await waitFor(() => {
        expect(result.current.coverImage).toBeNull();
      });
      expect(result.current.isCoverLoading).toBe(false);
    });

    it('uses first attachment when multiple attachments provided', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const attachments = ['pubky://user123/pub/pubky.app/files/file1', 'pubky://user123/pub/pubky.app/files/file2'];
      const mockMetadata = createMockImageMetadata('user123:file1', 'first-image.jpg');

      mockGetMetadata.mockResolvedValue([mockMetadata]);

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('first-image.jpg');
      });
    });
  });

  describe('Error Handling', () => {
    it('shows toast and returns empty values when content is malformed JSON', () => {
      const malformedContent = 'this is not valid JSON';

      const { result } = renderHook(() =>
        usePostArticle({
          content: malformedContent,
          attachments: null,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not parse article content',
      });
      expect(result.current.title).toBe('');
      expect(result.current.body).toBe('');
    });

    it('drops the cover and reports it when the metadata lookup fails', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const attachments = ['pubky://user123/pub/pubky.app/files/file456'];

      mockGetMetadata.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      await waitFor(() => {
        expect(vi.mocked(toast)).toHaveBeenCalled();
      });

      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not load cover image',
      });
      await waitFor(() => {
        expect(result.current.coverImage).toBeNull();
      });
    });

    it('never shows the previous cover for a replaced attachment whose lookup fails', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      mockGetMetadata.mockResolvedValueOnce([createMockImageMetadata('user123:file456', 'old-cover.jpg')]);

      const { result, rerender } = renderHook(
        ({ attachments }: { attachments: string[] | null }) =>
          usePostArticle({
            content,
            attachments,
            coverImageVariant: FileVariant.FEED,
          }),
        { initialProps: { attachments: ['pubky://user123/pub/pubky.app/files/file456'] as string[] | null } },
      );

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('old-cover.jpg');
      });

      // An edit replaced the attachments. The new uri paints provisionally, without the old row's
      // alt text, and the failed lookup then drops it: the stale cover never lingers.
      mockGetMetadata.mockRejectedValueOnce(new Error('Network error'));
      rerender({ attachments: ['pubky://user123/pub/pubky.app/files/file789'] });

      expect(result.current.coverImage?.src).not.toBe('https://cdn.example.com/user123:file456/feed');
      expect(result.current.coverImage?.alt).not.toBe('old-cover.jpg');
      await waitFor(() => {
        expect(result.current.coverImage).toBeNull();
      });
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not load cover image',
      });
    });
  });

  describe('Effect Dependencies', () => {
    it('refetches when attachments change', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const initialAttachments = ['pubky://user123/pub/pubky.app/files/file1'];
      const newAttachments = ['pubky://user123/pub/pubky.app/files/file2'];

      const mockMetadata1 = createMockImageMetadata('user123:file1', 'image1.jpg');
      const mockMetadata2 = createMockImageMetadata('user123:file2', 'image2.jpg');

      mockGetMetadata.mockResolvedValueOnce([mockMetadata1]).mockResolvedValueOnce([mockMetadata2]);

      const { result, rerender } = renderHook(
        ({ attachments }) =>
          usePostArticle({
            content,
            attachments,
            coverImageVariant: FileVariant.FEED,
          }),
        { initialProps: { attachments: initialAttachments } },
      );

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('image1.jpg');
      });

      rerender({ attachments: newAttachments });

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('image2.jpg');
      });

      expect(mockGetMetadata).toHaveBeenCalledTimes(2);
    });

    it('refetches when coverImageVariant changes', async () => {
      const content = JSON.stringify({ title: 'Test', body: 'Content' });
      const attachments = ['pubky://user123/pub/pubky.app/files/file1'];
      const mockMetadata = createMockImageMetadata('user123:file1', 'image.jpg');

      mockGetMetadata.mockResolvedValue([mockMetadata]);

      const { result, rerender } = renderHook(
        ({ variant }) =>
          usePostArticle({
            content,
            attachments,
            coverImageVariant: variant,
          }),
        { initialProps: { variant: FileVariant.FEED } },
      );

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('image.jpg');
      });

      expect(mockGetFileUrl).toHaveBeenLastCalledWith({
        fileId: 'user123:file1',
        variant: FileVariant.FEED,
      });

      rerender({ variant: FileVariant.MAIN });

      await waitFor(() => {
        expect(mockGetFileUrl).toHaveBeenLastCalledWith({
          fileId: 'user123:file1',
          variant: FileVariant.MAIN,
        });
      });
    });
  });
});

describe('cover first paint', () => {
  const content = JSON.stringify({ title: 'Test', body: 'Content' });
  const attachments = ['pubky://user123/pub/pubky.app/files/file456'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `https://cdn.example.com/${fileId}/${variant}`);
  });

  it('renders the cover from the attachment uri before any file metadata resolves', () => {
    mockGetMetadata.mockResolvedValue([]);

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: FileVariant.FEED,
        coverImageDesktopVariant: FileVariant.MAIN,
      }),
    );

    // No metadata has resolved yet; the cover exists all the same, and its desktop source is the
    // same pair of variants the server preload resolves.
    expect(result.current.coverImage).toEqual({
      src: 'https://cdn.example.com/user123:file456/feed',
      desktopSrc: 'https://cdn.example.com/user123:file456/main',
      alt: '',
    });
  });

  it('vetoes the provisional cover at once when the local slot-0 entry is not an image', () => {
    // The row is never going to confirm anything in time: the caller already knows the type
    mockGetMetadata.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: FileVariant.FEED,
        coverImageDesktopVariant: FileVariant.MAIN,
        localAttachments: [{ type: 'video/mp4', name: 'clip.mp4', urls: { main: 'blob:clip' } }],
      }),
    );

    expect(result.current.coverImage).toBeNull();
    expect(result.current.isCoverPending).toBe(false);
  });

  it('vetoes the cover from the local slot-0 type only while the local list matches the attachment list', () => {
    mockGetMetadata.mockReturnValue(new Promise(() => {}));
    const clip = { type: 'video/mp4', name: 'clip.mp4', urls: { main: 'blob:clip' } };
    const twoAttachments = [...attachments, 'pubky://user123/pub/pubky.app/files/file789'];

    const { result, rerender } = renderHook(
      ({ localAttachments }) =>
        usePostArticle({ content, attachments: twoAttachments, coverImageVariant: FileVariant.FEED, localAttachments }),
      { initialProps: { localAttachments: [clip, clip] } },
    );
    expect(result.current.coverImage).toBeNull();

    // The store already holds a reordered edit while the post row still describes the old one
    rerender({ localAttachments: [clip] });
    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');
  });

  it('fills the alt text from the file row once it lands, keeping the URL', async () => {
    mockGetMetadata.mockResolvedValue([createMockImageMetadata('user123:file456', 'beautiful-cover.jpg')]);

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: FileVariant.FEED,
      }),
    );

    expect(result.current.coverImage?.alt).toBe('');

    await waitFor(() => {
      expect(result.current.coverImage?.alt).toBe('beautiful-cover.jpg');
    });
    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');
  });

  it('builds the cover from the same variants the server preload uses', () => {
    mockGetMetadata.mockResolvedValue([]);

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: POST_COVER_MOBILE_VARIANT,
        coverImageDesktopVariant: POST_COVER_DESKTOP_VARIANT,
      }),
    );

    // Pinned literals: `resolvePostCoverPreloadUrls` resolves slot 0 with these same constants, so
    // the preloaded resource is the one the hero asks for and a viewport downloads it once.
    expect(POST_COVER_MOBILE_VARIANT).toBe('feed');
    expect(POST_COVER_DESKTOP_VARIANT).toBe('large');
    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');
    expect(result.current.coverImage?.desktopSrc).toBe('https://cdn.example.com/user123:file456/large');
  });

  it('keeps no cover when the attachment is not a homeserver file uri', () => {
    mockGetMetadata.mockResolvedValue([]);

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments: ['https://cdn.example.com/not-a-pubky-uri.jpg'],
        coverImageVariant: FileVariant.FEED,
      }),
    );

    expect(result.current.coverImage).toBeNull();
  });
});

describe('slot-0 cover rule (inline images)', () => {
  const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
  const attachments = [`pubky://${AUTHOR}/pub/pubky.app/files/slot0`, `pubky://${AUTHOR}/pub/pubky.app/files/slot1`];

  const articleContent = (body: string) => JSON.stringify({ title: 'T', body });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats attachments[0] as the cover when the body does not reference attachment:0', async () => {
    mockGetMetadata.mockResolvedValue([createMockImageMetadata(`${AUTHOR}:slot0`)]);
    mockGetFileUrl.mockReturnValue('https://cdn.example/slot0/main');

    const { result } = renderHook(() =>
      usePostArticle({
        content: articleContent('Text with ![img](attachment:1)'),
        attachments,
        coverImageVariant: FileVariant.MAIN,
      }),
    );

    expect(result.current.coverImage?.src).toBe('https://cdn.example/slot0/main');
    await waitFor(() => {
      expect(result.current.coverImage?.alt).toBe('cover.jpg');
    });
    // Only the cover slot is resolved, never the inline attachments
    expect(mockGetMetadata).toHaveBeenCalledWith({ fileAttachments: [attachments[0]] });
  });

  it('reports no cover when the body references attachment:0', async () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: articleContent('![inline slot zero](attachment:0)'),
        attachments,
        coverImageVariant: FileVariant.MAIN,
      }),
    );

    await waitFor(() => {
      expect(result.current.body).toContain('attachment:0');
    });
    expect(result.current.coverImage).toBeNull();
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });

  it('keeps the slot-0 rule for local attachments', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: articleContent('![inline slot zero](attachment:0)'),
        attachments: null,
        coverImageVariant: FileVariant.MAIN,
        localAttachments: [{ type: 'image/png', name: 'inline.png', urls: { main: 'blob:inline' }, slot: 0 }],
        pendingAttachments: [{ slot: 0, type: 'image/png' }],
      }),
    );

    expect(result.current.coverImage).toBeNull();
    expect(result.current.isCoverPending).toBe(false);
  });
});

describe('local attachments', () => {
  const content = JSON.stringify({ title: 'T', body: 'Plain body' });
  const attachments = ['pubky://user123/pub/pubky.app/files/file456'];
  const image = (urls: AttachmentConstructed['urls'], slot?: number): AttachmentConstructed => ({
    type: 'image/png',
    name: 'cover.png',
    urls,
    width: 1600,
    height: 900,
    ...(slot === undefined ? {} : { slot }),
  });
  const remoteCover = {
    src: 'https://cdn.example.com/user123:file456/feed',
    desktopSrc: 'https://cdn.example.com/user123:file456/large',
    desktopFallbackSrc: 'https://cdn.example.com/user123:file456/main',
  };
  const heroVariants = {
    coverImageVariant: FileVariant.FEED,
    coverImageDesktopVariant: FileVariant.LARGE,
    coverImageDesktopFallbackVariant: FileVariant.MAIN,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `https://cdn.example.com/${fileId}/${variant}`);
    mockGetMetadata.mockResolvedValue([createMockImageMetadata('user123:file456')]);
  });

  it('draws an unlocked cover from its slot-0 bytes, as unlocked content has no Nexus attachments', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments: null,
        coverImageVariant: FileVariant.FEED,
        // Slot 1 comes first: a lost or reordered file must not shift the cover
        localAttachments: [image({ main: 'blob:inline' }, 1), image({ main: 'blob:cover', feed: 'blob:cover' }, 0)],
      }),
    );

    expect(result.current.coverImage).toEqual({ src: 'blob:cover', alt: 'cover.png', width: 1600, height: 900 });
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });

  it('reports no cover for a video in slot 0, so nothing holds a box for it (#2660)', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments: null,
        coverImageVariant: FileVariant.FEED,
        localAttachments: [{ type: 'video/mp4', name: 'clip.mp4', urls: { main: 'blob:clip' }, slot: 0 }],
        pendingAttachments: [{ slot: 1, type: 'image/png' }],
      }),
    );

    expect(result.current.coverImage).toBeNull();
    expect(result.current.isCoverPending).toBe(false);
  });

  it('holds the cover box while an image in slot 0 downloads, and never for a video there', () => {
    const { result, rerender } = renderHook(
      ({ type }) =>
        usePostArticle({
          content,
          attachments: null,
          coverImageVariant: FileVariant.FEED,
          localAttachments: [],
          pendingAttachments: [{ slot: 0, type }],
        }),
      { initialProps: { type: 'image/png' } },
    );
    expect(result.current.isCoverPending).toBe(true);

    rerender({ type: 'video/mp4' });
    expect(result.current.isCoverPending).toBe(false);
  });

  it('prefers the local cover over the remote one, and no longer waits on the remote row', () => {
    mockGetMetadata.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: FileVariant.FEED,
        localAttachments: [image({ main: 'blob:local' })],
      }),
    );

    expect(result.current.coverImage?.src).toBe('blob:local');
    expect(result.current.isCoverLoading).toBe(false);
  });

  it('keeps a same-session blob cover in the desktop slot, with nothing to degrade to', async () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        ...heroVariants,
        localAttachments: [image({ main: 'blob:new-cover', feed: 'blob:new-cover' })],
      }),
    );

    // Served from memory, and Nexus has no variant for it, so it owns the desktop slot even once
    // the remote cover resolves.
    await waitFor(() => expect(mockGetMetadata).toHaveBeenCalled());
    expect(result.current.coverImage).toMatchObject({ src: 'blob:new-cover', desktopSrc: 'blob:new-cover' });
    expect(result.current.coverImage?.desktopFallbackSrc).toBeUndefined();
  });

  it('renders a kept CDN cover from its seeded large variant on desktop', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        ...heroVariants,
        localAttachments: [
          image({ main: 'cdn://cover?v=main', feed: 'cdn://cover?v=feed', large: 'cdn://cover?v=large' }),
        ],
      }),
    );

    expect(result.current.coverImage).toMatchObject({
      src: 'cdn://cover?v=feed',
      desktopSrc: 'cdn://cover?v=large',
      desktopFallbackSrc: 'cdn://cover?v=main',
    });
  });

  it('holds the desktop slot while a kept CDN cover resolves, then takes the preloaded variant', async () => {
    const row = Promise.withResolvers<NexusFileDetails[]>();
    mockGetMetadata.mockReturnValue(row.promise);

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        ...heroVariants,
        localAttachments: [
          image({ main: 'https://cdn.example/cover-main.png', feed: 'https://cdn.example/cover-feed.webp' }),
        ],
      }),
    );

    // The local `main` is the original upload: with no desktop source a wide screen takes the local
    // `feed`, so the original never starts downloading on the author's own session.
    expect(result.current.coverImage?.src).toBe('https://cdn.example/cover-feed.webp');
    expect(result.current.coverImage?.desktopSrc).toBeUndefined();

    row.resolve([createMockImageMetadata('user123:file456')]);
    await waitFor(() => expect(result.current.coverImage?.desktopSrc).toBe(remoteCover.desktopSrc));
  });

  it('renders a kept CDN cover in both slots when there is no remote cover to prefer', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments: null,
        ...heroVariants,
        localAttachments: [
          image({ main: 'https://cdn.example/cover-main.png', feed: 'https://cdn.example/cover-feed.webp' }),
        ],
      }),
    );

    expect(result.current.coverImage).toMatchObject({
      src: 'https://cdn.example/cover-feed.webp',
      desktopSrc: 'https://cdn.example/cover-main.png',
      alt: 'cover.png',
    });
  });

  it('draws no cover, local or remote, when the local slot 0 is not an image', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        ...heroVariants,
        localAttachments: [{ type: 'application/pdf', name: 'document.pdf', urls: { main: 'blob:document' } }],
      }),
    );

    // The local list matches the attachment list, so its type vetoes the remote file too.
    expect(result.current.coverImage).toBeNull();
  });

  it('asks for no desktop source on a feed-sized surface', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: FileVariant.FEED,
        localAttachments: [
          image({ main: 'cdn://cover?v=main', feed: 'cdn://cover?v=feed', large: 'cdn://cover?v=large' }),
        ],
      }),
    );

    expect(result.current.coverImage).toEqual({
      src: 'cdn://cover?v=feed',
      alt: 'cover.png',
      width: 1600,
      height: 900,
    });
  });
});
