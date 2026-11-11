import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { POST_COVER_DESKTOP_VARIANT, POST_COVER_MOBILE_VARIANT } from '@/libs/post/postCoverVariant';
import { toast } from '@/molecules/Toaster/toast';
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
      expect(mockGetFileUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'user123:file456',
          variant: FileVariant.FEED,
        }),
      );
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

      expect(mockGetFileUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'user123:file456',
          variant: FileVariant.MAIN,
        }),
      );
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
      // An envelope cover: it paints before its row lands (a 0.x slot 0 waits for the row instead)
      const content = JSON.stringify({
        title: 'Test',
        body: 'Content',
        cover_image: 'pubky://user123/pub/pubky.app/files/file456',
      });
      const attachments: string[] = [];
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

      // Provisional (no row yet): no fallback, so an envelope cover that is not an image cannot pull
      // its original upload through the `<img>`.
      expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');
      expect(result.current.coverImage?.desktopFallbackSrc).toBeUndefined();

      await waitFor(() => {
        expect(result.current.coverImage?.alt).toBe('beautiful-cover.jpg');
      });

      // The hero needs a desktop size it can degrade to when `large` is not served yet.
      expect(mockGetFileUrl).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: 'user123:file456', variant: FileVariant.MAIN }),
      );
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

    it('never paints a 0.x slot 0 that its row says is not an image, before or after the row', async () => {
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

      // Only the row can say what slot 0 is, so nothing paints until it does: no PDF flashes as a
      // cover and then vanishes.
      expect(result.current.coverImage).toBeNull();
      expect(result.current.hasCover).toBe(true);

      await waitFor(() => {
        expect(result.current.isCoverLoading).toBe(false);
      });
      expect(result.current.coverImage).toBeNull();
      expect(result.current.hasCover).toBe(false);
    });

    it('drops an envelope cover whose row says it is not an image', async () => {
      // rc.1 promoted any slot 0 into `cover_image`, a PDF included; the envelope is trusted until
      // the row says otherwise, as before.
      const content = JSON.stringify({
        title: 'Test',
        body: 'Content',
        cover_image: 'pubky://user123/pub/pubky.app/files/file456',
      });
      mockGetMetadata.mockResolvedValue([createMockPdfMetadata('user123:file456')]);

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments: [],
          coverImageVariant: FileVariant.FEED,
        }),
      );

      expect(result.current.coverImage).not.toBeNull();

      await waitFor(() => {
        expect(result.current.coverImage).toBeNull();
      });
    });

    it('paints no 0.x cover while its lookup is out, and none once it settles with no file row', async () => {
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

      expect(result.current.coverImage).toBeNull();
      expect(result.current.isCoverLoading).toBe(true);

      // Nexus omits a file it no longer serves: a settled lookup with no row is authoritative, so
      // the article has no cover.
      await waitFor(() => {
        expect(result.current.isCoverLoading).toBe(false);
      });
      expect(result.current.coverImage).toBeNull();
      expect(result.current.hasCover).toBe(false);
    });

    it('drops an envelope cover once its lookup settles with no file row', async () => {
      const content = JSON.stringify({
        title: 'Test',
        body: 'Content',
        cover_image: 'pubky://user123/pub/pubky.app/files/file456',
      });

      mockGetMetadata.mockResolvedValue([]);

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments: [],
          coverImageVariant: FileVariant.FEED,
        }),
      );

      // The envelope names a cover, so it paints before the lookup answers.
      expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');

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

    it('reports a failed lookup of a 0.x slot 0 and settles on no cover', async () => {
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

      // The candidate counts as a cover slot while its row is out; nothing paints
      expect(result.current.hasCover).toBe(true);
      expect(result.current.coverImage).toBeNull();

      await waitFor(() => {
        expect(vi.mocked(toast)).toHaveBeenCalled();
      });

      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not load cover image',
      });
      expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(result.current.isCoverLoading).toBe(false);
      });
      expect(result.current.coverImage).toBeNull();
      expect(result.current.hasCover).toBe(false);
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

      expect(mockGetFileUrl).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fileId: 'user123:file1',
          variant: FileVariant.FEED,
        }),
      );

      rerender({ variant: FileVariant.MAIN });

      await waitFor(() => {
        expect(mockGetFileUrl).toHaveBeenLastCalledWith(
          expect.objectContaining({
            fileId: 'user123:file1',
            variant: FileVariant.MAIN,
          }),
        );
      });
    });
  });
});

describe('cover first paint (envelope cover)', () => {
  // Shape A: the envelope names the cover, which this app's composer only ever makes an image, so it
  // paints before its row lands. A 0.x article's slot 0 (rule B) waits for the row: see below.
  const COVER_URI = 'pubky://user123/pub/pubky.app/files/file456';
  const content = JSON.stringify({ title: 'Test', body: 'Content', cover_image: COVER_URI });
  const attachments: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `https://cdn.example.com/${fileId}/${variant}`);
  });

  it('renders the cover from the envelope uri before any file metadata resolves', () => {
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

  it('vetoes the provisional cover at once when the local cover entry is not an image', () => {
    // The row is never going to confirm anything in time: the caller already knows the type
    mockGetMetadata.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: FileVariant.FEED,
        coverImageDesktopVariant: FileVariant.MAIN,
        localCoverType: 'video/mp4',
      }),
    );

    expect(result.current.hasCover).toBe(true);
    expect(result.current.coverImage).toBeNull();
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

    // Pinned literals: `resolvePostCoverPreloadUrls` resolves the cover with these same constants,
    // so the preloaded resource is the one the hero asks for and a viewport downloads it once.
    expect(POST_COVER_MOBILE_VARIANT).toBe('feed');
    expect(POST_COVER_DESKTOP_VARIANT).toBe('large');
    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');
    expect(result.current.coverImage?.desktopSrc).toBe('https://cdn.example.com/user123:file456/large');
  });

  it('keeps no cover when the envelope cover is not a homeserver file uri', () => {
    mockGetMetadata.mockResolvedValue([]);

    const { result } = renderHook(() =>
      usePostArticle({
        content: JSON.stringify({
          title: 'Test',
          body: 'Content',
          cover_image: 'https://cdn.example.com/not-a-pubky-uri.jpg',
        }),
        attachments,
        coverImageVariant: FileVariant.FEED,
      }),
    );

    expect(result.current.coverImage).toBeNull();
  });
});

