import type { Pubky } from '@/models/models.types';
import type { NexusTag, NexusTagWire } from '@/services/nexus/nexus.types';

export type TResourceByUriParams = {
  /** The link exactly as written: Nexus matches the raw URI. */
  uri: string;
  /** Marks the viewer's own tags (`tag_uri`); omitted for a signed-out viewer. */
  viewer_id?: Pubky;
  limit_tags?: number;
};

/** `ResourceDetails` in the Nexus openapi: an external resource someone tagged. */
export type NexusResourceDetails = {
  /** 32-character lowercase hex resource id. */
  id: string;
  uri: string;
  scheme: string;
  indexed_at: number;
};

/** `ResourceTagsResponse` in the Nexus openapi (`GET /v1/resource/by-uri`). */
export type NexusResourceTags = {
  resource: NexusResourceDetails;
  tags: NexusTag[];
};

/** The same answer as Nexus serves it: `/v1` tags carry no `relationship` (`TagNormalizer.fromNexus`). */
export type NexusResourceTagsWire = Omit<NexusResourceTags, 'tags'> & { tags: NexusTagWire[] };
