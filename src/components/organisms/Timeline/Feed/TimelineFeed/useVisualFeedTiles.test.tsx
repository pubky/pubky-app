import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { useVisualFeedTiles } from './useVisualFeedTiles';
import { resolvePreferredVisualTileSize } from './TimelineFeedVisual.helpers';
import type { VisualTile } from './TimelineFeedVisual.types';
import { resetVisualTileCaches } from './TimelineFeedVisualMedia.utils';

const { mockUseLiveQuery, mockFetchFiles, mockGetOrFetch } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockFetchFiles: vi.fn(),
  mockGetOrFetch: vi.fn(),
}));

function createPendingTile({
  id,
  postId,
  attachmentName,
  previewSrc,
}: {
  id: string;
  postId: string;
  attachmentName: string;
  previewSrc: string;
}): VisualTile {
  return {
    id,
    postId,
    attachmentId: `${id}:attachment`,
    attachmentName,
    contentType: 'image/png',
    mediaKind: 'image',
    previewSrc,
    mainSrc: previewSrc,
    probeState: 'pending',
    isBlurred: false,
    content: '',
    indexedAt: 1,
  };
}

function findIdentity({
  base,
  expectedSize,
  width,
  height,
}: {
  base: string;
  expectedSize: NonNullable<VisualTile['preferredSize']>;
  width: number;
  height: number;
}) {
  for (let index = 0; index < 500; index += 1) {
    const id = `${base}-${index}`;

    if (resolvePreferredVisualTileSize(id, width, height) === expectedSize) {
      return id;
    }
  }

  throw new Error(`Failed to find identity for ${expectedSize}`);
}

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
}));

vi.mock('@/core', async () => {
  const actual = await vi.importActual<typeof import('@/core')>('@/core');
  return {
    ...actual,
    useLocalFilesStore: (selector: (state: { posts: Record<string, unknown[]> }) => unknown) => selector({ posts: {} }),
    PostController: {
      ...actual.PostController,
      getOrFetch: (...args: unknown[]) => mockGetOrFetch(...args),
    },
    FileController: {
      ...actual.FileController,
      fetchFiles: (...args: unknown[]) => mockFetchFiles(...args),
    },
  };
});

vi.mock('@/libs', async () => {
  const actual = await vi.importActual<typeof import('@/libs')>('@/libs');
  return {
    ...actual,
    Logger: {
      ...actual.Logger,
      error: vi.fn(),
    },
  };
});

