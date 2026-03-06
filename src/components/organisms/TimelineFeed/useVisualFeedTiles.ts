'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import * as Libs from '@/libs';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import {
  composeVisualRows,
  getVisualPendingOverflowFallbackIds,
  getVisualMediaKind,
  isVisualMediaContentType,
  parseMediaDimension,
  resolveVisualTileSizeOptions,
  resolvePreferredVisualTileSize,
} from './TimelineFeed.visual.helpers';
import type { VisualTile, VisualTileProbeState } from './TimelineFeed.visual.types';

type VisualFeedSnapshot = {
  tiles: VisualTile[];
  missingFileUris: string[];
};

type ProbeCacheEntry = {
  status: VisualTileProbeState;
  width?: number;
  height?: number;
  promise?: Promise<void>;
};

const EMPTY_SNAPSHOT: VisualFeedSnapshot = {
  tiles: [],
  missingFileUris: [],
};

const visualTileProbeCache = new Map<string, ProbeCacheEntry>();
const visualTilePreferredSizeFallbackCache = new Map<string, NonNullable<VisualTile['preferredSize']>>();

async function probeImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('Image metadata unavailable'));
        return;
      }

      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => reject(new Error('Failed to load image metadata'));
    image.src = src;
  });
}

async function probeVideoDimensions(src: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) {
        reject(new Error('Video metadata unavailable'));
        return;
      }

      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };

    video.onerror = () => reject(new Error('Failed to load video metadata'));
    video.src = src;
  });
}

function ensureProbe(tile: VisualTile): Promise<void> {
  const existing = visualTileProbeCache.get(tile.id);

  if (existing?.status === 'ready' || existing?.status === 'failed') {
    return Promise.resolve();
  }

  if (existing?.promise) {
    return existing.promise;
  }

  const promise = (
    tile.mediaKind === 'video'
      ? probeVideoDimensions(tile.mainSrc)
      : probeImageDimensions(tile.previewSrc || tile.mainSrc)
  )
    .then(({ width, height }) => {
      visualTileProbeCache.set(tile.id, {
        status: 'ready',
        width,
        height,
      });
    })
    .catch((error) => {
      Libs.Logger.error('[VisualFeed] Failed to probe media dimensions', {
        tileId: tile.id,
        error,
      });
      visualTileProbeCache.set(tile.id, {
        status: 'failed',
      });
    });

  visualTileProbeCache.set(tile.id, {
    status: 'pending',
    promise,
  });

  return promise;
}

function buildLocalTile(
  post: Core.EnrichedPostDetails,
  attachment: AttachmentConstructed,
  index: number,
): VisualTile | null {
  if (!isVisualMediaContentType(attachment.type)) {
    return null;
  }

  const attachmentId = `${post.id}:local:${attachment.name}:${index}`;
  const mediaKind = getVisualMediaKind(attachment.type);
  const previewSrc =
    attachment.type === 'image/gif' ? attachment.urls.main : (attachment.urls.feed ?? attachment.urls.main);

  return {
    id: attachmentId,
    postId: post.id,
    attachmentId,
    attachmentName: attachment.name,
    contentType: attachment.type,
    mediaKind,
    previewSrc,
    mainSrc: attachment.urls.main,
    probeState: 'pending',
    isBlurred: post.is_blurred,
    content: post.content,
    indexedAt: post.indexed_at,
  };
}

function buildRemoteTile(post: Core.EnrichedPostDetails, file: Core.FileDetailsModelSchema): VisualTile | null {
  if (!isVisualMediaContentType(file.content_type)) {
    return null;
  }

  const metadataWidth = parseMediaDimension(file.metadata?.width);
  const metadataHeight = parseMediaDimension(file.metadata?.height);
  const mainSrc = Core.FileController.getFileUrl({ fileId: file.id, variant: Core.FileVariant.MAIN });
  const previewSrc =
    file.content_type === 'image/gif'
      ? mainSrc
      : Core.FileController.getFileUrl({ fileId: file.id, variant: Core.FileVariant.FEED });

  return {
    id: `${post.id}:${file.id}`,
    postId: post.id,
    attachmentId: file.id,
    attachmentName: file.name,
    contentType: file.content_type,
    mediaKind: getVisualMediaKind(file.content_type),
    previewSrc,
    mainSrc,
    metadataWidth,
    metadataHeight,
    probeState: metadataWidth && metadataHeight ? 'ready' : 'pending',
    isBlurred: post.is_blurred,
    content: post.content,
    indexedAt: post.indexed_at,
  };
}

