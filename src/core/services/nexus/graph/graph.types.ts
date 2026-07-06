import type { Pubky } from '@/models/models.types';

/**
 * Graph Neighborhood API types
 *
 * Mirrors the Nexus `GET /v0/graph/{kind}/{id}` response: a typed node-link
 * graph around a center entity. Node ids are kind-prefixed and globally
 * unique: `user:{pubky}`, `post:{author}:{post_id}`, `tag:{label}`.
 */

export type GraphNodeKind = 'user' | 'post' | 'tag';

export type NexusGraphUserNode = {
  kind: 'user';
  id: string;
  pubky: Pubky;
  name: string;
  image: string | null;
};

export type NexusGraphPostNode = {
  kind: 'post';
  id: string;
  author_id: Pubky;
  post_id: string;
  content: string;
  post_kind: string;
  indexed_at: number;
};

export type NexusGraphTagNode = {
  kind: 'tag';
  id: string;
  label: string;
  count: number;
};

export type NexusGraphNode = NexusGraphUserNode | NexusGraphPostNode | NexusGraphTagNode;

export type NexusGraphEdgeType = 'FOLLOWS' | 'AUTHORED' | 'TAGGED' | 'REPLIED' | 'REPOSTED' | 'MENTIONED';

export type NexusGraphEdge = {
  source: string;
  target: string;
  type: NexusGraphEdgeType;
  /** Present only on TAGGED edges */
  label?: string;
  /** When the relationship was indexed; drives the client time filters */
  indexed_at?: number;
};

export type NexusGraph = {
  nodes: NexusGraphNode[];
  edges: NexusGraphEdge[];
};

export type TGraphNeighborhoodParams = {
  kind: GraphNodeKind;
  /** pubky | `{author}:{post_id}` | tag label */
  id: string;
  /** FOLLOWS hops around a user center, 1..2 (user kind only) */
  depth?: 1 | 2;
  /** Per-class neighbor cap, 1..50 */
  limit?: number;
  /** CSV filter of node kinds to include, e.g. 'user' or 'user,post,tag' */
  kinds?: string;
};

export const GRAPH_PATH_PARAMS = ['kind', 'id'] as const;

export type TGraphPathParams = {
  /** Starting user pubky */
  from: string;
  /** Destination user pubky */
  to: string;
};
