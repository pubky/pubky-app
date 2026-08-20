import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { usePostArticle } from './usePostArticle';

// Mock useToast
const mockToast = vi.fn();
vi.mock('@/molecules/Toaster/use-toast', () => {
  return {
    useToast: () => ({ toast: mockToast }),
  };
});

// Mock dependencies
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getMetadata: vi.fn(),
    getFileUrl: vi.fn(),
  },
}));
vi.mock('@/services/nexus/file/file.types', () => ({
  FileVariant: {
    MAIN: 'main',
    FEED: 'feed',
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

      mockGetMetadata.mockResolvedValue([mockMetadata]);

      const { result } = renderHook(() =>
        usePostArticle({
          content,
          attachments,
          coverImageVariant: FileVariant.FEED,
        }),
      );

      await waitFor(() => {
        expect(result.current.coverImage).not.toBeNull();
      });

      expect(mockGetMetadata).toHaveBeenCalledWith({ fileAttachments: attachments });
      expect(mockGetFileUrl).toHaveBeenCalledWith({
        fileId: 'user123:file456',
        variant: FileVariant.FEED,
      });
      expect(result.current.coverImage).toEqual({
        src: 'https://cdn.example.com/user123:file456/feed',
        alt: 'beautiful-cover.jpg',
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
        expect(result.current.coverImage).not.toBeNull();
      });

      expect(mockGetFileUrl).toHaveBeenCalledWith({
        fileId: 'user123:file456',
        variant: FileVariant.MAIN,
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
        expect(result.current.coverImage).not.toBeNull();
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
        expect(result.current.coverImage).not.toBeNull();
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

      // Wait for effect to complete
      await waitFor(() => {
        expect(mockGetMetadata).toHaveBeenCalled();
      });

      expect(result.current.coverImage).toBeNull();
      expect(mockGetFileUrl).not.toHaveBeenCalled();
    });

    it('handles empty metadata response', async () => {
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

      await waitFor(() => {
        expect(mockGetMetadata).toHaveBeenCalled();
      });

      expect(result.current.coverImage).toBeNull();
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
        expect(result.current.coverImage).not.toBeNull();
      });

      expect(result.current.coverImage?.alt).toBe('first-image.jpg');
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

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not parse article content',
      });
      expect(result.current.title).toBe('');
      expect(result.current.body).toBe('');
    });

    it('shows toast on metadata fetch error', async () => {
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
        expect(mockToast).toHaveBeenCalled();
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not load cover image',
      });
      expect(result.current.coverImage).toBeNull();
    });

    it('clears a previously loaded cover image when a re-fetch fails', async () => {
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

      // An edit replaced the attachments, but the metadata fetch fails —
      // the stale cover must not linger
      mockGetMetadata.mockRejectedValueOnce(new Error('Network error'));
      rerender({ attachments: ['pubky://user123/pub/pubky.app/files/file789'] });

      await waitFor(() => {
        expect(result.current.coverImage).toBeNull();
      });
      expect(mockToast).toHaveBeenCalledWith({
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
        expect(result.current.coverImage).not.toBeNull();
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
