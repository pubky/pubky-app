'use client';

import { Crosshair, History, Maximize2, Pause, Pin, Play, Sparkles, Users, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { GLASS_PANEL_CLASS } from '@/config/theme';
import { cn } from '@/libs/utils/utils';
import type { SocialGraphControlsProps } from './SocialGraphControls.types';

/**
 * SocialGraphControls
 *
 * Floating control stack: camera (zoom/fit/recenter), then the view modes
 * (declutter, communities, time machine, physics, pins) and the share shot.
 */
export function SocialGraphControls({
  declutter,
  onToggleDeclutter,
  physicsPaused,
  onTogglePhysics,
  onReleasePins,
  communitiesOn,
  onToggleCommunities,
  timeMachineOn,
  timeMachineAvailable,
  onToggleTimeMachine,
  onZoomIn,
  onZoomOut,
  onFit,
  onRecenter,
  className,
}: SocialGraphControlsProps) {
  const t = useTranslations('graph');

  const camera = [
    { icon: ZoomIn, label: t('controls.zoomIn'), onClick: onZoomIn, dataCy: 'graph-zoom-in' },
    { icon: ZoomOut, label: t('controls.zoomOut'), onClick: onZoomOut, dataCy: 'graph-zoom-out' },
    { icon: Maximize2, label: t('controls.fit'), onClick: onFit, dataCy: 'graph-fit' },
    { icon: Crosshair, label: t('controls.recenter'), onClick: onRecenter, dataCy: 'graph-recenter' },
  ];

  const modes = [
    {
      icon: Sparkles,
      label: t('controls.declutter'),
      onClick: onToggleDeclutter,
      active: declutter,
      dataCy: 'graph-declutter',
    },
    {
      icon: Users,
      label: t('controls.communities'),
      onClick: onToggleCommunities,
      active: communitiesOn,
      dataCy: 'graph-communities',
    },
    {
      icon: History,
      label: t('controls.timeMachine'),
      onClick: onToggleTimeMachine,
      active: timeMachineOn,
      disabled: !timeMachineAvailable,
      dataCy: 'graph-time-toggle',
    },
    {
      icon: physicsPaused ? Play : Pause,
      label: physicsPaused ? t('controls.resumePhysics') : t('controls.pausePhysics'),
      onClick: onTogglePhysics,
      active: physicsPaused,
      dataCy: 'graph-physics',
    },
    { icon: Pin, label: t('controls.releasePins'), onClick: onReleasePins, dataCy: 'graph-release-pins' },
  ];

  return (
    <div className={cn(GLASS_PANEL_CLASS, 'flex flex-col gap-1 p-1.5', className)} data-cy="graph-controls">
      {camera.map(({ icon: Icon, label, onClick, dataCy }) => (
        <Button
          key={dataCy}
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onClick}
          aria-label={label}
          title={label}
          data-cy={dataCy}
        >
          <Icon className="size-4" />
        </Button>
      ))}
      <div className="mx-1.5 border-t border-white/10" />
      {modes.map(({ icon: Icon, label, onClick, active, disabled, dataCy }) => (
        <Button
          key={dataCy}
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9', active && 'bg-brand/15 text-brand')}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active ?? false}
          title={label}
          data-cy={dataCy}
        >
          <Icon className="size-4" />
        </Button>
      ))}
    </div>
  );
}
