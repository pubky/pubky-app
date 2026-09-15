'use client';

import { Expand, History, Shrink, SlidersHorizontal, UserRound, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { GRAPH_PILL_ACTIVE_CLASS, GRAPH_PILL_CLASS, GRAPH_SURFACE_CLASS } from '@/config/theme';
import { cn } from '@/libs/utils/utils';
import type { SocialGraphControlsProps } from './SocialGraphControls.types';

/**
 * SocialGraphControls
 *
 * The design's control pill row: zoom out, zoom in, time machine, and
 * re-center on the signed-in user, plus one extra pill opening the advanced
 * popover where the non-designed lenses live (legend, communities, declutter,
 * edge details, physics), and the fullscreen toggle at the right end.
 */
export function SocialGraphControls({
  onZoomIn,
  onZoomOut,
  timeMachineOn,
  timeMachineAvailable,
  onToggleTimeMachine,
  onRecenterSelf,
  advancedContent,
  isFullscreen,
  onToggleFullscreen,
  className,
}: SocialGraphControlsProps) {
  return (
    <div className={cn('flex items-center gap-3 lg:gap-6', className)} data-cy="graph-controls">
      <Button
        variant="ghost"
        size="icon"
        className={GRAPH_PILL_CLASS}
        onClick={onZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
        data-cy="graph-zoom-out"
      >
        <ZoomOut className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={GRAPH_PILL_CLASS}
        onClick={onZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
        data-cy="graph-zoom-in"
      >
        <ZoomIn className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(GRAPH_PILL_CLASS, timeMachineOn && GRAPH_PILL_ACTIVE_CLASS)}
        onClick={onToggleTimeMachine}
        disabled={!timeMachineAvailable}
        aria-label="Time machine"
        aria-pressed={timeMachineOn}
        title="Time machine"
        data-cy="graph-time-toggle"
      >
        <History className="size-4" />
      </Button>
      {onRecenterSelf && (
        <Button
          variant="ghost"
          size="icon"
          className={GRAPH_PILL_CLASS}
          onClick={onRecenterSelf}
          aria-label="Re-center"
          title="Re-center"
          data-cy="graph-recenter"
        >
          <UserRound className="size-4" />
        </Button>
      )}
      {advancedContent && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={GRAPH_PILL_CLASS}
              aria-label="Advanced"
              title="Advanced"
              data-cy="graph-advanced"
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className={cn(GRAPH_SURFACE_CLASS, 'w-72 overflow-hidden p-0')}
            data-cy="graph-advanced-popover"
          >
            {advancedContent}
          </PopoverContent>
        </Popover>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={cn(GRAPH_PILL_CLASS, isFullscreen && GRAPH_PILL_ACTIVE_CLASS)}
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        aria-pressed={isFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        data-cy="graph-fullscreen"
      >
        {isFullscreen ? <Shrink className="size-4" /> : <Expand className="size-4" />}
      </Button>
    </div>
  );
}
