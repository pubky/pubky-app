import * as React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileDetailsModelSchema } from '@/models/file/fileDetails.schema';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { getVisualYouTubeThumbnailUrl, resolvePreferredVisualTileSize } from './TimelineFeedVisual.helpers';
import type { VisualTile } from './TimelineFeedVisual.types';
import { getVisualTileProbeCacheEntry, resetVisualTileCaches } from './TimelineFeedVisualMedia.utils';
import { useVisualFeedTiles } from './useVisualFeedTiles';

const {
  mockUseLiveQuery,
  mockFetchFiles,
  mockGetOrFetch,
  mockGetMetadata,
  mockFindByIdsPreserveOrder,
  mockEnrichPosts,
  mockLocalFilesState,
} = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockFetchFiles: vi.fn(),
  mockGetOrFetch: vi.fn(),
  mockGetMetadata: vi.fn(),
  mockFindByIdsPreserveOrder: vi.fn(),
  mockEnrichPosts: vi.fn(),
  mockLocalFilesState: { posts: {} as Record<string, AttachmentConstructed[]> },
}));

type VisualFeedSnapshot = {
  tiles: VisualTile[];
  missingFileUris: string[];
  hiddenPostCount: number;
  pendingDetailPostCount: number;
};

/**
 * Drop-in `useLiveQuery` implementation that actually executes the querier the
 * hook passes in (against the mocked models/controllers), so the snapshot
 * logic — tile building, hidden-post counting, and placeholder resolution —
 * runs for real. Mirrors dexie's dep semantics: the querier re-executes
 * whenever the hook's declared deps change identity (e.g. the settled-fetch
 * set updating after `getOrFetch` resolves).
 */
function useExecutedLiveQuery(
  querier: () => VisualFeedSnapshot | Promise<VisualFeedSnapshot>,
  deps: unknown[] = [],
  defaultValue?: VisualFeedSnapshot,
): VisualFeedSnapshot | undefined {
  const [snapshot, setSnapshot] = React.useState<VisualFeedSnapshot | undefined>(defaultValue);
  const querierRef = React.useRef(querier);

  // Keep the latest querier closure without re-running the execution effect on
  // every render; declared before it so the dep-keyed effect sees the update.
  React.useEffect(() => {
    querierRef.current = querier;
  });

  React.useEffect(() => {
    let isMounted = true;

    void Promise.resolve(querierRef.current()).then((result) => {
      if (isMounted) {
        setSnapshot(result);
      }
    });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity-compare the hook's own deps, like dexie does
  }, deps);

  return snapshot;
}

function createPostDetails({
  id,
  content = 'hello world',
  attachments = null,
  kind = 'short',
  lock,
}: {
  id: string;
  content?: string;
  attachments?: string[] | null;
  kind?: string;
  lock?: string | null;
}): PostDetailsModelSchema {
  return {
    id,
    content,
    indexed_at: 1,
    kind,
    uri: `pubky://author/pub/pubky.app/posts/${id}`,
    attachments,
    ...(lock !== undefined ? { lock } : {}),
  };
}

function createFileDetails({
  id,
  contentType,
  width,
  height,
}: {
  id: string;
  contentType: string;
  width?: number;
  height?: number;
}): FileDetailsModelSchema {
  return {
    id,
    name: `${id}.bin`,
    src: `/src/${id}`,
    content_type: contentType,
    size: 1024,
    created_at: 1,
    indexed_at: 1,
    metadata: width && height ? { width: String(width), height: String(height) } : {},
    owner_id: 'user-1',
    uri: `pubky://user-1/pub/pubky.app/files/${id}`,
    urls: { feed: `/feed/${id}`, main: `/main/${id}`, small: `/small/${id}` },
  };
}

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

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: (selector: (state: { posts: Record<string, AttachmentConstructed[]> }) => unknown) =>
    selector(mockLocalFilesState),
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getOrFetch: (...args: unknown[]) => mockGetOrFetch(...args),
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    fetchFiles: (...args: unknown[]) => mockFetchFiles(...args),
    getMetadata: (...args: unknown[]) => mockGetMetadata(...args),
    getFileUrl: ({ fileId, variant }: { fileId: string; variant: string }) => `/files/${fileId}/${variant}`,
  },
}));
vi.mock('@/models/post/details/postDetails', () => ({
  PostDetailsModel: {
    findByIdsPreserveOrder: (...args: unknown[]) => mockFindByIdsPreserveOrder(...args),
  },
}));
vi.mock('@/controllers/moderation/moderation', () => ({
  ModerationController: {
    enrichPosts: (...args: unknown[]) => mockEnrichPosts(...args),
  },
}));