describe('useVisualFeedTiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetVisualTileCaches();
    mockUseLiveQuery.mockReturnValue({
      tiles: [],
      missingFileUris: [],
    });
    mockFetchFiles.mockResolvedValue(undefined);
    mockGetOrFetch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetVisualTileCaches();
  });

  it('fetches missing file metadata through FileController', async () => {
    mockUseLiveQuery.mockReturnValue({
      tiles: [],
      missingFileUris: ['pubky://user-1/pub/pubky.app/files/file-1'],
    });

    renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1'], hasMore: false }));

    await waitFor(() => {
      expect(mockFetchFiles).toHaveBeenCalledWith({
        fileUris: ['pubky://user-1/pub/pubky.app/files/file-1'],
      });
    });
  });

  it('fetches post details for each requested post id', async () => {
    renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1', 'author:post-2'], hasMore: false }));

    await waitFor(() => {
      expect(mockGetOrFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('assigns medium fallback immediately when stream is exhausted with few tiles', () => {
    mockUseLiveQuery.mockReturnValue({
      tiles: [
        createPendingTile({ id: 'tile-a', postId: 'author:post-1', attachmentName: 'a.png', previewSrc: '/a.png' }),
        createPendingTile({ id: 'tile-b', postId: 'author:post-2', attachmentName: 'b.png', previewSrc: '/b.png' }),
        createPendingTile({ id: 'tile-c', postId: 'author:post-3', attachmentName: 'c.png', previewSrc: '/c.png' }),
      ],
      missingFileUris: [],
    });

    const { result } = renderHook(() =>
      useVisualFeedTiles({ postIds: ['author:post-1', 'author:post-2', 'author:post-3'], hasMore: false }),
    );

    expect(result.current.rows.length).toBeGreaterThan(0);
    expect(result.current.hasPendingTiles).toBe(false);
    result.current.tiles.forEach((tile) => {
      expect(tile.preferredSize).toBe('medium');
    });
  });

  it('does not assign fallback when stream has more pages', () => {
    mockUseLiveQuery.mockReturnValue({
      tiles: [
        createPendingTile({ id: 'tile-a', postId: 'author:post-1', attachmentName: 'a.png', previewSrc: '/a.png' }),
        createPendingTile({ id: 'tile-b', postId: 'author:post-2', attachmentName: 'b.png', previewSrc: '/b.png' }),
        createPendingTile({ id: 'tile-c', postId: 'author:post-3', attachmentName: 'c.png', previewSrc: '/c.png' }),
      ],
      missingFileUris: [],
    });

    const { result } = renderHook(() =>
      useVisualFeedTiles({ postIds: ['author:post-1', 'author:post-2', 'author:post-3'], hasMore: true }),
    );

    expect(result.current.rows.length).toBe(0);
    expect(result.current.hasPendingTiles).toBe(true);
  });

  it('exposes hasPendingFiles when file metadata is missing', () => {
    mockUseLiveQuery.mockReturnValue({
      tiles: [],
      missingFileUris: ['pubky://user-1/pub/pubky.app/files/file-1'],
    });

    const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1'], hasMore: false }));

    expect(result.current.hasPendingFiles).toBe(true);
  });

  it('resolves probed square and wide tiles into non-medium rows', async () => {
    const squareId = findIdentity({
      base: 'square-tile',
      expectedSize: 'square',
      width: 1000,
      height: 1000,
    });
    const wideId = findIdentity({
      base: 'wide-tile',
      expectedSize: 'wide',
      width: 1920,
      height: 900,
    });
    const mediumId = findIdentity({
      base: 'medium-tile',
      expectedSize: 'medium',
      width: 1000,
      height: 800,
    });

    mockUseLiveQuery.mockReturnValue({
      tiles: [
        createPendingTile({
          id: squareId,
          postId: 'author:post-1',
          attachmentName: 'square.png',
          previewSrc: '/probe-square.png',
        }),
        createPendingTile({
          id: wideId,
          postId: 'author:post-2',
          attachmentName: 'wide.png',
          previewSrc: '/probe-wide.png',
        }),
        createPendingTile({
          id: mediumId,
          postId: 'author:post-3',
          attachmentName: 'medium.png',
          previewSrc: '/probe-medium.png',
        }),
      ],
      missingFileUris: [],
    });

    const createdImages: Array<{
      onload: (() => void) | null;
      onerror: (() => void) | null;
      naturalWidth: number;
      naturalHeight: number;
      src: string;
    }> = [];

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      private currentSrc = '';

      constructor() {
        createdImages.push(this);
      }

      set src(value: string) {
        this.currentSrc = value;

        if (!value) {
          this.naturalWidth = 0;
          this.naturalHeight = 0;
          return;
        }

        if (value.includes('square')) {
          this.naturalWidth = 1000;
          this.naturalHeight = 1000;
        } else if (value.includes('wide')) {
          this.naturalWidth = 1920;
          this.naturalHeight = 900;
        } else {
          this.naturalWidth = 1000;
          this.naturalHeight = 800;
        }

        queueMicrotask(() => {
          this.onload?.();
        });
      }

      get src() {
        return this.currentSrc;
      }
    }

    const originalImage = window.Image;
    Object.defineProperty(window, 'Image', {
      writable: true,
      configurable: true,
      value: MockImage,
    });

    try {
      const { result } = renderHook(() =>
        useVisualFeedTiles({
          postIds: ['author:post-1', 'author:post-2', 'author:post-3'],
          hasMore: false,
        }),
      );

      await waitFor(() => {
        expect(result.current.hasPendingTiles).toBe(false);
        expect(result.current.rows[0]?.cells.map((cell) => cell.size)).toEqual(['square', 'wide']);
      });

      expect(result.current.tiles.find((tile) => tile.id === squareId)?.preferredSize).toBe('square');
      expect(result.current.tiles.find((tile) => tile.id === wideId)?.preferredSize).toBe('wide');
      expect(result.current.tiles.find((tile) => tile.id === mediumId)?.preferredSize).toBe('medium');
    } finally {
      Object.defineProperty(window, 'Image', {
        writable: true,
        configurable: true,
        value: originalImage,
      });
    }
  });
});
