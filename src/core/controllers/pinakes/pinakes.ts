import { PinakesApplication } from '@/application/pinakes/pinakes';
import type { TPinakesCard, TPinakesGroupDetail, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/**
 * Entry point for external resource cards (Pinakes). Every method is network only (`fetch*`);
 * the service caches and deduplicates reads, and answers "nothing" without a request when
 * `PUBKY_RUNTIME_PINAKES_URL` is unset.
 */
export class PinakesController {
  private constructor() {}

  /**
   * One link's card by its URI.
   *
   * @param params.uri - The link as written in the post
   * @param params.fresh - Ask Pinakes again whatever the cache holds (a re-read of an unsettled card)
   * @returns The card, or `null` when Pinakes does not know the link (a 404 is not an error)
   * @throws AppError when Pinakes fails
   */
  static fetchCardByUri({ uri, fresh }: { uri: string; fresh?: boolean }): Promise<TPinakesResourceDetail | null> {
    return PinakesApplication.fetchCardByUri(uri, { fresh });
  }

  /**
   * Has Pinakes read a link now (`POST /v1/resolve`), for a link it does not know yet: the card
   * once read (also cached for the link's card reads), or `null` when Pinakes refused or failed.
   *
   * @param params.uri - The link as written in the post
   */
  static resolveCard({ uri }: { uri: string }): Promise<TPinakesResourceDetail | null> {
    return PinakesApplication.resolveCard(uri);
  }

  /**
   * "People who tagged this also tagged": related cards for a resource.
   *
   * @param params.id - Pinakes resource ID (`card.id`)
   * @param params.limit - Results to ask for
   * @returns The related cards, `[]` when there are none
   * @throws AppError when Pinakes fails
   */
  static fetchRelated({ id, limit }: { id: string; limit: number }): Promise<TPinakesCard[]> {
    return PinakesApplication.fetchRelated(id, limit);
  }

  /**
   * The cards of a group: one thing on several services.
   *
   * @param params.id - Group ID (`card.group.id`)
   * @returns The group, or `null` when it no longer exists
   * @throws AppError when Pinakes fails
   */
  static fetchGroup({ id }: { id: string }): Promise<TPinakesGroupDetail | null> {
    return PinakesApplication.fetchGroup(id);
  }
}
