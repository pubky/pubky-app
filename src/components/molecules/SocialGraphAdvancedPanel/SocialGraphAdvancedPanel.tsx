'use client';

import { Maximize2, Pin } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Switch } from '@/atoms/Switch/Switch';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { SocialGraphAdvancedPanelProps } from './SocialGraphAdvancedPanel.types';

/**
 * SocialGraphAdvancedPanel
 *
 * Body of the advanced popover: the lenses the design deliberately keeps out
 * of the default view (legend, communities, declutter, edge details) plus the
 * physics conveniences. Everything here defaults off so the canvas matches
 * the design until explicitly asked otherwise.
 */
export function SocialGraphAdvancedPanel({
  declutter,
  onToggleDeclutter,
  communitiesOn,
  onToggleCommunities,
  edgeChipsOn,
  onToggleEdgeChips,
  tagHubsOn,
  onToggleTagHubs,
  physicsPaused,
  onTogglePhysics,
  onReleasePins,
  onFit,
  legend,
  className,
}: SocialGraphAdvancedPanelProps) {
  const toggles = [
    { label: 'Declutter', checked: declutter, onChange: onToggleDeclutter, dataCy: 'graph-declutter' },
    {
      label: 'Communities',
      checked: communitiesOn,
      onChange: onToggleCommunities,
      dataCy: 'graph-communities',
    },
    {
      label: 'Edge details',
      checked: edgeChipsOn,
      onChange: onToggleEdgeChips,
      dataCy: 'graph-edge-details',
    },
    {
      label: 'Tag hubs',
      checked: tagHubsOn,
      onChange: onToggleTagHubs,
      dataCy: 'graph-tag-hubs',
    },
    {
      label: 'Pause physics',
      checked: physicsPaused,
      onChange: onTogglePhysics,
      dataCy: 'graph-physics',
    },
  ];

  return (
    <div className={cn('flex flex-col gap-1 p-3', className)} data-cy="graph-advanced-panel">
      {toggles.map(({ label, checked, onChange, dataCy }) => (
        <label key={dataCy} className="flex cursor-pointer items-center justify-between gap-4 py-1.5">
          <Typography size="sm" className="text-foreground/90">
            {label}
          </Typography>
          <Switch checked={checked} onCheckedChange={onChange} data-cy={dataCy} />
        </label>
      ))}
      <div className="my-1.5 border-t border-secondary" />
      {/* Stacked full-width rows: side-by-side nowrap labels overflow the popover */}
      <div className="flex min-w-0 flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start gap-2"
          onClick={onFit}
          data-cy="graph-fit"
        >
          <Maximize2 className="size-4 shrink-0" />
          <span className="truncate">{'Fit view'}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start gap-2"
          onClick={onReleasePins}
          data-cy="graph-release-pins"
        >
          <Pin className="size-4 shrink-0" />
          <span className="truncate">{'Release pinned nodes'}</span>
        </Button>
      </div>
      {legend && (
        <>
          <div className="my-1.5 border-t border-secondary" />
          {legend}
        </>
      )}
    </div>
  );
}
