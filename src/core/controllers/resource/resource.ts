import { PinakesApplication } from '@/application/pinakes/pinakes';
import { ResourceApplication, type TResourceStreamPage } from '@/application/resource/resource';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import { getNearbyPlacesQuery, pickNearbyPlaces, RESOURCE_NEARBY_LIMIT } from '@/pipes/resource/resource.places';
import {
  getRelatedResourceTags,
  getResourceSearchRowUri,
  isNexusRepresentable,
  type TResourceQuery,
} from '@/pipes/resource/resource.search';
import type { TResourceCounts } from '@/services/nexus/resource/resource.types';
import type {
  TPinakesCard,
  TPinakesCategoryFacet,
  TPinakesHostFacet,
  TPinakesPoint,
  TPinakesTypeFacet,
} from '@/services/pinakes/pinakes.types';
import { useAuthStore } from '@/stores/auth/auth.store';

/** Where the next page of a resource search starts: a Pinakes cursor, or an offset in Nexus' stream. */
export type TResourceSearchCursor = { source: 'pinakes'; cursor: string } | { source: 'nexus'; skip: number };

/** One page of a resource search. */
export type TResourceSearchPage = {
  /**
   * `pinakes`, or `nexus` when Pinakes failed and the resource stream answered the same query;
   * `unavailable` when Pinakes is not configured and the stream cannot answer the query.
   */
  source: 'pinakes' | 'nexus' | 'unavailable';
  /** The rows' links, in order (the first web link people wrote for each, else its own). */
  uris: string[];
  next: TResourceSearchCursor | null;
  /** Pinakes' type facet as it came (each type, its path and links), on a page asked with `facets`. */
  typeFacets?: TPinakesTypeFacet[];
  /** Tags the rows also carry, to narrow by, on a page asked with `facets`. */
  relatedTags?: string[];
  /** The services (hosts) and categories of the whole result, on a page asked with `facets` and the query's `extraFacets`. */
  hostFacets?: TPinakesHostFacet[];
  categoryFacets?: TPinakesCategoryFacet[];
  /** Pinakes searched part of a large network only (Following or Friends). */
  reachTruncated?: boolean;
  /**
   * The rows' own cards, on a Pinakes page asked `withCards`: every row of the page, in order. A
   * calendar's occurrences are rows that share one id and one link, so `uris` cannot tell them
   * apart; a list of events or a map of places reads the rows here.
   */
  cards?: TPinakesCard[];
};

/** A place Pinakes knows, with its point: what a search's Where can be around. */
export type TResourcePlace = { id: string; name: string; point: TPinakesPoint };

/**
 * External resources on Nexus: the counts on a link and the posts replying to it, for the resource
 * page and the cards' action rows. Network only: no IndexedDB table holds links; the replies are
 * posts and are stored as posts.
 */
export class ResourceController {
  private constructor() {}

  /** The link's counts and Nexus id, `null` when Nexus does not know the link. */
  static fetchCounts({ uri }: { uri: string }): Promise<TResourceCounts | null> {
    return ResourceApplication.fetchCounts({ uri });
  }

  /** Every later change of the link's counts (another card's read, a refetch); returns the unsubscribe. */
  static subscribeCounts(uri: string, listener: (counts: TResourceCounts | null) => void): () => void {
    return ResourceApplication.subscribeCounts(uri, listener);
  }

  /** The counts already read for the link, without a request; `undefined` when none was read. */
  static getCachedCounts(uri: string): TResourceCounts | null | undefined {
    return ResourceApplication.getCachedCounts(uri);
  }

  /**
   * A page of the posts replying to the resource, newest first, stored locally for the viewer
   * signed in now; `null` for a page that comes back after the viewer changed.
   */
  static fetchReplies({
    resourceId,
    skip,
    limit,
  }: {
    resourceId: string;
    skip: number;
    limit: number;
  }): Promise<{ replyIds: string[]; fetched: number; reachedEnd: boolean } | null> {
    const viewerId = useAuthStore.getState().currentUserPubky;
    const isCurrent = captureViewerSession();
    return PostStreamApplication.fetchResourceReplies({ resourceId, viewerId, skip, limit, isCurrent });
  }

  /**
   * A page of the external resources people tagged, the latest tagged first; with `tags`, those
   * tagged with any of them. Network only, for the viewer signed in now.
   */
  static fetchStream({
    tags,
    skip,
    limit,
  }: {
    tags: readonly string[];
    skip: number;
    limit: number;
  }): Promise<TResourceStreamPage> {
    const viewerId = useAuthStore.getState().currentUserPubky;
    return ResourceApplication.fetchStream({ tags, viewerId, skip, limit });
  }

