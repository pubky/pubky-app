'use client';

import { Expand, Shrink } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { dialogCornerButtonClassName } from '@/atoms/Dialog/Dialog';
import { useFullscreen } from '@/hooks/useFullscreen/useFullscreen';
import { cn } from '@/libs/utils/utils';

interface DialogFullscreenToggleProps {
  /** False hides the toggle and leaves the fullscreen it entered. */
  enabled: boolean;
}

/** Browser fullscreen toggle in a dialog's top-right corner, left of the close button. */
export function DialogFullscreenToggle({ enabled }: DialogFullscreenToggleProps) {
  const { isFullscreen, isSupported, toggle } = useFullscreen({ enabled });

  if (!enabled || !isSupported) return null;

  const Icon = isFullscreen ? Shrink : Expand;
  return (
    <Button
      overrideDefaults
      type="button"
      data-cy="dialog-fullscreen-toggle"
      onClick={() => void toggle()}
      // No `aria-pressed`: the label changes with the state, and a toggle button must keep one name.
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      // `right-16`: the close button's `right-4` plus its 32px width and a gap.
      className={cn('absolute top-4 right-16', dialogCornerButtonClassName)}
    >
      <Icon className="size-4 text-secondary-foreground opacity-70" />
    </Button>
  );
}