function resolveTileProbeState(tile: VisualTile): VisualTile {
  const cachedFallbackPreferredSize = visualTilePreferredSizeFallbackCache.get(tile.id);

  if (tile.metadataWidth && tile.metadataHeight) {
    const sizeOptions = resolveVisualTileSizeOptions(
      tile.id,
      tile.metadataWidth,
      tile.metadataHeight,
      cachedFallbackPreferredSize,
    );

    return {
      ...tile,
      probeState: 'ready',
      sizeOptions,
      preferredSize: resolvePreferredVisualTileSize(
        tile.id,
        tile.metadataWidth,
        tile.metadataHeight,
        cachedFallbackPreferredSize,
      ),
    };
  }

  const cachedProbe = visualTileProbeCache.get(tile.id);

  if (cachedProbe?.status === 'ready' && cachedProbe.width && cachedProbe.height) {
    const sizeOptions = resolveVisualTileSizeOptions(
      tile.id,
      cachedProbe.width,
      cachedProbe.height,
      cachedFallbackPreferredSize,
    );

    return {
      ...tile,
      metadataWidth: cachedProbe.width,
      metadataHeight: cachedProbe.height,
      probeState: 'ready',
      sizeOptions,
      preferredSize: resolvePreferredVisualTileSize(
        tile.id,
        cachedProbe.width,
        cachedProbe.height,
        cachedFallbackPreferredSize,
      ),
    };
  }

  if (cachedProbe?.status === 'failed') {
    return {
      ...tile,
      probeState: 'failed',
      sizeOptions: [cachedFallbackPreferredSize ?? 'medium'],
      preferredSize: cachedFallbackPreferredSize ?? 'medium',
    };
  }

  return {
    ...tile,
    probeState: 'pending',
    sizeOptions: cachedFallbackPreferredSize
      ? [cachedFallbackPreferredSize, 'medium'].filter(
          (size, index, sizes): size is NonNullable<VisualTile['preferredSize']> => {
            return sizes.indexOf(size) === index;
          },
        )
      : undefined,
    preferredSize: cachedFallbackPreferredSize,
  };
}