  /**
   * A page of a resource search: Pinakes ranks and filters (and counts the types and tags with
   * `facets`), each row's card reads its own tags from Nexus. When Pinakes fails on the first page,
   * or is not configured, Nexus' resource stream answers the query if it can carry it (any of some
   * tags, Recent, everyone: `isNexusRepresentable`); otherwise the failure stands, never an
   * unfiltered list.
   *
   * @throws AppError when Pinakes fails and the stream cannot stand in, or the stream fails
   */
  static async fetchSearchPage({
    query,
    cursor = null,
    limit,
    facets = false,
    fresh = false,
    withCards = false,
  }: {
    query: TResourceQuery;
    cursor?: TResourceSearchCursor | null;
    limit: number;
    facets?: boolean;
    /** Also give the rows' own cards (`cards`): for a list of events, a map of places. */
    withCards?: boolean;
    /** Ask Pinakes again whatever its cache holds (a search started over). */
    fresh?: boolean;
  }): Promise<TResourceSearchPage> {
    if (cursor?.source === 'nexus') return this.fetchStreamPage(query, cursor.skip, limit);
    let page: Awaited<ReturnType<typeof PinakesApplication.searchResources>>;
    try {
      page = await PinakesApplication.searchResources(query, { limit, cursor: cursor?.cursor, facets, fresh });
    } catch (error) {
      // The error is reported by its factory; a later page keeps its own source
      if (cursor || !isNexusRepresentable(query)) throw error;
      return this.fetchStreamPage(query, 0, limit);
    }
    if (!page) {
      // A later page Pinakes no longer serves ends the list; the stream never takes over midway
      if (cursor) return { source: 'pinakes', uris: [], next: null };
      return isNexusRepresentable(query)
        ? this.fetchStreamPage(query, 0, limit)
        : { source: 'unavailable', uris: [], next: null };
    }
    const searched = query.input.kind === 'tags' ? query.input.tags : [];
    return {
      source: 'pinakes',
      uris: page.items.map(getResourceSearchRowUri),
      next: page.cursor ? { source: 'pinakes', cursor: page.cursor } : null,
      reachTruncated: page.reach_truncated,
      ...(withCards ? { cards: page.items } : {}),
      ...(facets
        ? {
            typeFacets: page.facets?.type ?? [],
            relatedTags: getRelatedResourceTags(page.facets?.tags ?? [], searched),
            ...(query.extraFacets?.includes('host') ? { hostFacets: page.facets?.host ?? [] } : {}),
            ...(query.extraFacets?.includes('category') ? { categoryFacets: page.facets?.category ?? [] } : {}),
          }
        : {}),
    };
  }

  /**
   * The services a search's first page with `facets` already counted (`hostFacets` of
   * `fetchSearchPage`), without a request; `undefined` when Pinakes has not answered that page.
   */
  static getCachedHostFacets(query: TResourceQuery, limit: number): TPinakesHostFacet[] | undefined {
    return PinakesApplication.getCachedSearchFacets(query, limit)?.host ?? undefined;
  }

  private static async fetchStreamPage(
    query: TResourceQuery,
    skip: number,
    limit: number,
  ): Promise<TResourceSearchPage> {
    const tags = query.input.kind === 'tags' ? query.input.tags : [];
    const page = await this.fetchStream({ tags, skip, limit });
    return {
      source: 'nexus',
      uris: page.uris,
      next: page.reachedEnd ? null : { source: 'nexus', skip: skip + page.uris.length },
    };
  }

  /**
   * The places around a place, nearest first, as links to show as cards (each the first web link
   * people wrote for it, as a search row's): at most `RESOURCE_NEARBY_SHOWN`, never the place
   * itself (`pickNearbyPlaces`). One more row is asked than is shown, since the place itself is the
   * nearest. `[]` when Pinakes is not configured.
   *
   * @param params.point - The place's point
   * @param params.self - The place's own card: its id, and its group (the same place elsewhere)
   * @throws AppError when Pinakes fails
   */
  static async fetchNearbyPlaces({
    point,
    self,
  }: {
    point: TPinakesPoint;
    self: Pick<TPinakesCard, 'id'> & Partial<Pick<TPinakesCard, 'group'>>;
  }): Promise<string[]> {
    const page = await PinakesApplication.searchResources(getNearbyPlacesQuery(point), {
      limit: RESOURCE_NEARBY_LIMIT,
    });
    return pickNearbyPlaces(page?.items ?? [], self).map(getResourceSearchRowUri);
  }

  /**
   * The places Pinakes knows by this name, best match first, each with its point on the map (one
   * without a point is left out): what the search's Where offers for a place typed by name.
   * `[]` when Pinakes is not configured.
   *
   * @throws AppError when Pinakes fails
   */
  static async fetchPlaces(name: string, limit: number): Promise<TResourcePlace[]> {
    const page = await PinakesApplication.searchResources(
      {
        input: { kind: 'text', text: name },
        types: ['Place'],
        sort: 'relevance',
        reach: 'all',
        viewer: null,
        collapse: true,
      },
      { limit },
    );
    return (page?.items ?? []).flatMap((card) =>
      card.point ? [{ id: card.id, name: card.name || card.uri, point: card.point }] : [],
    );
  }
}