describe('0.x cover (rule B): slot 0 is the cover only once its row says image', () => {
  const content = JSON.stringify({ title: 'Test', body: 'Content' });
  const attachments = ['pubky://user123/pub/pubky.app/files/file456'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `https://cdn.example.com/${fileId}/${variant}`);
  });

  it("paints nothing until the row lands, then the cover with the row's alt text", async () => {
    mockGetMetadata.mockResolvedValue([createMockImageMetadata('user123:file456', 'beautiful-cover.jpg')]);

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: POST_COVER_MOBILE_VARIANT,
        coverImageDesktopVariant: POST_COVER_DESKTOP_VARIANT,
      }),
    );

    // The slot's kind is the row's to say, so there is no provisional paint; the candidate still
    // counts as a cover slot, and its row is requested.
    expect(result.current.coverImage).toBeNull();
    expect(result.current.hasCover).toBe(true);
    expect(result.current.isCoverLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.coverImage?.alt).toBe('beautiful-cover.jpg');
    });
    expect(mockGetMetadata).toHaveBeenCalledWith({ fileAttachments: attachments });
    // The same variants the server preload resolved for the candidate, so the bytes are already in flight
    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');
    expect(result.current.coverImage?.desktopSrc).toBe('https://cdn.example.com/user123:file456/large');
    expect(result.current.hasCover).toBe(true);
  });

  it('never paints a video at slot 0, and reports no cover once the row says so', async () => {
    mockGetMetadata.mockResolvedValue([
      { ...createMockImageMetadata('user123:file456', 'clip.mp4'), content_type: 'video/mp4' },
    ]);

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: FileVariant.FEED,
      }),
    );

    expect(result.current.coverImage).toBeNull();

    await waitFor(() => {
      expect(result.current.isCoverLoading).toBe(false);
    });
    expect(result.current.coverImage).toBeNull();
    expect(result.current.hasCover).toBe(false);
  });

  it('reports no cover at once when the local slot-0 entry is not an image, and reads no row', () => {
    // Unlocked (Locks) content: the entry's type is the slot's metadata
    mockGetMetadata.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: FileVariant.FEED,
        localCoverType: 'video/mp4',
      }),
    );

    expect(result.current.hasCover).toBe(false);
    expect(result.current.coverImage).toBeNull();
    expect(result.current.isCoverLoading).toBe(false);
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });

  it('paints the cover at once when the local slot-0 entry is an image', () => {
    mockGetMetadata.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: FileVariant.FEED,
        localCoverType: 'image/png',
      }),
    );

    expect(result.current.hasCover).toBe(true);
    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');
  });

  it('keeps no cover when slot 0 is not a homeserver file uri', async () => {
    mockGetMetadata.mockResolvedValue([]);

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments: ['https://cdn.example.com/not-a-pubky-uri.jpg'],
        coverImageVariant: FileVariant.FEED,
      }),
    );

    expect(result.current.coverImage).toBeNull();
    await waitFor(() => {
      expect(result.current.isCoverLoading).toBe(false);
    });
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

    expect(result.current.hasCover).toBe(true);
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

    expect(result.current.hasCover).toBe(false);
    await waitFor(() => {
      expect(result.current.body).toContain('attachment:0');
    });
    expect(result.current.coverImage).toBeNull();
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });

  it('reports no cover when there are no attachments', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: articleContent('Plain body'),
        attachments: null,
        coverImageVariant: FileVariant.MAIN,
      }),
    );

    expect(result.current.hasCover).toBe(false);
  });

  it('reports a cover from local attachments alone, as unlocked content has no Nexus ones', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: articleContent('Plain body'),
        attachments: null,
        coverImageVariant: FileVariant.MAIN,
        localAttachmentCount: 1,
      }),
    );

    expect(result.current.hasCover).toBe(true);
    expect(result.current.coverImage).toBeNull(); // the URL is the caller's local blob, not a Nexus file
  });

  it('keeps the slot-0 rule for local attachments', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: articleContent('![inline slot zero](attachment:0)'),
        attachments: null,
        coverImageVariant: FileVariant.MAIN,
        localAttachmentCount: 1,
      }),
    );

    expect(result.current.hasCover).toBe(false);
  });

  it('reports no cover for local attachments whose slot 0 is not an image', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: articleContent('Plain body'),
        attachments: null,
        coverImageVariant: FileVariant.MAIN,
        localAttachmentCount: 1,
        localCoverType: 'application/pdf',
      }),
    );

    // The rule is image-only, and the local entry's type is the slot's metadata: `hasCover` and the
    // caller's image check can no longer disagree.
    expect(result.current.hasCover).toBe(false);
  });
});
