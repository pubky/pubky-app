import type { VideoUrlMatch } from '@/libs/utils/videoUrl';

export type VisualTileSize = 'square' | 'medium' | 'wide';
export type VisualMediaKind = 'image' | 'video';
export type VisualTileProbeState = 'ready' | 'pending' | 'failed';
export type VisualPlaceholderKind = 'deleted' | 'missing';

/** What a link-only video tile needs beyond its media sources: the player and the host to name on the fallback card. */
export interface VisualLinkVideo {
  provider: VideoUrlMatch['provider'];
  /** Host of the link, shown on the fallback card; empty when it cannot be read. */
  hostLabel: string;
}

export interface VisualTile {
  id: string;
  postId: string;
  /**
   * Set for deleted / not-found collection items, which render as placeholder
   * cards instead of media (mirroring PostDeleted/PostMissing in Grid/List so
   * item counts stay consistent across layouts). Placeholder tiles carry empty
   * media fields and are never probed — they mount with a resolved size.
   */
  placeholderKind?: VisualPlaceholderKind;
  /**
   * Set when the tile stands for the post's playable video link because the post
   * carries no image or video attachment. It has a fixed 16:9 frame and is never
   * probed. The renderer draws a fallback card (play icon, host) under the media:
   * the YouTube thumbnail (`previewSrc` hq720, `mainSrc` mqdefault), the video
   * file itself (both are the link; played once the server's preview reports a
   * video), or nothing for Vimeo (both empty).
   */
  linkVideo?: VisualLinkVideo;
  attachmentId: string;
  attachmentName: string;
  contentType: string;
  mediaKind: VisualMediaKind;
  previewSrc: string;
  mainSrc: string;
  metadataWidth?: number;
  metadataHeight?: number;
  sizeOptions?: VisualTileSize[];
  preferredSize?: VisualTileSize;
  rowSize?: VisualTileSize;
  probeState: VisualTileProbeState;
  isBlurred: boolean;
  content: string;
  indexedAt: number;
}

export interface VisualRowCell {
  key: string;
  size: VisualTileSize;
  tile?: VisualTile;
  isSpacer?: boolean;
  /** Cell reserved for the feed's trailing CTA (e.g. a collection owner's Add Content tile). */
  isTrailingSlot?: boolean;
}

export interface VisualRow {
  key: string;
  cells: VisualRowCell[];
}
