export type VisualTileSize = 'square' | 'medium' | 'wide';
export type VisualMediaKind = 'image' | 'video';
export type VisualTileProbeState = 'ready' | 'pending' | 'failed';

export interface VisualTile {
  id: string;
  postId: string;
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
}

export interface VisualRow {
  key: string;
  cells: VisualRowCell[];
}
