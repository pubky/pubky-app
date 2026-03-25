import type { VisualRowCell, VisualTile } from './TimelineFeedVisual.types';

export interface VisualTimelinePostsProps {
  postIds: string[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
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

export interface VisualTimelineRowProps {
  cell: VisualRowCell;
  onNavigate: (postId: string) => void;
}
