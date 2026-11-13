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
      expect(result.current.isCoverLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isCoverLoading).toBe(false);
      });
      expect(result.current.coverImage).toBeNull();
      expect(result.current.isCoverPending).toBe(false);
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
      expect(result.current.isCoverPending).toBe(false);
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

      // The candidate's row is requested while nothing paints
      expect(result.current.isCoverLoading).toBe(true);
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
      expect(result.current.isCoverPending).toBe(false);
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
        localCover: { type: 'video/mp4', name: 'clip.mp4', urls: { main: 'blob:clip' } },
      }),
    );

    expect(result.current.coverImage).toBeNull();
    expect(result.current.isCoverPending).toBe(false);
  });

  it('never takes its type, or its file, from slot 0, which is a body image', () => {
    // The row is never going to land: only the envelope says there is a cover
    mockGetMetadata.mockReturnValue(new Promise(() => {}));
    const clip = { type: 'video/mp4', name: 'clip.mp4', urls: { main: 'blob:clip' } };
    const shot = { type: 'image/png', name: 'shot.png', urls: { main: 'blob:shot' } };

    const { result, rerender } = renderHook(
      ({ localAttachments }) =>
        usePostArticle({
          content,
          attachments: ['pubky://user123/pub/pubky.app/files/inline'],
          coverImageVariant: FileVariant.FEED,
          localAttachments,
        }),
      { initialProps: { localAttachments: [clip] } },
    );
    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');

    rerender({ localAttachments: [shot] });
    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');
  });

  it('lets the cover entry this session published win over the envelope cover', () => {
    mockGetMetadata.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments: ['pubky://user123/pub/pubky.app/files/inline'],
        coverImageVariant: FileVariant.FEED,
        localAttachments: [{ type: 'image/png', name: 'shot.png', urls: { main: 'blob:shot' } }],
        localCover: { type: 'image/png', name: 'cover.png', urls: { main: 'blob:session-cover' } },
      }),
    );

    expect(result.current.coverImage).toMatchObject({ src: 'blob:session-cover', alt: 'cover.png' });
    expect(result.current.isCoverLoading).toBe(false);
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

    // The slot's kind is the row's to say, so there is no provisional paint; its row is requested.
    expect(result.current.coverImage).toBeNull();
    expect(result.current.isCoverLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.coverImage?.alt).toBe('beautiful-cover.jpg');
    });
    expect(mockGetMetadata).toHaveBeenCalledWith({ fileAttachments: attachments });
    // The same variants the server preload resolved for the candidate, so the bytes are already in flight
    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed');
    expect(result.current.coverImage?.desktopSrc).toBe('https://cdn.example.com/user123:file456/large');
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
    expect(result.current.isCoverPending).toBe(false);
  });

  it('reports no cover at once when the local slot-0 entry is not an image, and reads no row', () => {
    // The entry, index-aligned with the attachments, already knows its type: the slot's metadata
    mockGetMetadata.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments,
        coverImageVariant: FileVariant.FEED,
        localAttachments: [{ type: 'video/mp4', name: 'clip.mp4', urls: { main: 'blob:clip' } }],
      }),
    );

    expect(result.current.coverImage).toBeNull();
    expect(result.current.isCoverPending).toBe(false);
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
        localAttachments: [{ type: 'image/png', name: 'shot.png', urls: { main: 'blob:shot' } }],
      }),
    );

    // The entry is the cover and already says image: no row stands in front of it
    expect(result.current.coverImage?.src).toBe('blob:shot');
    expect(result.current.isCoverLoading).toBe(false);
  });

  it('drops a local slot-0 image once the row says slot 0 is not an image', async () => {
    // The lists differ in length, so the entry's type is not the slot's (see the guard below) and
    // the row settles rule B: a PDF there leaves the article without a cover, local or remote
    mockGetMetadata.mockResolvedValue([createMockPdfMetadata('user123:file456')]);
    const shot = { type: 'image/png', name: 'shot.png', urls: { main: 'blob:shot' } };

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments: [...attachments, 'pubky://user123/pub/pubky.app/files/file789'],
        coverImageVariant: FileVariant.FEED,
        localAttachments: [shot],
      }),
    );

    await waitFor(() => expect(mockGetMetadata).toHaveBeenCalled());
    await waitFor(() => expect(result.current.coverImage).toBeNull());
  });

  it('takes the type from slot 0 only while the local list matches the attachment list', async () => {
    // dev's index-aligned guard, told for rule B: right after an edit the store already holds the
    // new order while this render still shows the old post
    mockGetMetadata.mockResolvedValue([createMockImageMetadata('user123:file456', 'cover.jpg')]);
    const clip = { type: 'video/mp4', name: 'clip.mp4', urls: { main: 'blob:clip' } };
    const twoAttachments = [...attachments, 'pubky://user123/pub/pubky.app/files/file789'];

    const { result, rerender } = renderHook(
      ({ localAttachments }) =>
        usePostArticle({ content, attachments: twoAttachments, coverImageVariant: FileVariant.FEED, localAttachments }),
      { initialProps: { localAttachments: [clip, clip] } },
    );
    // Aligned: a video in slot 0 settles rule B at once, with no row read
    expect(result.current.coverImage).toBeNull();
    expect(mockGetMetadata).not.toHaveBeenCalled();

    // Not aligned: slot 0 is the row's to say again, and the row says image
    rerender({ localAttachments: [clip] });
    await waitFor(() => expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:file456/feed'));
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

    // Rule B: a 0.x slot 0 waits for its row (dev's synchronous paint is the envelope cover's alone)
    expect(result.current.coverImage).toBeNull();
    await waitFor(() => {
      expect(result.current.coverImage?.alt).toBe('cover.jpg');
    });
    expect(result.current.coverImage?.src).toBe('https://cdn.example/slot0/main');
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

  it('reports no cover for local attachments whose slot 0 is not an image', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: articleContent('Plain body'),
        attachments: null,
        coverImageVariant: FileVariant.MAIN,
        localAttachments: [{ type: 'application/pdf', name: 'doc.pdf', urls: { main: 'blob:doc' }, slot: 0 }],
        pendingAttachments: [{ slot: 0, type: 'application/pdf' }],
      }),
    );

    // The rule is image-only, and the local entry's type is the slot's metadata
    expect(result.current.coverImage).toBeNull();
    expect(result.current.isCoverPending).toBe(false);
  });

  it('reports no cover when there are no attachments, remote or local', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: articleContent('Plain body'),
        attachments: null,
        coverImageVariant: FileVariant.MAIN,
        localAttachments: [],
        pendingAttachments: [],
      }),
    );

    expect(result.current.coverImage).toBeNull();
    expect(result.current.isCoverPending).toBe(false);
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });
});