export function useVisualFeedTiles({ postIds, hasMore }: { postIds: string[]; hasMore: boolean }) {
  const localPostAttachments = Core.useLocalFilesStore((state) => state.posts);
  const postIdsKey = React.useMemo(() => postIds.join('|'), [postIds]);
  const [, forceProbeRefresh] = React.useReducer((count) => count + 1, 0);

  React.useEffect(() => {
    if (postIds.length === 0) return;

    void Promise.all(
      postIds.map(async (postId) => {
        try {
          await Core.PostController.getOrFetchDetails({ compositeId: postId });
        } catch (error) {
          Libs.Logger.error('[VisualFeed] Failed to ensure post details', {
            postId,
            error,
          });
        }
      }),
    );
  }, [postIds, postIdsKey]);

  const snapshot = useLiveQuery(
    async (): Promise<VisualFeedSnapshot> => {
      if (postIds.length === 0) {
        return EMPTY_SNAPSHOT;
      }

      const rawPosts = await Core.PostDetailsModel.findByIdsPreserveOrder(postIds);
      const existingPosts = rawPosts.filter(Boolean) as Core.PostDetailsModelSchema[];
      const enrichedPosts = await Core.ModerationController.enrichPosts(existingPosts);
      const enrichedPostsById = new Map(enrichedPosts.map((post) => [post.id, post]));

      const missingFileUris = new Set<string>();
      const remoteAttachmentUris = Array.from(
        new Set(
          postIds.flatMap((postId) => {
            const localAttachments = localPostAttachments[postId];
            const post = enrichedPostsById.get(postId);

            if (!post || localAttachments?.length) {
              return [];
            }

            return post.attachments ?? [];
          }),
        ),
      );

      const remoteFiles = remoteAttachmentUris.length
        ? await Core.FileController.getMetadata({ fileAttachments: remoteAttachmentUris })
        : [];
      const remoteFilesById = new Map(remoteFiles.map((file) => [file.id, file]));

      const tiles = postIds.flatMap((postId) => {
        const post = enrichedPostsById.get(postId);
        if (!post || Libs.isPostDeleted(post.content)) {
          return [];
        }

        const localAttachments = localPostAttachments[postId];
        if (localAttachments?.length) {
          return localAttachments.flatMap((attachment, index) => {
            const tile = buildLocalTile(post, attachment, index);
            return tile ? [tile] : [];
          });
        }

        return (post.attachments ?? []).flatMap((attachmentUri) => {
          const attachmentId = Core.buildCompositeIdFromPubkyUri({
            uri: attachmentUri,
            domain: Core.CompositeIdDomain.FILES,
          });

          if (!attachmentId) {
            return [];
          }

          const file = remoteFilesById.get(attachmentId);
          if (!file) {
            missingFileUris.add(attachmentUri);
            return [];
          }

          const tile = buildRemoteTile(post, file);
          return tile ? [tile] : [];
        });
      });

      return {
        tiles,
        missingFileUris: Array.from(missingFileUris),
      };
    },
    [postIdsKey, localPostAttachments],
    EMPTY_SNAPSHOT,
  );
  const missingFileUris = React.useMemo(() => snapshot?.missingFileUris ?? [], [snapshot?.missingFileUris]);
  const missingFileUrisKey = React.useMemo(() => missingFileUris.join('|'), [missingFileUris]);

  React.useEffect(() => {
    if (!missingFileUris.length) return;

    void Core.FileApplication.fetchFiles(missingFileUris).catch((error) => {
      Libs.Logger.error('[VisualFeed] Failed to fetch missing file metadata', {
        fileUris: missingFileUris,
        error,
      });
    });
  }, [missingFileUris, missingFileUrisKey]);

  const tiles = (snapshot?.tiles ?? []).map(resolveTileProbeState);
  const pendingOverflowFallbackIds = React.useMemo(() => getVisualPendingOverflowFallbackIds(tiles), [tiles]);
  const pendingOverflowFallbackIdSet = React.useMemo(
    () => new Set(pendingOverflowFallbackIds),
    [pendingOverflowFallbackIds],
  );

  React.useEffect(() => {
    pendingOverflowFallbackIds.forEach((tileId) => {
      visualTilePreferredSizeFallbackCache.set(tileId, 'medium');
    });
  }, [pendingOverflowFallbackIds]);

  const stabilizedTiles = React.useMemo(() => {
    return tiles.map((tile) => {
      if (!pendingOverflowFallbackIdSet.has(tile.id)) {
        return tile;
      }

      return {
        ...tile,
        preferredSize: tile.preferredSize ?? 'medium',
      };
    });
  }, [tiles, pendingOverflowFallbackIdSet]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;
    const pendingTiles = stabilizedTiles.filter(
      (tile) => tile.preferredSize === undefined && tile.probeState === 'pending',
    );

    pendingTiles.forEach((tile) => {
      void ensureProbe(tile).finally(() => {
        if (isMounted) {
          forceProbeRefresh();
        }
      });
    });

    return () => {
      isMounted = false;
    };
  }, [stabilizedTiles]);

  const firstPendingTileIndex = stabilizedTiles.findIndex((tile) => tile.preferredSize === undefined);
  const resolvedTiles =
    firstPendingTileIndex === -1 ? stabilizedTiles : stabilizedTiles.slice(0, Math.max(firstPendingTileIndex, 0));
  const { rows, tail } = composeVisualRows(
    resolvedTiles.filter((tile): tile is VisualTile & { preferredSize: NonNullable<VisualTile['preferredSize']> } => {
      return tile.preferredSize !== undefined;
    }),
    firstPendingTileIndex === -1 && !hasMore,
  );

  return {
    rows,
    tail,
    tiles: stabilizedTiles,
    hasPendingTiles: firstPendingTileIndex !== -1,
  };
}
