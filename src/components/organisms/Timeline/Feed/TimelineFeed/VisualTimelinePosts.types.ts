import type { ReactNode } from 'react';
import type { VisualRowCell, VisualTile } from './TimelineFeedVisual.types';

export interface VisualTimelinePostsProps {
  postIds: string[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  /** Empty state shown alongside the trailing CTA when the feed has no posts (finite collection-like feeds). */
  emptyState?: ReactNode;
  /** CTA rendered as a mosaic cell after the last tile (last row's spacer, or its own row when the row is full). */
  trailingSlot?: ReactNode;
  /** Notice rendered above the mosaic when posts are hidden because they carry no visual media. */
  hiddenItemsNotice?: ReactNode;
  showEndMessage?: boolean;
  /**
   * Render deleted / not-found posts as inert placeholder cards instead of
   * dropping them — enabled on single-collection feeds for Grid/List parity.
   */
  showUnavailablePosts?: boolean;
}

export interface VisualTileVideoProps {
  tile: VisualTile;
}

export interface VisualTileImageProps {
  tile: VisualTile;
}

export interface VisualTimelineTileOverlayProps {
  tile: VisualTile;
  size: NonNullable<VisualTile['rowSize']>;
  onReplyClick: () => void;
  onRepostClick: () => void;
}

export interface VisualTimelineTileProps {
  tile: VisualTile;
  size: NonNullable<VisualTile['rowSize']>;
  onNavigate: (postId: string) => void;
}

export interface VisualTimelinePlaceholderTileProps {
  tile: VisualTile;
  size: NonNullable<VisualTile['rowSize']>;
  onNavigate: (postId: string) => void;
}

export interface VisualTimelineRowProps {
  cell: VisualRowCell;
  onNavigate: (postId: string) => void;
  trailingSlot?: ReactNode;
}