// ADR-0023 as amended by ADR-0027 (D14): an article this app writes keeps its cover in the envelope's
// `cover_image` and its inline media in the slots, so slot 0 is a body image. Only unlocked (Locks)
// content and a 0.x article keep the cover in slot 0 (rule B), and only an image there is one. Moved
// here from `PostArticle.test.tsx`, which mocked this hook: the hook is now the one place that decides.
describe('Envelope cover and the slot-0 rule', () => {
  const COVER_URI = 'pubky://user123/pub/pubky.app/files/cover';
  const INLINE_URI = 'pubky://user123/pub/pubky.app/files/inline';
  const envelope = (body: string, coverImage?: string) =>
    JSON.stringify({ title: 'Essay', body, ...(coverImage && { cover_image: coverImage }) });

  /** The session's own copies: the cover (`articleCovers`) and the media at slot 0 (`posts`). */
  const sessionCover: AttachmentConstructed = {
    type: 'image/png',
    name: 'cover.png',
    urls: { main: 'blob:http://localhost/session-cover' },
  };
  const slotZeroImage: AttachmentConstructed = { type: 'image/png', name: 'shot.png', urls: { main: 'blob:shot' } };
  const slotZeroVideo: AttachmentConstructed = { type: 'video/mp4', name: 'clip.mp4', urls: { main: 'blob:clip' } };
  /** Unlocked (Locks) content: the reader's copy of the locked post's slot 0, named as `toUnlockedMedia` names it. */
  const unlockedCover: AttachmentConstructed = {
    type: 'image/png',
    name: 'attachment-0',
    urls: { main: 'blob:unlocked-cover', feed: 'blob:unlocked-cover' },
    slot: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `https://cdn.example.com/${fileId}/${variant}`);
    mockGetMetadata.mockResolvedValue([createMockImageMetadata('user123:cover')]);
  });

  it('paints the envelope cover and never slot 0, which is a body image', async () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: envelope('Intro\n\n![shot](attachment:0)', COVER_URI),
        attachments: [INLINE_URI],
        coverImageVariant: FileVariant.FEED,
        localAttachments: [slotZeroImage],
      }),
    );

    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:cover/feed');
    await waitFor(() => expect(mockGetMetadata).toHaveBeenCalledWith({ fileAttachments: [COVER_URI] }));
  });

  it('paints the envelope cover over a slot 0 the body leaves alone, which is still no cover', () => {
    // An rc.1-migrated article (A'): refs exist but never name slot 0; slot 0 is still no cover
    const { result } = renderHook(() =>
      usePostArticle({
        content: envelope('Intro\n\n![shot](attachment:1)', COVER_URI),
        attachments: [INLINE_URI],
        coverImageVariant: FileVariant.FEED,
        localAttachments: [slotZeroImage],
      }),
    );

    expect(result.current.coverImage?.src).toBe('https://cdn.example.com/user123:cover/feed');
  });

  it('lets the cover this session published win over the envelope cover', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: envelope('Intro\n\n![clip](attachment:0)', COVER_URI),
        attachments: [INLINE_URI],
        coverImageVariant: FileVariant.FEED,
        localAttachments: [slotZeroVideo],
        localCover: sessionCover,
      }),
    );

    // The slot-0 video vetoes nothing: the entry's type stands in for the cover's row, never the slot's
    expect(result.current.coverImage?.src).toBe('blob:http://localhost/session-cover');
  });

  it('takes slot 0 of unlocked content as its cover when the body leaves the slot alone', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: envelope('Intro\n\n![shot](attachment:1)'),
        attachments: null,
        coverImageVariant: FileVariant.FEED,
        localAttachments: [unlockedCover, { ...slotZeroImage, slot: 1 }],
      }),
    );

    expect(result.current.coverImage?.src).toBe('blob:unlocked-cover');
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });

  it('never paints a non-image slot 0 of unlocked content as the cover', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: envelope('Intro\n\n![shot](attachment:1)'),
        attachments: null,
        coverImageVariant: FileVariant.FEED,
        localAttachments: [
          { ...slotZeroVideo, slot: 0 },
          { ...slotZeroImage, slot: 1 },
        ],
      }),
    );

    expect(result.current.coverImage).toBeNull();
    expect(result.current.isCoverPending).toBe(false);
  });

  it('leaves slot 0 to the body when the body references it', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content: envelope('Intro\n\n![first](attachment:0)'),
        attachments: null,
        coverImageVariant: FileVariant.FEED,
        localAttachments: [{ ...slotZeroImage, slot: 0 }],
      }),
    );

    expect(result.current.coverImage).toBeNull();
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

