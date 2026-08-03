export type VisualTileSize = 'square' | 'medium' | 'wide';
export type VisualMediaKind = 'image' | 'video';
export type VisualTileProbeState = 'ready' | 'pending' | 'failed';
export type VisualPlaceholderKind = 'deleted' | 'missing';

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
