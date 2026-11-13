import { withNormalizedCredits } from '@/pipes/pinakes/pinakes.credits';
import { getRecheckDelay, isUnsettledCard } from '@/pipes/pinakes/pinakes.recheck';
import { type TEventInstance, toEventInstance } from '@/pipes/resource/resource.events';
import { buildResourceSearchParams, type TResourceQuery } from '@/pipes/resource/resource.search';
import { PinakesService } from '@/services/pinakes/pinakes';
import type {
  TPinakesCard,
  TPinakesEpisodePage,
  TPinakesGroupDetail,
  TPinakesResourceDetail,
  TPinakesSearchResponse,
} from '@/services/pinakes/pinakes.types';

/**
 * External resource cards from Pinakes. Network only: a card enriches a link the way its Open
 * Graph preview does, so nothing is written to IndexedDB. Every card leaves here with its
 * `credits` validated (`withNormalizedCredits`).
 */
export class PinakesApplication {
  private constructor() {}

  /** One link's card, or `null` when Pinakes has none (or is not configured). */
  static async fetchCardByUri(uri: string, options?: { fresh?: boolean }): Promise<TPinakesResourceDetail | null> {
    const card = await PinakesService.fetchCardByUri(uri, options);
    return card ? withNormalizedCredits(card) : null;
  }

  /**
   * Has Pinakes read a link now (a link being written into a post) and returns its card once read:
   * a `pending` answer is read again by its ID on the recheck schedule (`getRecheckDelay`, about
   * two minutes in all). A read card goes into the link's card cache, so the published post shows
   * it at once. `null` when Pinakes refused or failed; a card still `pending` when it ran out.
   */
  static async resolveCard(uri: string): Promise<TPinakesResourceDetail | null> {
    let card = await PinakesService.resolveCard(uri);
    for (let count = 0; card?.id && isUnsettledCard(card); count++) {
      const delay = getRecheckDelay(count);
      if (delay === null) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      const pending: TPinakesResourceDetail = card;
      card = (await PinakesService.fetchCardById(pending.id).catch(() => null)) ?? pending;
    }
    if (!card) return null;
    const normalized = withNormalizedCredits(card);
    if (!isUnsettledCard(normalized)) PinakesService.seedCardByUri(uri, normalized);
    return normalized;
  }

  /**
   * One page of a resource search, its rows with their credits validated; `null` when Pinakes is not
   * configured or does not serve search.
   */
  static async searchResources(
    query: TResourceQuery,
    { fresh, ...options }: { limit: number; cursor?: string | null; facets?: boolean; fresh?: boolean },
  ): Promise<TPinakesSearchResponse | null> {
    const page = await PinakesService.search(buildResourceSearchParams(query, options), { fresh });
    return page ? { ...page, items: page.items.map(withNormalizedCredits) } : null;
  }

  /** The facets of a search's first page already read with `facets`, without a request; `undefined` when none was read. */
  static getCachedSearchFacets(query: TResourceQuery, limit: number): TPinakesSearchResponse['facets'] | undefined {
    return PinakesService.getCachedSearch(buildResourceSearchParams(query, { limit, facets: true }))?.facets;
  }

  /**
   * One page of a calendar's dates from `from` on (RFC 3339), by start: one card per instance and
   * the next page's cursor (`null` at the end). No dates for a resource that is no calendar, one
   * Pinakes does not know, or without Pinakes.
   *
   * @throws AppError when Pinakes fails or refuses the page (an expired cursor is a 400)
   */
  static async fetchOccurrences(
    id: string,
    { from, limit, cursor }: { from: string; limit: number; cursor?: string | null },
  ): Promise<{ cards: TPinakesCard[]; cursor: string | null }> {
    const page = await PinakesService.fetchOccurrences(id, { from, limit, cursor: cursor ?? undefined });
    return { cards: (page?.items ?? []).map(withNormalizedCredits), cursor: page?.cursor ?? null };
  }

  /**
   * The rows of an event search as a list of events shows them (`toEventInstance`), one per row in
   * the rows' order. Each event that is no calendar occurrence is read by its own link for its
   * details (time zone, venue, status), from the cache when a card of it was read before; a read
   * that fails leaves the row as the search gave it. An occurrence is never read: a read by its
   * link answers its calendar, not the instance.
   */
  static async fetchEventInstances(cards: readonly TPinakesCard[]): Promise<TEventInstance[]> {
    return Promise.all(
      cards.map(async (card) => {
        if (card.occurrence) return toEventInstance(card, null);
        // The error is reported by its factory; the row stays
        const details = await this.fetchCardByUri(card.uri).catch(() => null);
        return toEventInstance(card, details);
      }),
    );
  }

  /** What the people who tagged the resource also referenced. */
  static async fetchRelated(id: string, limit: number): Promise<TPinakesCard[]> {
    const cards = await PinakesService.fetchRelated(id, limit);
    return cards.map(withNormalizedCredits);
  }

  /** A group's member cards, or `null` when the group is gone (or Pinakes is not configured). */
  static async fetchGroup(id: string): Promise<TPinakesGroupDetail | null> {
    const group = await PinakesService.fetchGroup(id);
    return group ? { ...group, members: group.members.map(withNormalizedCredits) } : null;
  }

  /**
   * A group already read (the resource page's), as `fetchGroup` gives it, without asking Pinakes:
   * `undefined` when it was not read, `null` when it is gone.
   */
  static getCachedGroup(id: string): TPinakesGroupDetail | null | undefined {
    const group = PinakesService.getCachedGroup(id);
    return group ? { ...group, members: group.members.map(withNormalizedCredits) } : group;
  }

  /** One page of a show's episodes; an empty last page when Pinakes does not know the show (or is not configured). */
  static async fetchEpisodes(
    id: string,
    options: { limit: number; offset?: number | null; q?: string | null },
  ): Promise<TPinakesEpisodePage> {
    const page = await PinakesService.fetchEpisodes(id, options);
    return { items: page?.items ?? [], next_offset: page?.next_offset ?? null, truncated: page?.truncated === true };
  }
}
