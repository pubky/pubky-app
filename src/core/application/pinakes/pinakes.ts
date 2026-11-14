import { withNormalizedCredits } from '@/pipes/pinakes/pinakes.credits';
import { getRecheckDelay, isUnsettledCard } from '@/pipes/pinakes/pinakes.recheck';
import { getGroupPage, hasSameSummary, type TEventInstance, toEventInstance } from '@/pipes/resource/resource.events';
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
 * How new a card read must be to stand for "read now" (milliseconds): the read an ask just made
 * itself. Asking Pinakes again right after it would say the same.
 */
const JUST_READ_MS = 1_000;

/**
 * External resource cards from Pinakes. Network only: a card enriches a link the way its Open
 * Graph preview does, so nothing is written to IndexedDB. Every card leaves here with its
 * `credits` validated (`withNormalizedCredits`).
 */
export class PinakesApplication {
  private constructor() {}

  /** One link's card, or `null` when Pinakes has none (or is not configured). */
  static async fetchCardByUri(
    uri: string,
    options?: { fresh?: boolean; maxAge?: number },
  ): Promise<TPinakesResourceDetail | null> {
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
   * Pinakes does not know, or without Pinakes. `fresh` asks Pinakes again whatever its cache holds
   * (a list started over); `keepUntil` keeps the page until its window ends (epoch milliseconds).
   *
   * @throws AppError when Pinakes fails or refuses the page (an expired cursor is a 400)
   */
  static async fetchOccurrences(
    id: string,
    {
      from,
      limit,
      cursor,
      fresh,
      keepUntil,
    }: { from: string; limit: number; cursor?: string | null; fresh?: boolean; keepUntil?: number },
  ): Promise<{ cards: TPinakesCard[]; cursor: string | null }> {
    const page = await PinakesService.fetchOccurrences(
      id,
      { from, limit, cursor: cursor ?? undefined },
      { fresh, ...(keepUntil !== undefined ? { keepUntil } : {}) },
    );
    return { cards: (page?.items ?? []).map(withNormalizedCredits), cursor: page?.cursor ?? null };
  }

  /**
   * The rows of an event search as a list of events shows them (`toEventInstance`), one per row in
   * the rows' order. Each event that is no calendar occurrence is read by its own link for its
   * details (time zone, venue, status), from the cache when a card of it was read before; a read
   * that fails leaves the row as the search gave it. An occurrence is never read: a read by its
   * link answers its calendar, not the instance.
   *
   * A feed's date in a group (`group.size` 2 or more: a date page joined with it; a search that keeps
   * one row per group keeps the feed's) stands for its page: the group's member that is no feed's date
   * (`getGroupPage`), read and shown as a page row is, in the row's place. The group is the shared
   * group read (`fetchGroup`, one per group, cached for every row and card of it); without a page, or
   * when it cannot be read, the feed's date stays.
   *
   * The row is what the search says now; the cache may hold the event's read from before it
   * changed. Details that say another name, time or place than the row (`hasSameSummary`) are read
   * again, once, unless they were read this very moment (`JUST_READ_MS`: the read was no cache
   * hit, and asking again would say the same), so the row never shows the venue, zone or status
   * of the event as it was. What the row itself says (name, times, point) is always the row's.
   */
  static async fetchEventInstances(cards: readonly TPinakesCard[]): Promise<TEventInstance[]> {
    return Promise.all(
      cards.map(async (row) => {
        const card = row.occurrence ? await this.getDatePage(row) : row;
        if (card.occurrence) return toEventInstance(card, null);
        // The error is reported by its factory; the row stays
        const read = (options?: { maxAge: number }) => this.fetchCardByUri(card.uri, options).catch(() => null);
        const details = await read();
        const isEarlier = details?.id === card.id && !hasSameSummary(card, details);
        return toEventInstance(card, isEarlier ? await read({ maxAge: JUST_READ_MS }) : details);
      }),
    );
  }

  /** A feed's date's page, from its group (`fetchEventInstances`), else the date itself. */
  private static async getDatePage(card: TPinakesCard): Promise<TPinakesCard> {
    if (!card.group || card.group.size < 2) return card;
    // The error is reported by its factory; the feed's date stays
    const group = await this.fetchGroup(card.group.id).catch(() => null);
    return getGroupPage(group?.members) ?? card;
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
