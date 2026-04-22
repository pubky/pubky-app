import { TIMELINE_FEED_VARIANT, type TimelineFeedVariant } from '@/config';
import type { ContentType } from '@/core';
import type { VisualRow, VisualTile, VisualTileSize } from './TimelineFeedVisual.types';

export const VISUAL_GRID_GAP_PX = 24;
export const VISUAL_GRID_MAX_WIDTH_PX = 1200;
export const VISUAL_PENDING_TAIL_LIMIT = 3;
export const VISUAL_SQUARE_MAX_RATIO = 1;
export const VISUAL_WIDE_ELIGIBLE_MIN_RATIO = 4 / 3;
export const VISUAL_WIDE_MIN_RATIO = 16 / 9;
const VISUAL_ROW_PREFERRED_SIZE_SCORE = 3;
const VISUAL_ROW_ALTERNATE_SIZE_SCORE = 1;
const VISUAL_ROW_COMPLEX_PATTERN_BONUS = 5;
const VISUAL_CONTENT_ALL = 'all' as ContentType;
const VISUAL_CONTENT_IMAGES = 'images' as ContentType;
const VISUAL_CONTENT_VIDEOS = 'videos' as ContentType;
const VISUAL_CONTENT_SHORT = 'short' as ContentType;
const VISUAL_CONTENT_LONG = 'long' as ContentType;
const VISUAL_CONTENT_LINKS = 'links' as ContentType;
const VISUAL_CONTENT_FILES = 'files' as ContentType;

export const VISUAL_DISABLED_CONTENT: ContentType[] = [
  VISUAL_CONTENT_SHORT,
  VISUAL_CONTENT_LONG,
  VISUAL_CONTENT_LINKS,
  VISUAL_CONTENT_FILES,
];

const VISUAL_INTERACTIVE_CONTENT_VARIANTS = new Set<TimelineFeedVariant>([
  TIMELINE_FEED_VARIANT.HOME,
  TIMELINE_FEED_VARIANT.BOOKMARKS,
  TIMELINE_FEED_VARIANT.SEARCH,
]);

export const VISUAL_TILE_COLUMN_SPANS: Record<VisualTileSize, number> = {
  square: 4,
  medium: 6,
  wide: 8,
};

export const VISUAL_TILE_ASPECT_RATIOS: Record<VisualTileSize, string> = {
  square: '1 / 1',
  medium: '588 / 384',
  wide: '792 / 384',
};

export function isVisualContentSupported(content: ContentType): boolean {
  return content === VISUAL_CONTENT_ALL || content === VISUAL_CONTENT_IMAGES || content === VISUAL_CONTENT_VIDEOS;
}

export function resolveVisualFeedContent({
  content,
  variant,
  isVisualActive,
}: {
  content: ContentType;
  variant: TimelineFeedVariant;
  isVisualActive: boolean;
}): ContentType {
  if (!isVisualActive) {
    return content;
  }

  // Only home-store-backed interactive feeds coerce unsupported content in visual mode.
  // Custom feeds are read-only and must normalize their persisted config in their own path.
  if (!VISUAL_INTERACTIVE_CONTENT_VARIANTS.has(variant)) {
    return content;
  }

  return isVisualContentSupported(content) ? content : VISUAL_CONTENT_ALL;
}

export function isVisualMediaContentType(contentType: string): boolean {
  return contentType.startsWith('image/') || contentType.startsWith('video/');
}

export function getVisualMediaKind(contentType: string): 'image' | 'video' {
  return contentType.startsWith('video/') ? 'video' : 'image';
}

