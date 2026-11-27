import { getRecheckDelay, isUnsettledCard } from '@/pipes/pinakes/pinakes.recheck';
import { PinakesService } from '@/services/pinakes/pinakes';
import type { TPinakesCard, TPinakesGroupDetail, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/**
 * External resource cards from Pinakes. Network only: a card enriches a link the way its Open
 * Graph preview does, so nothing is written to IndexedDB.
 */
export class PinakesApplication {
  private constructor() {}

  /** One link's card, or `null` when Pinakes has none (or is not configured). */
  static fetchCardByUri(uri: string, options?: { fresh?: boolean }): Promise<TPinakesResourceDetail | null> {
    return PinakesService.fetchCardByUri(uri, options);
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
    if (card && !isUnsettledCard(card)) PinakesService.seedCardByUri(uri, card);
    return card;
  }

  /** What the people who tagged the resource also referenced. */
  static fetchRelated(id: string, limit: number): Promise<TPinakesCard[]> {
    return PinakesService.fetchRelated(id, limit);
  }

  /** A group's member cards, or `null` when the group is gone (or Pinakes is not configured). */
  static fetchGroup(id: string): Promise<TPinakesGroupDetail | null> {
    return PinakesService.fetchGroup(id);
  }
}
