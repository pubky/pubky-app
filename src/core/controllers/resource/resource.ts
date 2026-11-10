import { ResourceApplication } from '@/application/resource/resource';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import type { TResourceCounts } from '@/services/nexus/resource/resource.types';
import { useAuthStore } from '@/stores/auth/auth.store';

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
}