export function parseMediaDimension(value?: string | number | null): number | undefined {
  if (value === null || value === undefined) return undefined;

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function hashVisualIdentity(value: string): number {
  return Array.from(value).reduce((hash, char) => {
    return (hash << 5) - hash + char.charCodeAt(0);
  }, 0);
}

export function resolveVisualTileSizeOptions(
  identity: string,
  width?: number,
  height?: number,
  preferredSizeOverride?: VisualTileSize,
): VisualTileSize[] | undefined {
  if (!width || !height) {
    return undefined;
  }

  const ratio = width / height;
  const hash = Math.abs(hashVisualIdentity(identity));
  let options: VisualTileSize[];

  if (ratio <= VISUAL_SQUARE_MAX_RATIO) {
    options = hash % 2 === 0 ? ['square', 'medium'] : ['medium', 'square'];
  } else if (ratio >= VISUAL_WIDE_MIN_RATIO) {
    options = ['wide', 'medium'];
  } else if (ratio >= VISUAL_WIDE_ELIGIBLE_MIN_RATIO) {
    options = hash % 2 === 0 ? ['wide', 'medium'] : ['medium', 'wide'];
  } else {
    options = ['medium'];
  }

  if (preferredSizeOverride && options.includes(preferredSizeOverride)) {
    return [preferredSizeOverride, ...options.filter((size) => size !== preferredSizeOverride)];
  }

  return options;
}

export function resolvePreferredVisualTileSize(
  identity: string,
  width?: number,
  height?: number,
  preferredSizeOverride?: VisualTileSize,
): VisualTileSize | undefined {
  return resolveVisualTileSizeOptions(identity, width, height, preferredSizeOverride)?.[0];
}

function getTileSizeOptions(tile: VisualTile): VisualTileSize[] {
  if (tile.sizeOptions?.length) {
    return tile.sizeOptions;
  }

  if (tile.preferredSize) {
    return [tile.preferredSize];
  }

  return [];
}

function supportsTileSize(tile: VisualTile | undefined, size: VisualTileSize): tile is VisualTile {
  return Boolean(tile && getTileSizeOptions(tile).includes(size));
}

function scoreCandidateRow(cells: Array<{ tile: VisualTile; size: VisualTileSize }>): number {
  const sizeMatchScore = cells.reduce((score, cell) => {
    if (cell.tile.preferredSize === cell.size) {
      return score + VISUAL_ROW_PREFERRED_SIZE_SCORE;
    }

    return score + VISUAL_ROW_ALTERNATE_SIZE_SCORE;
  }, 0);

  if (cells.length === 3) {
    return sizeMatchScore + VISUAL_ROW_COMPLEX_PATTERN_BONUS;
  }

  if (cells.some((cell) => cell.size === 'wide' || cell.size === 'square')) {
    return sizeMatchScore + VISUAL_ROW_COMPLEX_PATTERN_BONUS;
  }

  return sizeMatchScore;
}

export function composeVisualRows(
  tiles: VisualTile[],
  isEndOfStream: boolean,
): { rows: VisualRow[]; tail: VisualTile[] } {
  const rows: VisualRow[] = [];
  let index = 0;

  while (index < tiles.length) {
    const remaining = tiles.length - index;
    const first = tiles[index];
    const second = tiles[index + 1];
    const third = tiles[index + 2];

    if (remaining === 1) {
      if (!isEndOfStream) {
        break;
      }

      rows.push({
        key: `row:${first.id}:spacer`,
        cells: [
          { key: `cell:${first.id}`, size: 'medium', tile: { ...first, rowSize: 'medium' } },
          { key: `spacer:${first.id}`, size: 'medium', isSpacer: true },
        ],
      });
      index += 1;
      continue;
    }

    const canSquareTriple =
      supportsTileSize(first, 'square') && supportsTileSize(second, 'square') && supportsTileSize(third, 'square');
    const canSquareWide = supportsTileSize(first, 'square') && supportsTileSize(second, 'wide');
    const canWideSquare = supportsTileSize(first, 'wide') && supportsTileSize(second, 'square');
    const canMediumPair = supportsTileSize(first, 'medium') && supportsTileSize(second, 'medium');
    const canBufferedTwoSquareTail = supportsTileSize(first, 'square') && supportsTileSize(second, 'square');

    if (remaining === 2 && !isEndOfStream && canBufferedTwoSquareTail && !canSquareWide && !canWideSquare) {
      break;
    }

    const candidates: Array<{ score: number; consume: number; row: VisualRow }> = [];

    if (canSquareTriple && third) {
      candidates.push({
        score: scoreCandidateRow([
          { tile: first, size: 'square' },
          { tile: second, size: 'square' },
          { tile: third, size: 'square' },
        ]),
        consume: 3,
        row: {
          key: `row:${first.id}:${second.id}:${third.id}`,
          cells: [
            { key: `cell:${first.id}`, size: 'square', tile: { ...first, rowSize: 'square' } },
            { key: `cell:${second.id}`, size: 'square', tile: { ...second, rowSize: 'square' } },
            { key: `cell:${third.id}`, size: 'square', tile: { ...third, rowSize: 'square' } },
          ],
        },
      });
    }

    if (canSquareWide && second) {
      candidates.push({
        score: scoreCandidateRow([
          { tile: first, size: 'square' },
          { tile: second, size: 'wide' },
        ]),
        consume: 2,
        row: {
          key: `row:${first.id}:${second.id}`,
          cells: [
            { key: `cell:${first.id}`, size: 'square', tile: { ...first, rowSize: 'square' } },
            { key: `cell:${second.id}`, size: 'wide', tile: { ...second, rowSize: 'wide' } },
          ],
        },
      });
    }

    if (canWideSquare && second) {
      candidates.push({
        score: scoreCandidateRow([
          { tile: first, size: 'wide' },
          { tile: second, size: 'square' },
        ]),
        consume: 2,
        row: {
          key: `row:${first.id}:${second.id}`,
          cells: [
            { key: `cell:${first.id}`, size: 'wide', tile: { ...first, rowSize: 'wide' } },
            { key: `cell:${second.id}`, size: 'square', tile: { ...second, rowSize: 'square' } },
          ],
        },
      });
    }

    if (canMediumPair && second) {
      candidates.push({
        score: scoreCandidateRow([
          { tile: first, size: 'medium' },
          { tile: second, size: 'medium' },
        ]),
        consume: 2,
        row: {
          key: `row:${first.id}:${second.id}`,
          cells: [
            { key: `cell:${first.id}`, size: 'medium', tile: { ...first, rowSize: 'medium' } },
            { key: `cell:${second.id}`, size: 'medium', tile: { ...second, rowSize: 'medium' } },
          ],
        },
      });
    }

    const selectedCandidate = candidates.sort((left, right) => right.score - left.score)[0];

    if (!selectedCandidate) {
      if (remaining >= 2 && isEndOfStream && second) {
        rows.push({
          key: `row:${first.id}:${second.id}`,
          cells: [
            { key: `cell:${first.id}`, size: 'medium', tile: { ...first, rowSize: 'medium' } },
            { key: `cell:${second.id}`, size: 'medium', tile: { ...second, rowSize: 'medium' } },
          ],
        });
        index += 2;
        continue;
      }

      break;
    }

    rows.push(selectedCandidate.row);
    index += selectedCandidate.consume;
  }

  return {
    rows,
    tail: tiles.slice(index),
  };
}

export function getVisualPendingOverflowFallbackIds(
  tiles: Pick<VisualTile, 'id' | 'preferredSize'>[],
  pendingTailLimit = VISUAL_PENDING_TAIL_LIMIT,
): string[] {
  const workingTiles = tiles.map((tile) => ({
    id: tile.id,
    preferredSize: tile.preferredSize,
  }));
  const fallbackIds: string[] = [];

  let firstPendingTileIndex = workingTiles.findIndex((tile) => tile.preferredSize === undefined);

  while (firstPendingTileIndex !== -1 && workingTiles.length - firstPendingTileIndex > pendingTailLimit) {
    fallbackIds.push(workingTiles[firstPendingTileIndex].id);
    workingTiles[firstPendingTileIndex] = {
      ...workingTiles[firstPendingTileIndex],
      preferredSize: 'medium',
    };
    firstPendingTileIndex = workingTiles.findIndex((tile) => tile.preferredSize === undefined);
  }

  return fallbackIds;
}
