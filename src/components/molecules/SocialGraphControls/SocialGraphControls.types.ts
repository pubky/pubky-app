import type { ReactNode } from 'react';

export interface SocialGraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  timeMachineOn: boolean;
  /** Disabled when the graph has no timestamps to scrub over */
  timeMachineAvailable: boolean;
  onToggleTimeMachine: () => void;
  /** Center back on the signed-in user (hidden when signed out) */
  onRecenterSelf?: () => void;
  /** Advanced popover body (legend + hidden lenses); omitting hides the pill */
  advancedContent?: ReactNode;
  /** Canvas card expanded to the viewport */
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  className?: string;
}
