import type { GraphRelationship } from '@/hooks/useSocialGraph/useSocialGraph.utils';
import type { Pubky } from '@/models/models.types';
import type { NexusGraphNode } from '@/services/nexus/graph/graph.types';

export type SocialProofUser = {
  pubky: Pubky;
  name: string;
  image: string | null;
};

export interface SocialGraphNodePanelProps {
  node: NexusGraphNode;
  relationship: GraphRelationship;
  /** Whether the node's neighborhood is already merged into the view */
  isExpanded: boolean;
  isExpanding: boolean;
  /** People the viewer follows who follow this user (from edges already on canvas) */
  proofUsers: SocialProofUser[];
  /** Spotlight the proof connections on the canvas while hovering the strip */
  onProofHover: (hovering: boolean) => void;
  onExpand: (nodeId: string) => void;
  /** Re-fetch a node's neighborhood (used after replying from the panel) */
  onRefreshNode: (nodeId: string) => void;
  /** Re-derive relationship colors around a user node (user nodes only) */
  onFocus: (nodeId: string) => void;
  /** Trace the shortest follow path from the viewer to this user */
  onTracePath: (pubky: Pubky) => void;
  isTracing: boolean;
  onClose: () => void;
  className?: string;
}
