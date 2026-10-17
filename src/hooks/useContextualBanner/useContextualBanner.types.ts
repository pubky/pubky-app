import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';

/** The shared content a guest is looking at, resolved from the pathname. */
export type ContextualBannerTarget =
  | { kind: 'post'; compositeId: string; authorId: string }
  | { kind: 'collection'; compositeId: string }
  | { kind: 'profile'; pubky: string };

export type ContextualBannerCopy = {
  headline: string;
  body: string;
};

export type ContextualBannerCopyInput = {
  target: ContextualBannerTarget['kind'];
  /** The post or collection row, or `null` when it is not in the local database. */
  post: Pick<EnrichedPostDetails, 'kind' | 'content' | 'lock' | 'deleted' | 'is_blurred'> | null;
  /** The post author or the profile owner, or `null` when not in the local database. */
  user: Pick<NexusUserDetails, 'name' | 'deleted'> | null;
};

/** A local read result tagged with the id it was read for, so a stale result is never shown for a new target. */
export type ContextualBannerSnapshot<T> = {
  key: string | null;
  data: T | null;
};

export type UseContextualBannerResult = {
  /** Whether the banner should be on screen now. */
  visible: boolean;
  copy: ContextualBannerCopy;
};
