'use client';

import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import {
  VISUAL_GRID_MAX_WIDTH_PX,
  VISUAL_TILE_ASPECT_RATIOS,
  VISUAL_TILE_COLUMN_SPANS,
} from './TimelineFeedVisual.helpers';
import type { VisualTileSize } from './TimelineFeedVisual.types';

const VISUAL_INITIAL_SKELETON_ROW_COUNT = 3;
const VISUAL_SKELETON_ROW_PATTERNS = [
  ['square', 'wide'],
  ['medium', 'medium'],
  ['square', 'square', 'square'],
] satisfies VisualTileSize[][];

function VisualTimelineSkeletonTile({ size }: { size: VisualTileSize }) {
  return (
    <Container
      overrideDefaults
      className="min-w-0"
      style={{
        gridColumn: `span ${VISUAL_TILE_COLUMN_SPANS[size]} / span ${VISUAL_TILE_COLUMN_SPANS[size]}`,
      }}
    >
      <Skeleton
        data-testid="visual-feed-skeleton-tile"
        className="h-full w-full rounded-md border border-white/10 bg-white/8"
        style={{ aspectRatio: VISUAL_TILE_ASPECT_RATIOS[size] }}
      />
    </Container>
  );
}

export function VisualTimelinePostsSkeleton() {
  return (
    <Container data-cy="visual-feed-skeleton-container" data-testid="visual-feed-skeleton">
      <Container
        overrideDefaults
        className="mx-auto flex w-full flex-col gap-6"
        style={{ maxWidth: `${VISUAL_GRID_MAX_WIDTH_PX}px` }}
      >
        {Array.from({ length: VISUAL_INITIAL_SKELETON_ROW_COUNT }).map((_, rowIndex) => {
          const pattern = VISUAL_SKELETON_ROW_PATTERNS[rowIndex % VISUAL_SKELETON_ROW_PATTERNS.length];

          return (
            <Container
              key={`visual-feed-skeleton-row-${rowIndex}`}
              overrideDefaults
              className="grid grid-cols-12 gap-6"
              data-testid="visual-feed-skeleton-row"
            >
              {pattern.map((size, tileIndex) => (
                <VisualTimelineSkeletonTile key={`${size}-${tileIndex}`} size={size} />
              ))}
            </Container>
          );
        })}
      </Container>
    </Container>
  );
}
