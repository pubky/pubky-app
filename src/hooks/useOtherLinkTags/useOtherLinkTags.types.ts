import type { NexusTag } from '@/services/nexus/nexus.types';

/** Another link of the same thing: what is read from Nexus, and the service it is on. */
export interface TOtherLink {
  /** The link exactly as written: Nexus matches the raw URI. */
  uri: string;
  /** The service name (`Netflix`), else the link's host. */
  name: string;
}

/** The tags Nexus has on one other link. */
export interface TOtherLinkTags {
  link: TOtherLink;
  tags: NexusTag[];
}

/** One link a merged tag was put on, with how many people put it there and who Nexus listed. */
export interface TMergedTagSource extends TOtherLink {
  count: number;
  /** The taggers Nexus listed for the tag on this link (it may list fewer than `count`). */
  taggers: string[];
}

/** A tag across the other links: one chip per label, each tagger counted once. */
export interface TMergedTag {
  label: string;
  /** Every tagger Nexus listed on any of the links, once each. */
  taggers: string[];
  /**
   * People who put the tag on any of the links, each once. Nexus may list fewer taggers than it
   * counts; then at least the most any one link has (`isComplete` false).
   */
  count: number;
  /** Nexus listed every tagger on every link: `count` is exact, not a lower bound. */
  isComplete: boolean;
  /**
   * The viewer holds the tag on one of the links (Nexus' `relationship`): what the chip shows. Writes
   * never follow it; they go by the link's own tag.
   */
  relationship?: boolean;
  /** The links it is on, most taggers first. */
  sources: TMergedTagSource[];
}

export interface UseOtherLinkTagsOptions {
  /**
   * Read the links only in a `by_ids` batch (a card in a feed, `TagController.fetchResourceTags`): on
   * a Nexus without it they are not read, so a card sends no request per link.
   */
  byIdsOnly?: boolean;
}

export interface UseOtherLinkTagsResult {
  /** The tags of every link read so far that has some, in the links' order; `[]` until one answers with tags. */
  reads: TOtherLinkTags[];
  isLoading: boolean;
}