vi.mock('@/libs/logger/logger', async () => {
  const actual = await vi.importActual<typeof import('@/libs/logger/logger')>('@/libs/logger/logger');
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
    mockLocalFilesState.posts = {};
    mockUseLiveQuery.mockReturnValue({
      tiles: [],
      missingFileUris: [],
    });
    mockFetchFiles.mockResolvedValue(undefined);
    mockGetOrFetch.mockResolvedValue(undefined);
    mockGetMetadata.mockResolvedValue([]);
    mockFindByIdsPreserveOrder.mockResolvedValue([]);
    mockEnrichPosts.mockImplementation(async (posts: PostDetailsModelSchema[]) =>
      posts.map((post) => ({ ...post, is_moderated: false, is_blurred: false })),
    );
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

  it('assigns enough fallback to render the first row when stream has more pages', () => {
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

    expect(result.current.rows.length).toBeGreaterThan(0);
    expect(result.current.hasPendingTiles).toBe(true);
    expect(result.current.tiles[0].preferredSize).toBe('medium');
    expect(result.current.tiles[1].preferredSize).toBe('medium');
    expect(result.current.tiles[2].preferredSize).toBeUndefined();
  });

  it('exposes hasPendingFiles when file metadata is missing', () => {
    mockUseLiveQuery.mockReturnValue({
      tiles: [],
      missingFileUris: ['pubky://user-1/pub/pubky.app/files/file-1'],
    });

    const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1'], hasMore: false }));

    expect(result.current.hasPendingFiles).toBe(true);
  });

  describe('missing file metadata', () => {
    it('keeps hasPendingFiles while the request is in flight, then clears it when the request settles without a row', async () => {
      let resolveFetchFiles!: () => void;
      mockFetchFiles.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveFetchFiles = resolve;
          }),
      );
      mockUseLiveQuery.mockReturnValue({
        tiles: [],
        missingFileUris: ['pubky://user-1/pub/pubky.app/files/file-1'],
      });

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1'], hasMore: false }));

      // In flight: the feed must still read as resolving.
      await waitFor(() => {
        expect(mockFetchFiles).toHaveBeenCalledTimes(1);
      });
      expect(result.current.hasPendingFiles).toBe(true);

      await act(async () => {
        resolveFetchFiles();
      });

      // Nexus returned no row for the URI, and nothing is in flight anymore, so
      // the loading gates must open instead of holding the feed forever.
      await waitFor(() => {
        expect(result.current.hasPendingFiles).toBe(false);
      });
    });

    it('settles the request after a failure instead of gating the feed forever', async () => {
      mockFetchFiles.mockRejectedValue(new Error('nexus unavailable'));
      mockUseLiveQuery.mockReturnValue({
        tiles: [],
        missingFileUris: ['pubky://user-1/pub/pubky.app/files/file-1'],
      });

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.hasPendingFiles).toBe(false);
      });
      // A settled failure is not retried on every snapshot emission.
      expect(mockFetchFiles).toHaveBeenCalledTimes(1);
    });

    it('requests each missing URI once however often the snapshot re-emits', async () => {
      // A liveQuery that hands back a fresh snapshot per render mirrors the real
      // one re-emitting while the metadata is still absent: the fetch must not
      // be re-issued for a URI whose request already settled.
      mockUseLiveQuery.mockImplementation(() => ({
        tiles: [],
        missingFileUris: ['pubky://user-1/pub/pubky.app/files/file-1'],
      }));

      const { result, rerender } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.hasPendingFiles).toBe(false);
      });

      rerender();
      rerender();

      await act(async () => {});

      expect(mockFetchFiles).toHaveBeenCalledTimes(1);
      expect(result.current.hasPendingFiles).toBe(false);
    });

    it('renders a tile whose metadata arrives after the request settled', async () => {
      const snapshot: { tiles: VisualTile[]; missingFileUris: string[] } = {
        tiles: [],
        missingFileUris: ['pubky://user-1/pub/pubky.app/files/file-1'],
      };
      mockUseLiveQuery.mockImplementation(() => snapshot);

      const { result, rerender } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.hasPendingFiles).toBe(false);
      });

      // The row lands later (persisted by another flow): the snapshot re-emits
      // with the tile and without the URI, and the settled marker must not
      // suppress it.
      snapshot.tiles = [
        createPendingTile({ id: 'tile-a', postId: 'author:post-1', attachmentName: 'a.png', previewSrc: '/a.png' }),
      ];
      snapshot.missingFileUris = [];
      rerender();

      expect(result.current.tiles).toHaveLength(1);
      expect(result.current.hasPendingFiles).toBe(false);
    });
  });

  it('exposes hasPendingSnapshot while the live query has not emitted yet', () => {
    // Before the first liveQuery emission the snapshot is `undefined` — callers
    // must treat this as loading, not as an (empty) resolved snapshot.
    mockUseLiveQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1'], hasMore: false }));

    expect(result.current.hasPendingSnapshot).toBe(true);
    expect(result.current.rows).toEqual([]);
    expect(result.current.hiddenPostCount).toBe(0);
  });

  it('clears hasPendingSnapshot once the live query emits', () => {
    const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1'], hasMore: false }));

    expect(result.current.hasPendingSnapshot).toBe(false);
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

  it('defaults hiddenPostCount to 0 when the snapshot provides none', () => {
    const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-1'], hasMore: false }));

    expect(result.current.hiddenPostCount).toBe(0);
  });

  describe('hiddenPostCount', () => {
    beforeEach(() => {
      mockUseLiveQuery.mockImplementation(useExecutedLiveQuery);
    });

    it('renders placeholder tiles for deleted and settled-missing posts while counting text-only posts as hidden', async () => {
      // Grid/List parity: deleted and not-found items keep their slot as
      // PostDeleted/PostMissing placeholders instead of being dropped, so only
      // the genuinely layout-hidden (non-media) post feeds the notice count.
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({ id: 'author:post-text', content: 'text only' }),
        createPostDetails({
          id: 'author:post-media',
          attachments: ['pubky://user-1/pub/pubky.app/files/file-1'],
        }),
        createPostDetails({ id: 'author:post-deleted', content: '[DELETED]' }),
        undefined,
      ]);
      mockGetMetadata.mockResolvedValue([
        createFileDetails({ id: 'user-1:file-1', contentType: 'image/jpeg', width: 1000, height: 800 }),
      ]);

      const { result } = renderHook(() =>
        useVisualFeedTiles({
          postIds: ['author:post-text', 'author:post-media', 'author:post-deleted', 'author:post-missing'],
          hasMore: false,
          showUnavailablePosts: true,
        }),
      );

      // The absent post's ensure-fetch settles (still no local row) and it
      // resolves into a "missing" placeholder alongside the deleted one.
      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(3);
      });

      const tilesByPostId = new Map(result.current.tiles.map((tile) => [tile.postId, tile]));
      expect(tilesByPostId.get('author:post-media')?.placeholderKind).toBeUndefined();
      expect(tilesByPostId.get('author:post-deleted')?.placeholderKind).toBe('deleted');
      expect(tilesByPostId.get('author:post-missing')?.placeholderKind).toBe('missing');
      expect(result.current.hiddenPostCount).toBe(1);
      expect(result.current.hasPendingPostDetails).toBe(false);
      expect(result.current.hasPendingFiles).toBe(false);
    });

    it('drops deleted and unresolved posts by default (interactive feeds keep the old behavior)', async () => {
      // Home/Search/Custom never enable `showUnavailablePosts`: a post deleted
      // while in the feed silently loses its tile, unresolved posts stay
      // dropped without pending gating, and neither feeds the hidden count.
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({
          id: 'author:post-media',
          attachments: ['pubky://user-1/pub/pubky.app/files/file-1'],
        }),
        createPostDetails({ id: 'author:post-deleted', content: '[DELETED]' }),
        undefined,
      ]);
      mockGetMetadata.mockResolvedValue([
        createFileDetails({ id: 'user-1:file-1', contentType: 'image/jpeg', width: 1000, height: 800 }),
      ]);

      const { result } = renderHook(() =>
        useVisualFeedTiles({
          postIds: ['author:post-media', 'author:post-deleted', 'author:post-missing'],
          hasMore: false,
        }),
      );

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });

      expect(result.current.tiles[0].postId).toBe('author:post-media');
      expect(result.current.hiddenPostCount).toBe(0);
      expect(result.current.hasPendingPostDetails).toBe(false);
    });

    it('keeps unresolved posts pending until their ensure-fetch settles, then marks them missing', async () => {
      let resolveEnsureFetch!: () => void;
      mockGetOrFetch.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveEnsureFetch = resolve;
          }),
      );
      mockFindByIdsPreserveOrder.mockResolvedValue([undefined]);

      const { result } = renderHook(() =>
        useVisualFeedTiles({ postIds: ['author:post-unknown'], hasMore: false, showUnavailablePosts: true }),
      );

      // Fetch still in flight: no placeholder yet, surfaced as pending instead.
      await waitFor(() => {
        expect(result.current.hasPendingPostDetails).toBe(true);
      });
      expect(result.current.tiles).toHaveLength(0);

      await act(async () => {
        resolveEnsureFetch();
      });

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });
      expect(result.current.tiles[0].placeholderKind).toBe('missing');
      expect(result.current.tiles[0].preferredSize).toBe('square');
      expect(result.current.tiles[0].probeState).toBe('ready');
      expect(result.current.hasPendingPostDetails).toBe(false);
      expect(result.current.hiddenPostCount).toBe(0);
    });

    it('counts remote posts only once every attachment resolved to non-visual metadata', async () => {
      let resolveFetchFiles!: () => void;
      mockFetchFiles.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveFetchFiles = resolve;
          }),
      );
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({
          id: 'author:post-doc',
          attachments: ['pubky://user-1/pub/pubky.app/files/file-doc'],
        }),
        createPostDetails({
          id: 'author:post-pending',
          attachments: [
            'pubky://user-2/pub/pubky.app/files/file-known',
            'pubky://user-2/pub/pubky.app/files/file-pending',
          ],
        }),
      ]);
      mockGetMetadata.mockResolvedValue([
        createFileDetails({ id: 'user-1:file-doc', contentType: 'application/pdf' }),
        createFileDetails({ id: 'user-2:file-known', contentType: 'application/pdf' }),
      ]);

      const { result } = renderHook(() =>
        useVisualFeedTiles({ postIds: ['author:post-doc', 'author:post-pending'], hasMore: false }),
      );

      await waitFor(() => {
        expect(mockFetchFiles).toHaveBeenCalledWith({
          fileUris: ['pubky://user-2/pub/pubky.app/files/file-pending'],
        });
      });

      // post-doc: all metadata resolved, none visual -> counted.
      // post-pending: one attachment still fetching -> not counted yet.
      expect(result.current.hasPendingFiles).toBe(true);
      expect(result.current.hiddenPostCount).toBe(1);
      expect(result.current.tiles).toHaveLength(0);

      await act(async () => {
        resolveFetchFiles();
      });

      // The fetch came back without a row: still not counted (there is nothing
      // to render), but the feed is no longer resolving file metadata.
      await waitFor(() => {
        expect(result.current.hasPendingFiles).toBe(false);
      });
      expect(result.current.hiddenPostCount).toBe(1);
      expect(result.current.tiles).toHaveLength(0);
    });

    it('counts posts whose local attachments produce no media tiles', async () => {
      mockLocalFilesState.posts = {
        'author:post-local-doc': [{ type: 'application/pdf', name: 'doc.pdf', urls: { main: '/doc.pdf' } }],
        'author:post-local-image': [
          { type: 'image/png', name: 'img.png', urls: { main: '/img.png', feed: '/img-feed.png' } },
        ],
      };
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({ id: 'author:post-local-doc' }),
        createPostDetails({ id: 'author:post-local-image' }),
      ]);

      const { result } = renderHook(() =>
        useVisualFeedTiles({ postIds: ['author:post-local-doc', 'author:post-local-image'], hasMore: false }),
      );

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });

      expect(result.current.hiddenPostCount).toBe(1);
      expect(result.current.tiles[0].postId).toBe('author:post-local-image');
      expect(mockGetMetadata).not.toHaveBeenCalled();
    });
  });
  describe('article (kind long) tiles', () => {
    beforeEach(() => {
      mockUseLiveQuery.mockImplementation(useExecutedLiveQuery);
    });

    const articlePost = (id: string, body: string, attachments: string[]): PostDetailsModelSchema => ({
      ...createPostDetails({ id, attachments }),
      kind: 'long',
      content: JSON.stringify({ title: 'T', body }),
    });

    it('renders only the cover tile for articles; inline body images are never tiles', async () => {
      mockFindByIdsPreserveOrder.mockResolvedValue([
        articlePost('author:article-covered', 'Text ![a](attachment:1) ![b](attachment:2)', [
          'pubky://user-1/pub/pubky.app/files/cover-1',
          'pubky://user-1/pub/pubky.app/files/inline-1',
          'pubky://user-1/pub/pubky.app/files/inline-2',
        ]),
        // Slot-0 rule: body references attachment:0 → no cover, no tiles
        articlePost('author:article-coverless', '![c](attachment:0)', ['pubky://user-1/pub/pubky.app/files/inline-3']),
      ]);
      mockGetMetadata.mockResolvedValue([
        createFileDetails({ id: 'user-1:cover-1', contentType: 'image/jpeg', width: 1000, height: 800 }),
      ]);

      const { result } = renderHook(() =>
        useVisualFeedTiles({ postIds: ['author:article-covered', 'author:article-coverless'], hasMore: false }),
      );

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });
      expect(result.current.tiles[0].postId).toBe('author:article-covered');
      expect(result.current.tiles[0].attachmentId).toBe('user-1:cover-1');
      // The coverless article contributes no tiles and counts as hidden
      expect(result.current.hiddenPostCount).toBe(1);
      // Inline attachments are never fetched for tiles
      expect(mockGetMetadata).toHaveBeenCalledWith({
        fileAttachments: ['pubky://user-1/pub/pubky.app/files/cover-1'],
      });
    });
  });
  describe('link video tiles', () => {
    const YOUTUBE_URL = 'https://youtu.be/dQw4w9WgXcQ';

    beforeEach(() => {
      mockUseLiveQuery.mockImplementation(useExecutedLiveQuery);
    });

    it('builds a ready 16:9 tile for a post whose only video is a YouTube link', async () => {
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({ id: 'author:post-youtube', kind: 'video', content: `Watch ${YOUTUBE_URL}` }),
      ]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-youtube'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });

      const [tile] = result.current.tiles;
      expect(tile.id).toBe(`author:post-youtube:link:${YOUTUBE_URL}`);
      expect(tile.linkVideo).toEqual({ provider: 'youtube', hostLabel: 'youtu.be' });
      expect(tile.previewSrc).toBe(getVisualYouTubeThumbnailUrl('dQw4w9WgXcQ', 'hq720'));
      expect(tile.mainSrc).toBe(getVisualYouTubeThumbnailUrl('dQw4w9WgXcQ', 'mqdefault'));
      expect(tile.probeState).toBe('ready');
      expect(tile.sizeOptions).toEqual(['wide', 'medium']);
      expect(tile.content).toBe(`Watch ${YOUTUBE_URL}`);
      expect(result.current.hiddenPostCount).toBe(0);
      expect(result.current.hasPendingTiles).toBe(false);
      expect(result.current.rows).toHaveLength(1);
      // Never probed: a probe would contact the video host before the tile is even shown.
      expect(getVisualTileProbeCacheEntry(tile.id)).toBeUndefined();
      expect(mockGetMetadata).not.toHaveBeenCalled();
    });

    it('builds a card-only tile for a Vimeo link', async () => {
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({ id: 'author:post-vimeo', kind: 'video', content: 'https://vimeo.com/123456789' }),
      ]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-vimeo'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });

      const [tile] = result.current.tiles;
      expect(tile.linkVideo).toEqual({ provider: 'vimeo', hostLabel: 'vimeo.com' });
      expect(tile.previewSrc).toBe('');
      expect(tile.mainSrc).toBe('');
      expect(tile.probeState).toBe('ready');
      expect(result.current.hiddenPostCount).toBe(0);
    });

    it('plays a direct video file link from the link itself, without probing it', async () => {
      const fileUrl = 'https://cdn.example.com/clips/holiday.mp4';
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({ id: 'author:post-file', kind: 'video', content: fileUrl }),
      ]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-file'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });

      const [tile] = result.current.tiles;
      expect(tile.linkVideo).toEqual({ provider: 'file', hostLabel: 'cdn.example.com' });
      expect(tile.mediaKind).toBe('video');
      expect(tile.previewSrc).toBe(fileUrl);
      expect(tile.mainSrc).toBe(fileUrl);
      expect(tile.probeState).toBe('ready');
      expect(getVisualTileProbeCacheEntry(tile.id)).toBeUndefined();
    });

    it('decides by the content, so a post stored with kind link before video links were classified still gets a tile', async () => {
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({ id: 'author:post-legacy', kind: 'link', content: YOUTUBE_URL }),
      ]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-legacy'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });
      expect(result.current.tiles[0].linkVideo?.provider).toBe('youtube');
    });

    it('keeps attachment tiles and adds no link tile when the post also carries media', async () => {
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({
          id: 'author:post-both',
          kind: 'video',
          content: YOUTUBE_URL,
          attachments: ['pubky://user-1/pub/pubky.app/files/file-1'],
        }),
      ]);
      mockGetMetadata.mockResolvedValue([
        createFileDetails({ id: 'user-1:file-1', contentType: 'image/jpeg', width: 1000, height: 800 }),
      ]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-both'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });
      expect(result.current.tiles[0].attachmentId).toBe('user-1:file-1');
      expect(result.current.tiles[0].linkVideo).toBeUndefined();
    });

    it('waits while attachment metadata is unresolved instead of building a link tile', async () => {
      mockFetchFiles.mockImplementation(() => new Promise<void>(() => {}));
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({
          id: 'author:post-pending',
          kind: 'video',
          content: YOUTUBE_URL,
          attachments: ['pubky://user-1/pub/pubky.app/files/file-pending'],
        }),
      ]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-pending'], hasMore: false }));

      await waitFor(() => {
        expect(mockFetchFiles).toHaveBeenCalledTimes(1);
      });
      // The attachment may still turn out to be media, and attachments win over the link.
      expect(result.current.tiles).toHaveLength(0);
      expect(result.current.hiddenPostCount).toBe(0);
      expect(result.current.hasPendingFiles).toBe(true);
    });

    it('falls back to the link once every remote attachment resolved to non-visual metadata', async () => {
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({
          id: 'author:post-doc',
          kind: 'video',
          content: YOUTUBE_URL,
          attachments: ['pubky://user-1/pub/pubky.app/files/file-doc'],
        }),
      ]);
      mockGetMetadata.mockResolvedValue([createFileDetails({ id: 'user-1:file-doc', contentType: 'application/pdf' })]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-doc'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });
      expect(result.current.tiles[0].linkVideo?.provider).toBe('youtube');
      expect(result.current.hiddenPostCount).toBe(0);
    });

    it('falls back to the link when the local attachments are not media', async () => {
      mockLocalFilesState.posts = {
        'author:post-local-doc': [{ type: 'application/pdf', name: 'doc.pdf', urls: { main: '/doc.pdf' } }],
      };
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({ id: 'author:post-local-doc', kind: 'video', content: YOUTUBE_URL }),
      ]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-local-doc'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });
      expect(result.current.tiles[0].linkVideo?.provider).toBe('youtube');
      expect(result.current.hiddenPostCount).toBe(0);
    });

    it.each([
      ['an article', { kind: 'long', content: JSON.stringify({ title: 'T', body: `See ${YOUTUBE_URL}` }) }],
      ['a collection', { kind: 'collection', content: JSON.stringify({ description: YOUTUBE_URL }) }],
      [
        'a lock whose video link is only in its title',
        {
          kind: 'short',
          content: JSON.stringify({ lock_title: YOUTUBE_URL, teaser_description: 'Unlock to watch' }),
          lock: 'pubky://author/pub/app.locks/lock-1.json',
        },
      ],
      // PostLinkEmbeds embeds nothing for it either.
      ['a protocol-relative video link', { content: '//youtu.be/dQw4w9WgXcQ' }],
      ['a YouTube channel link', { content: 'https://www.youtube.com/@somechannel' }],
      ['a video link inside Markdown', { content: `[my video](${YOUTUBE_URL})` }],
      ['a link that is not a video', { content: 'https://example.com/article' }],
      ['a video link that is not the first link', { content: `https://example.com then ${YOUTUBE_URL}` }],
    ])('builds no link tile for %s and counts it as hidden', async (_label, post) => {
      mockFindByIdsPreserveOrder.mockResolvedValue([createPostDetails({ id: 'author:post-no-tile', ...post })]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-no-tile'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.hiddenPostCount).toBe(1);
      });
      expect(result.current.tiles).toHaveLength(0);
    });

    it("reads a lock's video link from its teaser and shows the teaser, not the JSON envelope", async () => {
      const teaser = `Trailer ${YOUTUBE_URL}`;
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({
          id: 'author:post-lock',
          // Kind inference reads the envelope, so the announcement is stored as a video post.
          kind: 'video',
          content: JSON.stringify({ lock_title: 'Locked content', teaser_description: teaser }),
          lock: 'pubky://author/pub/app.locks/lock-1.json',
        }),
      ]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-lock'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });
      expect(result.current.tiles[0].linkVideo?.provider).toBe('youtube');
      expect(result.current.tiles[0].content).toBe(teaser);
      expect(result.current.hiddenPostCount).toBe(0);
    });

    it('keeps the deleted placeholder for a deleted post that held a video link', async () => {
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({ id: 'author:post-deleted', kind: 'video', content: '[DELETED]' }),
      ]);

      const { result } = renderHook(() =>
        useVisualFeedTiles({ postIds: ['author:post-deleted'], hasMore: false, showUnavailablePosts: true }),
      );

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });
      expect(result.current.tiles[0].placeholderKind).toBe('deleted');
      expect(result.current.tiles[0].linkVideo).toBeUndefined();
    });

    it('marks the link tile of a blurred post as blurred', async () => {
      mockEnrichPosts.mockImplementation(async (posts: PostDetailsModelSchema[]) =>
        posts.map((post) => ({ ...post, is_moderated: true, is_blurred: true })),
      );
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({ id: 'author:post-blurred', kind: 'video', content: YOUTUBE_URL }),
      ]);

      const { result } = renderHook(() => useVisualFeedTiles({ postIds: ['author:post-blurred'], hasMore: false }));

      await waitFor(() => {
        expect(result.current.tiles).toHaveLength(1);
      });
      expect(result.current.tiles[0].isBlurred).toBe(true);
    });

    it('packs two link tiles into one row without waiting for the next page', async () => {
      mockFindByIdsPreserveOrder.mockResolvedValue([
        createPostDetails({ id: 'author:post-a', kind: 'video', content: YOUTUBE_URL }),
        createPostDetails({ id: 'author:post-b', kind: 'video', content: 'https://vimeo.com/123456789' }),
      ]);

      const { result } = renderHook(() =>
        useVisualFeedTiles({ postIds: ['author:post-a', 'author:post-b'], hasMore: true }),
      );

      await waitFor(() => {
        expect(result.current.rows).toHaveLength(1);
      });
      expect(result.current.rows[0].cells.map((cell) => cell.size)).toEqual(['medium', 'medium']);
      expect(result.current.tail).toEqual([]);
      expect(result.current.hasPendingTiles).toBe(false);
    });
  });
});
