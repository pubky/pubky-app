import type { ReactNode } from 'react';

export interface SocialGraphAdvancedPanelProps {
  declutter: boolean;
  onToggleDeclutter: () => void;
  communitiesOn: boolean;
  onToggleCommunities: () => void;
  /** Edge-details lens: labels, count chips, arrowheads, edge popovers */
  edgeChipsOn: boolean;
  onToggleEdgeChips: () => void;
  /** Fetch shared tag-hub nodes with neighborhoods */
  tagHubsOn: boolean;
  onToggleTagHubs: () => void;
  physicsPaused: boolean;
  onTogglePhysics: () => void;
  onReleasePins: () => void;
  onFit: () => void;
  /** Embedded legend (kept out of the default view per the design notes) */
  legend?: ReactNode;
  className?: string;
}