// The same desktop-source rule for the cover entry this session published or edited (its own entry,
// `articleCovers`), which is how an article this app writes holds its local cover. Moved here from
// `PostArticleDetail.test.tsx`, which mocks this hook: the desktop sources are decided here now.
describe('own cover entry (envelope cover)', () => {
  const COVER_URI = 'pubky://user123/pub/pubky.app/files/file456';
  const content = JSON.stringify({ title: 'T', body: 'Plain body', cover_image: COVER_URI });
  const ownCover = (urls: AttachmentConstructed['urls'], type = 'image/png'): AttachmentConstructed => ({
    type,
    name: 'kept-cover.png',
    urls,
  });
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

  it('renders a kept cover entry from its large variant on desktop, a fresh upload from its object URL', () => {
    const desktopOf = (urls: AttachmentConstructed['urls']) => {
      const { result, unmount } = renderHook(() =>
        usePostArticle({ content, attachments: [], ...heroVariants, localCover: ownCover(urls) }),
      );
      const desktopSrc = result.current.coverImage?.desktopSrc;
      unmount();
      return desktopSrc;
    };

    expect(desktopOf({ main: 'cdn://cover?v=main', feed: 'cdn://cover?v=feed', large: 'cdn://cover?v=large' })).toBe(
      'cdn://cover?v=large',
    );
    expect(desktopOf({ main: 'blob:cover', feed: 'blob:cover' })).toBe('blob:cover');
  });

  it('keeps the desktop slot on the preloaded variant for a kept CDN cover entry', async () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments: [],
        ...heroVariants,
        localCover: ownCover({
          main: 'https://cdn.example/cover-main.png',
          feed: 'https://cdn.example/cover-feed.webp',
        }),
      }),
    );

    // A kept entry resolves to the same file as the envelope cover: the server preloaded `large`, and
    // rendering the local `main` here would pull the original upload the preload exists to replace.
    await waitFor(() =>
      expect(result.current.coverImage?.desktopSrc).toBe('https://cdn.example.com/user123:file456/large'),
    );
    expect(result.current.coverImage?.src).toBe('https://cdn.example/cover-feed.webp');
    expect(result.current.coverImage?.desktopFallbackSrc).toBe('https://cdn.example/cover-main.png');
  });

  it('holds the desktop slot while the envelope cover behind a kept entry resolves', async () => {
    const row = Promise.withResolvers<NexusFileDetails[]>();
    mockGetMetadata.mockReturnValue(row.promise);

    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments: [],
        ...heroVariants,
        localCover: ownCover({
          main: 'https://cdn.example/cover-main.png',
          feed: 'https://cdn.example/cover-feed.webp',
        }),
      }),
    );

    expect(result.current.coverImage?.src).toBe('https://cdn.example/cover-feed.webp');
    expect(result.current.coverImage?.desktopSrc).toBeUndefined();

    row.resolve([createMockImageMetadata('user123:file456')]);
    await waitFor(() =>
      expect(result.current.coverImage?.desktopSrc).toBe('https://cdn.example.com/user123:file456/large'),
    );
  });

  it('renders a kept cover entry in both slots when there is no remote cover to prefer', async () => {
    mockGetMetadata.mockResolvedValue([]);

    const { result } = renderHook(() =>
      usePostArticle({
        // Not a homeserver file uri: the CDN has no copy, so once the lookup settles the entry is
        // the only source
        content: JSON.stringify({ title: 'T', body: 'Plain body', cover_image: 'https://elsewhere.example/c.png' }),
        attachments: [],
        ...heroVariants,
        localCover: ownCover({
          main: 'https://cdn.example/cover-main.png',
          feed: 'https://cdn.example/cover-feed.webp',
        }),
      }),
    );

    await waitFor(() => expect(result.current.coverImage?.desktopSrc).toBeDefined());
    expect(result.current.coverImage).toMatchObject({
      src: 'https://cdn.example/cover-feed.webp',
      desktopSrc: 'https://cdn.example/cover-main.png',
      alt: 'kept-cover.png',
    });
  });

  it('never draws a cover entry that is not an image, nor the envelope cover it stands in for', () => {
    const { result } = renderHook(() =>
      usePostArticle({
        content,
        attachments: [],
        ...heroVariants,
        localCover: ownCover({ main: 'blob:document' }, 'application/pdf'),
      }),
    );

    expect(result.current.coverImage).toBeNull();
  });
});
