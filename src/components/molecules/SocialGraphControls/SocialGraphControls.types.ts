export interface SocialGraphControlsProps {
  declutter: boolean;
  onToggleDeclutter: () => void;
  physicsPaused: boolean;
  onTogglePhysics: () => void;
  onReleasePins: () => void;
  communitiesOn: boolean;
  onToggleCommunities: () => void;
  timeMachineOn: boolean;
  /** Disabled when the graph has no timestamps to scrub over */
  timeMachineAvailable: boolean;
  onToggleTimeMachine: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onRecenter: () => void;
  className?: string;
}
