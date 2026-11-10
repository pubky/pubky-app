import { NexusResourceService } from '@/services/nexus/resource/resource';
import type { TResourceCounts } from '@/services/nexus/resource/resource.types';

/**
 * External resources (links of any scheme) as Nexus indexes them: what it counts on a link. The
 * link's tags are `TagApplication`'s, its replies `PostStreamApplication`'s (they are posts).
 */
export class ResourceApplication {
  private constructor() {}

  /** The link's counts (replies, embeds, collections) and Nexus id; `null` for a link Nexus does not know. */
  static fetchCounts({ uri }: { uri: string }): Promise<TResourceCounts | null> {
    return NexusResourceService.fetchCounts({ uri });
  }

  /** Every later change of the counts `fetchCounts` reads; returns the unsubscribe. */
  static subscribeCounts(uri: string, listener: (counts: TResourceCounts | null) => void): () => void {
    return NexusResourceService.subscribeCounts(uri, listener);
  }

  /** The counts already read for the link, without a request; `undefined` when none was read. */
  static getCachedCounts(uri: string): TResourceCounts | null | undefined {
    return NexusResourceService.getCachedCounts(uri);
  }
}
