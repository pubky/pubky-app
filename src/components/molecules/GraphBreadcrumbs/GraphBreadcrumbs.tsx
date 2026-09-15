'use client';

import { ChevronRight } from 'lucide-react';
import { GRAPH_SURFACE_CLASS } from '@/config/theme';
import { FileController } from '@/controllers/file/file';
import type { TrailEntry } from '@/hooks/useSocialGraph/useSocialGraph.types';
import { cn } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

export interface GraphBreadcrumbsProps {
  trail: TrailEntry[];
  onHop: (entry: TrailEntry) => void;
  className?: string;
}

/**
 * GraphBreadcrumbs
 *
 * The focus history as avatar chips (me, John, Lyn, ...). Clicking a chip
 * refocuses there, so deep explorations always have a way back.
 */
export function GraphBreadcrumbs({ trail, onHop, className }: GraphBreadcrumbsProps) {
  if (trail.length < 2) return null;

  return (
    <div
      className={cn(
        GRAPH_SURFACE_CLASS,
        'flex max-w-full items-center gap-1 overflow-x-auto rounded-full px-2 py-1',
        className,
      )}
      data-cy="graph-breadcrumbs"
    >
      {trail.map((entry, i) => (
        <div key={`${entry.id}-${i}`} className="flex shrink-0 items-center gap-1">
          {i > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
          <button
            type="button"
            onClick={() => onHop(entry)}
            className={cn(
              'flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-0.5 transition-colors hover:bg-white/10',
              i === trail.length - 1 && 'bg-white/5',
            )}
            title={entry.name}
          >
            <AvatarWithFallback
              avatarUrl={entry.image ? FileController.getAvatarUrl(entry.pubky) : undefined}
              name={entry.name}
              fallbackSeed={entry.pubky}
              size="sm"
            />
            {i === trail.length - 1 && <span className="max-w-24 truncate text-xs font-medium">{entry.name}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
