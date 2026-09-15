import type { Pubky } from '@/models/models.types';
import type { TTagHotParams } from '@/services/nexus/tag/tag.types';

/**
 * Hot tags query plus the signed-in viewer.
 *
 * `user_id` is the Nexus hot-tags filter (only valid together with `reach`), while `viewerId`
 * is used solely to fetch tagger profiles with viewer-relative relationship data.
 */
export type THotGetOrFetchParams = TTagHotParams & {
  viewerId?: Pubky | null;
};
