import type { SocialGraphVisualEdge, VisualGraphNode } from '@/hooks/useSocialGraph/useSocialGraph.utils';
import type { NexusGraphUserNode } from '@/services/nexus/graph/graph.types';

export interface GraphUserHoverCardProps {
  /** The hovered user node (identity paints instantly, no reads) */
  node: NexusGraphUserNode;
  /** Controlled visibility; hover intent lives in the caller */
  open: boolean;
  /** Anchor point relative to the positioned container, fed per frame */
  x: number;
  y: number;
  /** Visible canvas nodes/edges: facepiles derive from them, never the network */
  nodes: VisualGraphNode[];
  edges: SocialGraphVisualEdge[];
  /** Signed-in viewer node id (`user:{pubky}`), null when signed out */
  meId: string | null;
  /** Launch the how-are-we-connected trace for this user */
  onTraceConnection?: (pubky: string) => void;
  /** Keeps the card alive while the pointer is over it */
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  className?: string;
}
