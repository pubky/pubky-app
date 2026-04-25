import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { asOpaque, mockResponse } from '@/test-utils';
import { getSharedFiles, composeShareContent } from './shareTarget';

function createMockResponse(blob: Blob, headers: Headers): Response {
  return mockResponse({
    blob: () => Promise.resolve(blob),
    headers,
  });
}

// Store original caches
const originalCaches = global.caches;

// Mock Cache API
const mockCacheMatch = vi.fn();
const mockCacheKeys = vi.fn();
const mockCacheOpen = vi.fn();
const mockCachesDelete = vi.fn();

const mockCache = {
  match: mockCacheMatch,
  keys: mockCacheKeys,
};

describe('shareTarget utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup caches mock
    Object.defineProperty(global, 'caches', {
      value: {
        open: mockCacheOpen.mockResolvedValue(mockCache),
        delete: mockCachesDelete.mockResolvedValue(true),
      },
      writable: true,
    });
  });

  afterEach(() => {
    // Restore original caches
    Object.defineProperty(global, 'caches', {
      value: originalCaches,
      writable: true,
    });
  });

  describe('getSharedFiles', () => {
    it('returns empty array when cache has no files', async () => {
      mockCacheKeys.mockResolvedValue([]);

      const files = await getSharedFiles();

      expect(files).toEqual([]);
      expect(mockCacheOpen).toHaveBeenCalledWith('share-target-files');
    });

    it('retrieves files from cache and returns them', async () => {
      const mockRequest = new Request('http://localhost/file-0');
      const mockBlob = new Blob(['test content'], { type: 'image/png' });
      const mockHeaders = new Headers({
        'X-Share-Filename': 'test-image.png',
        'Content-Type': 'image/png',
      });
      const mockResponse = createMockResponse(mockBlob, mockHeaders);

      mockCacheKeys.mockResolvedValue([mockRequest]);
      mockCacheMatch.mockResolvedValue(mockResponse);

      const files = await getSharedFiles();

      expect(files).toHaveLength(1);
      expect(files[0]).toBeInstanceOf(File);
      expect(files[0].name).toBe('test-image.png');
      expect(files[0].type).toBe('image/png');
    });

    it('uses fallback filename when X-Share-Filename header is missing', async () => {
      const mockRequest = new Request('http://localhost/file-0');
      const mockBlob = new Blob(['test content'], { type: 'image/jpeg' });
      const mockHeaders = new Headers({
        'Content-Type': 'image/jpeg',
      });
      const mockResponse = createMockResponse(mockBlob, mockHeaders);

      mockCacheKeys.mockResolvedValue([mockRequest]);
      mockCacheMatch.mockResolvedValue(mockResponse);

      const files = await getSharedFiles();

      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('shared-file');
    });

    it('uses blob type when Content-Type header is missing', async () => {
      const mockRequest = new Request('http://localhost/file-0');
      // Create a mock blob object that will return the expected type
      const mockBlob = asOpaque<Blob>({
        type: 'video/mp4',
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        text: () => Promise.resolve(''),
        slice: () => new Blob([]),
        stream: () => new ReadableStream(),
        size: 0,
      });
      const mockHeaders = new Headers({
        'X-Share-Filename': 'video.mp4',
      });

      const mockResponseValue = mockResponse({
        blob: () => Promise.resolve(mockBlob),
        headers: mockHeaders,
      });

      mockCacheKeys.mockResolvedValue([mockRequest]);
      mockCacheMatch.mockResolvedValue(mockResponseValue);

      const files = await getSharedFiles();

      expect(files).toHaveLength(1);
      expect(files[0].type).toBe('video/mp4');
    });

    it('handles multiple files in cache', async () => {
      const mockRequest1 = new Request('http://localhost/file-0');
      const mockRequest2 = new Request('http://localhost/file-1');

      const mockBlob1 = new Blob(['image content'], { type: 'image/png' });
      const mockBlob2 = new Blob(['video content'], { type: 'video/mp4' });

      const mockResponse1 = createMockResponse(
        mockBlob1,
        new Headers({ 'X-Share-Filename': 'image.png', 'Content-Type': 'image/png' }),
      );
      const mockResponse2 = createMockResponse(
        mockBlob2,
        new Headers({ 'X-Share-Filename': 'video.mp4', 'Content-Type': 'video/mp4' }),
      );

      mockCacheKeys.mockResolvedValue([mockRequest1, mockRequest2]);
      mockCacheMatch.mockResolvedValueOnce(mockResponse1).mockResolvedValueOnce(mockResponse2);

      const files = await getSharedFiles();

      expect(files).toHaveLength(2);
      expect(files[0].name).toBe('image.png');
      expect(files[1].name).toBe('video.mp4');
    });

    it('skips entries where cache.match returns null', async () => {
      const mockRequest1 = new Request('http://localhost/file-0');
      const mockRequest2 = new Request('http://localhost/file-1');

      const mockBlob = new Blob(['content'], { type: 'image/png' });
      const mockResponse = createMockResponse(
        mockBlob,
        new Headers({ 'X-Share-Filename': 'valid.png', 'Content-Type': 'image/png' }),
      );

      mockCacheKeys.mockResolvedValue([mockRequest1, mockRequest2]);
      mockCacheMatch
        .mockResolvedValueOnce(null) // First entry missing
        .mockResolvedValueOnce(mockResponse);

      const files = await getSharedFiles();

      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('valid.png');
    });

    it('clears cache after retrieval', async () => {
      const mockRequest = new Request('http://localhost/file-0');
      const mockBlob = new Blob(['content'], { type: 'image/png' });
      const mockResponse = createMockResponse(
        mockBlob,
        new Headers({ 'X-Share-Filename': 'test.png', 'Content-Type': 'image/png' }),
      );

      mockCacheKeys.mockResolvedValue([mockRequest]);
      mockCacheMatch.mockResolvedValue(mockResponse);

      await getSharedFiles();

      expect(mockCachesDelete).toHaveBeenCalledWith('share-target-files');
    });

    it('returns empty array on error', async () => {
      mockCacheOpen.mockRejectedValue(new Error('Cache error'));

      const files = await getSharedFiles();

      expect(files).toEqual([]);
    });

    it('clears cache even when no files are present', async () => {
      mockCacheKeys.mockResolvedValue([]);

      await getSharedFiles();

      // Cache delete should not be called when there are no files
      // because the function returns early
      expect(mockCachesDelete).not.toHaveBeenCalled();
    });
  });

  describe('composeShareContent', () => {
    it('returns empty string when no params provided', () => {
      const result = composeShareContent({});

      expect(result).toBe('');
    });

    it('returns text only when only text is provided', () => {
      const result = composeShareContent({ text: 'Hello world' });

      expect(result).toBe('Hello world');
    });

    it('returns url only when only url is provided', () => {
      const result = composeShareContent({ url: 'https://example.com' });

      expect(result).toBe('https://example.com');
    });

    it('returns title when only title is provided', () => {
      const result = composeShareContent({ title: 'Page Title' });

      expect(result).toBe('Page Title');
    });

    it('combines text and url with double newline', () => {
      const result = composeShareContent({
        text: 'Check this out',
        url: 'https://example.com',
      });

      expect(result).toBe('Check this out\n\nhttps://example.com');
    });

    it('does not duplicate url if already in text', () => {
      const result = composeShareContent({
        text: 'Check out https://example.com',
        url: 'https://example.com',
      });

      expect(result).toBe('Check out https://example.com');
    });

    it('ignores title when text is provided', () => {
      const result = composeShareContent({
        title: 'Page Title',
        text: 'The actual content',
      });

      expect(result).toBe('The actual content');
    });

    it('ignores title when url is provided', () => {
      const result = composeShareContent({
        title: 'Page Title',
        url: 'https://example.com',
      });

      expect(result).toBe('https://example.com');
    });

    it('handles typical browser share (title + url)', () => {
      const result = composeShareContent({
        title: 'Interesting Article - News Site',
        url: 'https://news.example.com/article/123',
      });

      expect(result).toBe('https://news.example.com/article/123');
    });

    it('handles social app share (text + url)', () => {
      const result = composeShareContent({
        text: 'This is amazing! 🎉',
        url: 'https://social.example.com/post/456',
      });

      expect(result).toBe('This is amazing! 🎉\n\nhttps://social.example.com/post/456');
    });

    it('handles note app share (text only)', () => {
      const result = composeShareContent({
        text: 'Selected text from a document that the user wants to share.',
      });

      expect(result).toBe('Selected text from a document that the user wants to share.');
    });

    it('handles all params with url not in text', () => {
      const result = composeShareContent({
        title: 'Page Title',
        text: 'Some description',
        url: 'https://example.com',
      });

      expect(result).toBe('Some description\n\nhttps://example.com');
    });

    it('handles all params with url already in text', () => {
      const result = composeShareContent({
        title: 'Page Title',
        text: 'Check this: https://example.com',
        url: 'https://example.com',
      });

      expect(result).toBe('Check this: https://example.com');
    });
  });
});
