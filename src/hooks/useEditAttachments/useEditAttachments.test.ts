import { useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { buildFile } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import type { ExistingAttachment } from '@/hooks/usePost/usePost.types';
import type { FileDetailsModelSchema } from '@/models/file/fileDetails.schema';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { useEditAttachments } from './useEditAttachments';

// Hoist mocks
const { mockLoggerError } = vi.hoisted(() => ({ mockLoggerError: vi.fn() }));

// Mock FileController
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getMetadata: vi.fn(),
    fetchFiles: vi.fn(),
    getFileUrl: vi.fn(
      ({ fileId, variant }: { fileId: string; variant: string }) => `https://cdn.example/${fileId}/${variant}`,
    ),
  },
}));

// Mock Logger
vi.mock('@/libs/logger/logger', async () => {
  const actual = await vi.importActual<typeof import('@/libs/logger/logger')>('@/libs/logger/logger');
  return {
    ...actual,
    Logger: {
      ...actual.Logger,
      error: mockLoggerError,
    },
  };
});

const POST_ID = 'author-pubky:post-1';
const URI_1 = 'pubky://author-pubky/pub/pubky.app/files/FILE1';
const URI_2 = 'pubky://author-pubky/pub/pubky.app/files/FILE2';

const PLACEHOLDER_1: ExistingAttachment = { uri: URI_1, type: 'application/octet-stream', name: 'FILE1', urls: null };
const PLACEHOLDER_2: ExistingAttachment = { uri: URI_2, type: 'application/octet-stream', name: 'FILE2', urls: null };

const fileMetadata = ({
  uri,
  id,
  contentType,
  name,
}: {
  uri: string;
  id: string;
  contentType: string;
  name: string;
}): FileDetailsModelSchema => asOpaque<FileDetailsModelSchema>({ uri, id, content_type: contentType, name });

const META_1 = fileMetadata({ uri: URI_1, id: 'author-pubky:FILE1', contentType: 'image/png', name: 'photo.png' });
const META_2 = fileMetadata({
  uri: URI_2,
  id: 'author-pubky:FILE2',
  contentType: 'application/pdf',
  name: 'doc.pdf',
});

const RESOLVED_1: ExistingAttachment = {
  uri: URI_1,
  type: 'image/png',
  name: 'photo.png',
  urls: {
    main: 'https://cdn.example/author-pubky:FILE1/main',
    feed: 'https://cdn.example/author-pubky:FILE1/feed',
    large: 'https://cdn.example/author-pubky:FILE1/large',
  },
};
const RESOLVED_2: ExistingAttachment = {
  uri: URI_2,
  type: 'application/pdf',
  name: 'doc.pdf',
  urls: { main: 'https://cdn.example/author-pubky:FILE2/main', feed: undefined },
};

// Harness that owns the existingAttachments state with a real useState so the
// hook's functional updates (prev-mapping, non-resurrection) are exercised
function useEditAttachmentsHarness({
  enabled,
  postId,
  uris,
  displayUris,
}: {
  enabled: boolean;
  postId?: string;
  uris?: string[];
  displayUris?: string[];
}) {
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([]);
  const { seededUris } = useEditAttachments({
    enabled,
    postId,
    uris,
    displayUris,
    existingAttachments,
    setExistingAttachments,
  });
  return { existingAttachments, setExistingAttachments, seededUris };
}

