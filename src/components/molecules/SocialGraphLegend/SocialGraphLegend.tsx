'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import type { HideableClass } from '@/hooks/useSocialGraph/useSocialGraph.types';
import { cn } from '@/libs/utils/utils';

/** Edge-encoding rows: recent follows, intra-community links, bridges. */
export type EdgeLegendKind = 'fresh' | 'intra' | 'bridge';

export interface SocialGraphLegendProps {
  classCounts: Map<HideableClass, number>;
  hiddenClasses: Set<HideableClass>;
  /** Hover intent on a row: spotlight that class on the canvas */
  onHoverClass: (cls: HideableClass | null) => void;
  /** Click on a row: hide/show that class */
  onToggleClass: (cls: HideableClass) => void;
  /** Show the follow-recency gradient row (the graph has timestamped follows) */
  showRecency?: boolean;
  /** Show the community tint/bridge rows (communities mode is on) */
  communitiesOn?: boolean;
  /** Hover intent on an edge row: spotlight matching edges on the canvas */
  onHoverEdges?: (kind: EdgeLegendKind | null) => void;
  className?: string;
}

const RELATIONSHIP_ROWS: { key: HideableClass; label: string; swatch: string }[] = [
  { key: 'self', label: 'You', swatch: 'bg-brand rounded-full' },
  { key: 'friend', label: 'Friend', swatch: 'bg-(--chart-2) rounded-full' },
  { key: 'following', label: 'Following', swatch: 'bg-(--chart-3) rounded-full' },
  { key: 'follower', label: 'Follower', swatch: 'bg-(--chart-1) rounded-full' },
  { key: 'extended', label: 'Extended', swatch: 'bg-muted-foreground rounded-full' },
  { key: 'post', label: 'Post', swatch: 'rounded-[3px] border border-muted-foreground bg-white/10' },
  { key: 'tag', label: 'Tag', swatch: 'w-4 rounded-full border border-brand bg-brand/20' },
];

/**
 * SocialGraphLegend
 *
 * The legend IS the filter: every row shows a live count, hovering a row
 * spotlights that class on the canvas, clicking hides it. One surface for
 * reading the graph and shaping it.
 */
export function SocialGraphLegend({
  classCounts,
  hiddenClasses,
  onHoverClass,
  onToggleClass,
  showRecency = false,
  communitiesOn = false,
  onHoverEdges,
  className,
}: SocialGraphLegendProps) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className={cn('flex w-full flex-col gap-1', className)}
      data-cy="graph-legend"
      onMouseLeave={() => {
        onHoverClass(null);
        onHoverEdges?.(null);
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <Typography size="sm" className="font-medium text-muted-foreground uppercase">
          {'Legend'}
        </Typography>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label="Legend"
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </Button>
      </div>
      {open && (
        <div className="flex flex-col">
          {RELATIONSHIP_ROWS.map(({ key, label, swatch }) => {
            const hidden = hiddenClasses.has(key);
            const count = classCounts.get(key) ?? 0;
            return (
              <button
                key={key}
                type="button"
                onMouseEnter={() => onHoverClass(hidden ? null : key)}
                onClick={() => onToggleClass(key)}
                aria-pressed={!hidden}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/10',
                  hidden && 'opacity-40',
                )}
                data-cy={`graph-legend-${key}`}
              >
                <span className={cn('size-2.5 shrink-0', swatch)} />
                <Typography size="sm" className={cn('flex-1 text-foreground/80', hidden && 'line-through')}>
                  {label}
                </Typography>
                <Typography size="sm" className="text-muted-foreground tabular-nums">
                  {count}
                </Typography>
              </button>
            );
          })}
          {(showRecency || communitiesOn) && (
            <>
              <div className="mx-1.5 my-1 border-t border-white/10" />
              {showRecency && (
                <div
                  onMouseEnter={() => onHoverEdges?.('fresh')}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/10"
                  title={`${'old'} → ${'new'}`}
                  data-cy="graph-legend-edge-fresh"
                >
                  <span className="h-1 w-4 shrink-0 rounded bg-gradient-to-r from-[#6c6e7a]/40 to-[#f6f0de]" />
                  <Typography size="sm" className="flex-1 truncate text-foreground/80">
                    {'Follow age'}
                  </Typography>
                  <span className="sr-only">
                    {'old'} → {'new'}
                  </span>
                </div>
              )}
              {communitiesOn && (
                <>
                  <div
                    onMouseEnter={() => onHoverEdges?.('intra')}
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/10"
                    data-cy="graph-legend-edge-intra"
                  >
                    <span className="h-0.5 w-4 shrink-0 rounded bg-[#4B48E5]" />
                    <Typography size="sm" className="flex-1 text-foreground/80">
                      {'Same community'}
                    </Typography>
                  </div>
                  <div
                    onMouseEnter={() => onHoverEdges?.('bridge')}
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/10"
                    data-cy="graph-legend-edge-bridge"
                  >
                    <span className="h-0.5 w-4 shrink-0 rounded bg-[#f5f5ff]" />
                    <Typography size="sm" className="flex-1 text-foreground/80">
                      {'Bridge'}
                    </Typography>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
