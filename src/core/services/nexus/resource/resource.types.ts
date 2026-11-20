import type { Pubky } from '@/models/models.types';
import type { NexusTag, NexusTagWire } from '@/services/nexus/nexus.types';

export type TResourceByUriParams = {
  /** The link exactly as written: Nexus matches the raw URI. */
  uri: string;
  /** Marks the viewer's own tags (`tag_uri`); omitted for a signed-out viewer. */
  viewer_id?: Pubky;
  limit_tags?: number;
  limit_taggers?: number;
};

/** `POST /v1/stream/resources/by_ids` by link: the body, and the tag limits in the query as on `by-uri`. */
export type TResourceByIdsParams = {
  /** 1–100 links exactly as written: Nexus normalizes them as `by-uri` does. */
  uris: string[];
  /** Marks the viewer's own tags; omitted for a signed-out viewer. */
  viewer_id?: Pubky;
  limit_tags?: number;
  limit_taggers?: number;
};

/** `ResourceDetails` in the Nexus openapi: an external resource someone tagged. */
export type NexusResourceDetails = {
  /** 32-character lowercase hex resource id. */
  id: string;
  uri: string;
  scheme: string;
  indexed_at: number;
};

/**
 * `ResourceTagsResponse` in the Nexus openapi (`GET /v1/resource/by-uri`). The counts are our Nexus
 * fork's (external references): a Nexus without them leaves them out.
 */
export type NexusResourceTags = {
  resource: NexusResourceDetails;
  tags: NexusTag[];
  replies_count?: number;
  embeds_count?: number;
  collections_count?: number;
};

/**
 * `ResourceView` in the Nexus openapi: one item of `POST /v1/stream/resources/by_ids` (and
 * `/v1/stream/resources`). The same fields as a `by-uri` answer, with the details under `details`.
 */
export type NexusResourceView = {
  details: NexusResourceDetails;
  tags: NexusTag[];
  taggers_count?: number;
  replies_count?: number;
  embeds_count?: number;
  collections_count?: number;
};

/** The same view as Nexus serves it: `/v1` tags carry no `relationship` (`TagNormalizer.fromNexus`). */
export type NexusResourceViewWire = Omit<NexusResourceView, 'tags'> & { tags: NexusTagWire[] };

/**
 * What Nexus counts on an external resource: the posts replying to it (`parent`), embedding it
 * (`embed`) and the collections holding it; `undefined` when the configured Nexus does not serve it.
 */
export type TResourceCounts = {
  /** The resource's Nexus id, which its reference lists are read by. */
  resourceId: string;
  /**
   * The counts of a link and its other spellings, summed (`mergeResourceCounts`): the Nexus id of
   * each spelling Nexus knows, `resourceId` first. Absent for one link's own counts.
   */
  resourceIds?: string[];
  replies?: number;
  embeds?: number;
  collections?: number;
};

export type TResourceRepliesParams = {
  /** 32-character lowercase hex resource id (`TResourceCounts.resourceId`). */
  resourceId: string;
  /** Marks the viewer's own tags and bookmarks on the replies; omitted signed out. */
  viewerId?: Pubky | null;
  skip?: number;
  limit?: number;
};

/** The same answer as Nexus serves it: `/v1` tags carry no `relationship` (`TagNormalizer.fromNexus`). */
export type NexusResourceTagsWire = Omit<NexusResourceTags, 'tags'> & { tags: NexusTagWire[] };
