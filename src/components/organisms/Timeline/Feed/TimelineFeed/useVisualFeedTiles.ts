'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { FileController } from '@/controllers/file/file';
import { ModerationController } from '@/controllers/moderation/moderation';
import { PostController } from '@/controllers/post/post';
import { Logger } from '@/libs/logger/logger';
import { isPostDeleted } from '@/libs/utils/utils';
import type { FileDetailsModelSchema } from '@/models/file/fileDetails.schema';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import {
  composeVisualRows,
  getVisualMediaKind,
  getVisualPendingOverflowFallbackIds,
  isVisualMediaContentType,
  parseMediaDimension,
  resolvePreferredVisualTileSize,
  resolveVisualTileSizeOptions,
} from './TimelineFeedVisual.helpers';
import type { VisualTile } from './TimelineFeedVisual.types';
import {
  ensureVisualTileProbe,
  getVisualTilePreferredSizeFallback,
  getVisualTileProbeCacheEntry,
  setVisualTilePreferredSizeFallback,
} from './TimelineFeedVisualMedia.utils';

type VisualFeedSnapshot = {
  tiles: VisualTile[];
  missingFileUris: string[];
};

const EMPTY_SNAPSHOT: VisualFeedSnapshot = {
  tiles: [],
  missingFileUris: [],
};

function buildLocalTile(
  post: EnrichedPostDetails,
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

function buildRemoteTile(post: EnrichedPostDetails, file: FileDetailsModelSchema): VisualTile | null {
  if (!isVisualMediaContentType(file.content_type)) {
    return null;
  }

  const metadataWidth = parseMediaDimension(file.metadata?.width);
  const metadataHeight = parseMediaDimension(file.metadata?.height);
  const mainSrc = FileController.getFileUrl({ fileId: file.id, variant: FileVariant.MAIN });
  const previewSrc =
    file.content_type === 'image/gif'
      ? mainSrc
      : FileController.getFileUrl({ fileId: file.id, variant: FileVariant.FEED });

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
  const cachedFallbackPreferredSize = getVisualTilePreferredSizeFallback(tile.id);

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

  const cachedProbe = getVisualTileProbeCacheEntry(tile.id);

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
  const localPostAttachments = useLocalFilesStore((state) => state.posts);
  const postIdsKey = React.useMemo(() => postIds.join('|'), [postIds]);
  const [, forceProbeRefresh] = React.useReducer((count) => count + 1, 0);

  React.useEffect(() => {
    if (!postIdsKey) return;

    const requestedPostIds = postIdsKey.split('|');

    void Promise.all(
      requestedPostIds.map(async (postId) => {
        try {
          await PostController.getOrFetch({ compositeId: postId });
        } catch (error) {
          Logger.error('[VisualFeed] Failed to ensure post details', {
            postId,
            error,
          });
        }
      }),
    );
  }, [postIdsKey]);

  const snapshot = useLiveQuery(
    async (): Promise<VisualFeedSnapshot> => {
      if (postIds.length === 0) {
        return EMPTY_SNAPSHOT;
      }

      const rawPosts = await PostDetailsModel.findByIdsPreserveOrder(postIds);
      const existingPosts = rawPosts.filter(Boolean) as PostDetailsModelSchema[];
      const enrichedPosts = await ModerationController.enrichPosts(existingPosts);
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
        ? await FileController.getMetadata({ fileAttachments: remoteAttachmentUris })
        : [];
      const remoteFilesById = new Map(remoteFiles.map((file) => [file.id, file]));

      const tiles = postIds.flatMap((postId) => {
        const post = enrichedPostsById.get(postId);
        if (!post || isPostDeleted(post.content)) {
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
          const attachmentId = buildCompositeIdFromPubkyUri({
            uri: attachmentUri,
            domain: CompositeIdDomain.FILES,
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

    void FileController.fetchFiles({ fileUris: missingFileUris }).catch((error) => {
      Logger.error('[VisualFeed] Failed to fetch missing file metadata', {
        fileUris: missingFileUris,
        error,
      });
    });
  }, [missingFileUris, missingFileUrisKey]);

  const tiles = (snapshot?.tiles ?? []).map(resolveTileProbeState);
  const pendingOverflowFallbackIds = React.useMemo(() => {
    const fallbackIds = getVisualPendingOverflowFallbackIds(tiles, hasMore ? undefined : 0);

    if (!hasMore || fallbackIds.length > 0 || tiles.length < 2) {
      return fallbackIds;
    }

    const firstPendingTileIndex = tiles.findIndex((tile) => tile.preferredSize === undefined);
    if (firstPendingTileIndex === -1 || firstPendingTileIndex > 1) {
      return fallbackIds;
    }

    return [
      ...fallbackIds,
      ...tiles
        .slice(firstPendingTileIndex, 2)
        .filter((tile) => tile.preferredSize === undefined)
        .map((tile) => tile.id),
    ];
  }, [tiles, hasMore]);
  const pendingOverflowFallbackIdSet = React.useMemo(
    () => new Set(pendingOverflowFallbackIds),
    [pendingOverflowFallbackIds],
  );

  React.useEffect(() => {
    if (!hasMore) return;
    pendingOverflowFallbackIds.forEach((tileId) => {
      setVisualTilePreferredSizeFallback(tileId, 'medium');
    });
  }, [pendingOverflowFallbackIds, hasMore]);

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
    const pendingTiles = stabilizedTiles.filter((tile) => tile.probeState === 'pending');

    pendingTiles.forEach((tile) => {
      void ensureVisualTileProbe(tile).finally(() => {
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
    hasPendingFiles: missingFileUris.length > 0,
  };
}