describe('useEditAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLocalFilesStore.setState({ profile: null, posts: {}, articleCovers: {}, collections: {} });
    vi.mocked(FileController.getMetadata).mockResolvedValue([]);
    vi.mocked(FileController.fetchFiles).mockResolvedValue(undefined);
  });

  describe('seeding from the local files store', () => {
    it('zips store attachments with uris by index when lengths match', () => {
      useLocalFilesStore.getState().setPostAttachments(POST_ID, [
        { type: 'image/png', name: 'local.png', urls: { main: 'local-main-1', feed: 'local-feed-1' } },
        { type: 'video/mp4', name: 'local.mp4', urls: { main: 'local-main-2' } },
      ]);

      const { result } = renderHook(() =>
        useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: [URI_1, URI_2] }),
      );

      expect(result.current.existingAttachments).toEqual([
        { uri: URI_1, type: 'image/png', name: 'local.png', urls: { main: 'local-main-1', feed: 'local-feed-1' } },
        { uri: URI_2, type: 'video/mp4', name: 'local.mp4', urls: { main: 'local-main-2' } },
      ]);
      // All entries already have urls, so nothing needs metadata resolution
      expect(FileController.getMetadata).not.toHaveBeenCalled();
    });

    it('ignores the store entry entirely on a length mismatch and seeds placeholders', async () => {
      useLocalFilesStore
        .getState()
        .setPostAttachments(POST_ID, [{ type: 'image/png', name: 'only-one.png', urls: { main: 'local-main-1' } }]);

      const { result } = renderHook(() =>
        useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: [URI_1, URI_2] }),
      );

      expect(result.current.existingAttachments).toEqual([PLACEHOLDER_1, PLACEHOLDER_2]);

      // Metadata resolution runs for the placeholders; with nothing resolvable
      // (empty metadata everywhere) they stay placeholders, marked terminal once
      // the resolve pass finishes so the UI swaps the skeleton for the file card
      await waitFor(() => {
        expect(FileController.getMetadata).toHaveBeenCalledWith({ fileAttachments: [URI_1, URI_2] });
      });
      await waitFor(() => {
        expect(result.current.existingAttachments).toEqual([
          { ...PLACEHOLDER_1, resolutionFailed: true },
          { ...PLACEHOLDER_2, resolutionFailed: true },
        ]);
      });
    });

    it('does not seed when disabled', () => {
      const { result } = renderHook(() =>
        useEditAttachmentsHarness({ enabled: false, postId: POST_ID, uris: [URI_1] }),
      );

      expect(result.current.existingAttachments).toEqual([]);
      expect(FileController.getMetadata).not.toHaveBeenCalled();
    });

    it('does not seed anything for an empty uris list', () => {
      const { result } = renderHook(() => useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: [] }));

      expect(result.current.existingAttachments).toEqual([]);
      expect(FileController.getMetadata).not.toHaveBeenCalled();
    });

    it('waits for uris to become available, then seeds', () => {
      useLocalFilesStore
        .getState()
        .setPostAttachments(POST_ID, [{ type: 'image/png', name: 'local.png', urls: { main: 'local-main-1' } }]);

      const { result, rerender } = renderHook(
        (props: { uris?: string[] }) => useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: props.uris }),
        { initialProps: { uris: undefined as string[] | undefined } },
      );

      expect(result.current.existingAttachments).toEqual([]);

      rerender({ uris: [URI_1] });

      expect(result.current.existingAttachments).toEqual([
        { uri: URI_1, type: 'image/png', name: 'local.png', urls: { main: 'local-main-1' } },
      ]);
    });

    it('snapshots the seeded uris and keeps them stable when the live uris prop changes', () => {
      useLocalFilesStore
        .getState()
        .setPostAttachments(POST_ID, [{ type: 'image/png', name: 'local.png', urls: { main: 'local-main-1' } }]);

      const { result, rerender } = renderHook(
        (props: { uris: string[] }) => useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: props.uris }),
        { initialProps: { uris: [URI_1] } },
      );

      expect(result.current.seededUris).toEqual([URI_1]);

      // The live post row changes underneath the open dialog (another tab/device
      // edit) — the snapshot must NOT follow it, or submit-time change detection
      // would misclassify a content-only edit as an attachment edit
      rerender({ uris: [URI_1, URI_2] });

      expect(result.current.seededUris).toEqual([URI_1]);
    });

    it('does not re-seed when the uris array identity changes after seeding', () => {
      useLocalFilesStore
        .getState()
        .setPostAttachments(POST_ID, [{ type: 'image/png', name: 'local.png', urls: { main: 'local-main-1' } }]);

      const { result, rerender } = renderHook(
        (props: { uris: string[] }) => useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: props.uris }),
        { initialProps: { uris: [URI_1] } },
      );

      expect(result.current.existingAttachments).toHaveLength(1);

      // The user removes the attachment from the composer
      act(() => {
        result.current.setExistingAttachments([]);
      });

      // A new array identity with the same content must NOT reset the removal
      rerender({ uris: [URI_1] });

      expect(result.current.existingAttachments).toEqual([]);
    });
  });

  // An article's strip shows its cover alone (`displayUris`), and the cover is no attachment slot
  // (ADR-0027 D14): its preview is the store's cover entry, never the inline list zipped by index.
  describe('seeding an article cover strip', () => {
    const OWNER = fakeOwner(1);
    const ARTICLE_ID = `${OWNER}:0034BBBDFK83G`;
    const mediaUri = (byte: number) => buildFile(OWNER, { bytes: new Uint8Array([byte]), type: 'image/png' }).url;
    const COVER_URI = mediaUri(1);
    const INLINE_URI = mediaUri(2);

    it('seeds the cover from the store cover entry, not from the inline entry at its index', () => {
      // A same-session article: `posts` holds its inline media, index-aligned with `uris`;
      // `articleCovers` holds its cover
      useLocalFilesStore
        .getState()
        .setPostAttachments(ARTICLE_ID, [
          { type: 'image/png', name: 'shot.png', urls: { main: 'shot-main', feed: 'shot-feed' } },
        ]);
      useLocalFilesStore.getState().setArticleCover(ARTICLE_ID, {
        type: 'image/png',
        name: 'cover.png',
        urls: { main: 'cover-main', feed: 'cover-feed' },
      });

      const { result } = renderHook(() =>
        useEditAttachmentsHarness({ enabled: true, postId: ARTICLE_ID, uris: [INLINE_URI], displayUris: [COVER_URI] }),
      );

      expect(result.current.existingAttachments).toEqual([
        { uri: COVER_URI, type: 'image/png', name: 'cover.png', urls: { main: 'cover-main', feed: 'cover-feed' } },
      ]);
      // The snapshot the save diffs against still holds every stored attachment
      expect(result.current.seededUris).toEqual([INLINE_URI]);
      expect(FileController.getMetadata).not.toHaveBeenCalled();
    });

    it('seeds a placeholder for a cover the store does not hold, never the inline entry at its index', async () => {
      // A cover kept from an earlier session: `posts` holds this session's inline media, `articleCovers` nothing
      useLocalFilesStore
        .getState()
        .setPostAttachments(ARTICLE_ID, [
          { type: 'image/png', name: 'shot.png', urls: { main: 'shot-main', feed: 'shot-feed' } },
        ]);
      const coverPlaceholder: ExistingAttachment = {
        uri: COVER_URI,
        type: 'application/octet-stream',
        name: COVER_URI.slice(COVER_URI.lastIndexOf('/') + 1),
        urls: null,
      };

      const { result } = renderHook(() =>
        useEditAttachmentsHarness({ enabled: true, postId: ARTICLE_ID, uris: [INLINE_URI], displayUris: [COVER_URI] }),
      );

      expect(result.current.existingAttachments).toEqual([coverPlaceholder]);
      await waitFor(() => {
        expect(FileController.getMetadata).toHaveBeenCalledWith({ fileAttachments: [COVER_URI] });
      });
      await waitFor(() => {
        expect(result.current.existingAttachments).toEqual([{ ...coverPlaceholder, resolutionFailed: true }]);
      });
    });
  });

  describe('metadata resolution', () => {
    it('seeds placeholders and resolves entries by uri, not by index', async () => {
      // Metadata comes back in reverse order to prove matching is by uri
      vi.mocked(FileController.getMetadata).mockResolvedValue([META_2, META_1]);

      const { result } = renderHook(() =>
        useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: [URI_1, URI_2] }),
      );

      // Before resolution: placeholders derived from the uri's last segment
      expect(result.current.existingAttachments).toEqual([PLACEHOLDER_1, PLACEHOLDER_2]);

      await waitFor(() => {
        expect(result.current.existingAttachments).toEqual([RESOLVED_1, RESOLVED_2]);
      });

      // Everything resolved on the first lookup — no Nexus backfill
      expect(FileController.fetchFiles).not.toHaveBeenCalled();
    });

    it('backfills missing metadata via fetchFiles and applies the second lookup', async () => {
      // Local metadata initially only knows URI_1; fetchFiles makes URI_2 available
      const localMetadata = new Map<string, FileDetailsModelSchema>([[URI_1, META_1]]);
      vi.mocked(FileController.getMetadata).mockImplementation(async ({ fileAttachments }) =>
        fileAttachments.flatMap((uri) => {
          const metadata = localMetadata.get(uri);
          return metadata ? [metadata] : [];
        }),
      );
      vi.mocked(FileController.fetchFiles).mockImplementation(async ({ fileUris }) => {
        if (fileUris.includes(URI_2)) localMetadata.set(URI_2, META_2);
      });

      const { result } = renderHook(() =>
        useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: [URI_1, URI_2] }),
      );

      await waitFor(() => {
        expect(result.current.existingAttachments).toEqual([RESOLVED_1, RESOLVED_2]);
      });

      expect(FileController.fetchFiles).toHaveBeenCalledWith({ fileUris: [URI_2] });
    });

    it('never resurrects an attachment the user removed while metadata was resolving', async () => {
      // Keep every metadata lookup pending until we resolve it manually
      const pendingLookups: Array<(metadata: FileDetailsModelSchema[]) => void> = [];
      vi.mocked(FileController.getMetadata).mockImplementation(
        () => new Promise((resolve) => pendingLookups.push(resolve)),
      );

      const { result } = renderHook(() =>
        useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: [URI_1, URI_2] }),
      );

      expect(result.current.existingAttachments).toHaveLength(2);

      // The user removes URI_2 before the lookup returns
      act(() => {
        result.current.setExistingAttachments((prev) => prev.filter((attachment) => attachment.uri !== URI_2));
      });

      // Now every in-flight lookup resolves with metadata for BOTH files
      await act(async () => {
        pendingLookups.forEach((resolve) => resolve([META_1, META_2]));
      });

      await waitFor(() => {
        expect(result.current.existingAttachments).toEqual([RESOLVED_1]);
      });
    });

    it('logs and marks entries as terminally unresolved when resolution fails', async () => {
      const error = new Error('metadata lookup failed');
      vi.mocked(FileController.getMetadata).mockRejectedValue(error);

      const { result } = renderHook(() => useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: [URI_1] }));

      await waitFor(() => {
        expect(mockLoggerError).toHaveBeenCalledWith('[useEditAttachments] Failed to resolve attachment metadata', {
          uris: [URI_1],
          error,
        });
      });
      await waitFor(() => {
        expect(result.current.existingAttachments).toEqual([{ ...PLACEHOLDER_1, resolutionFailed: true }]);
      });
    });

    it('marks entries as terminally unresolved when the Nexus backfill still returns no metadata', async () => {
      vi.mocked(FileController.getMetadata).mockResolvedValue([]);

      const { result } = renderHook(() => useEditAttachmentsHarness({ enabled: true, postId: POST_ID, uris: [URI_1] }));

      await waitFor(() => {
        expect(FileController.fetchFiles).toHaveBeenCalledWith({ fileUris: [URI_1] });
      });
      await waitFor(() => {
        expect(result.current.existingAttachments).toEqual([{ ...PLACEHOLDER_1, resolutionFailed: true }]);
      });
      // Terminally-failed entries are excluded from later passes — no retry loop
      expect(FileController.getMetadata).toHaveBeenCalledTimes(2);
    });
  });
});
