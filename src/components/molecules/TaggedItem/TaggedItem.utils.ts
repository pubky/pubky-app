import { FileController } from '@/controllers/file/file';
import { isAppError, requiresLogin } from '@/libs/error/error.utils';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { TagWithAvatars } from './TaggedItem.types';

/**
 * Toast for a failed tag write from `usePostTags` / `useTagged`. A write the homeserver rejected
 * as unauthenticated (`UNAUTHORIZED` or `SESSION_EXPIRED`) cannot succeed by retrying: the session
 * has to be re-established first, so point at sign-in instead of the generic copy (issue #2890;
 * mirrors `usePost`'s `showCommitErrorToast` from #2555). Nothing here signs the user out or
 * retries the write.
 *
 * `viewClosed` says the owning view unmounted or switched entity before the write settled. A
 * failure then stays silent: the user left that view. The one exception is a session the
 * homeserver ended, i.e. the auth store reached `reauth-required` before the write settled: on a
 * guarded route that 401 is what closed the view (the route guard redirects to the landing page),
 * and the toaster is global, so the session-expired prompt still shows there and explains the
 * redirect (issue #2957). The same `SESSION_EXPIRED` reaches a closed view after the user's own
 * logout too, which never sets `reauth-required`, and stays silent.
 */
export function showTagWriteErrorToast(
  error: unknown,
  fallbackDescription: string,
  { viewClosed = false }: { viewClosed?: boolean } = {},
): void {
  const sessionExpired = isAppError(error) && requiresLogin(error);
  const endedByHomeserver = sessionExpired && useAuthStore.getState().restoreStatus === 'reauth-required';
  if (viewClosed && !endedByHomeserver) return;
  toast({
    variant: 'error',
    description: sessionExpired ? 'Session expired. Please sign in.' : fallbackDescription,
  });
}

/**
 * Transform NexusTag to TagWithAvatars by resolving avatar URLs
 */
export function transformTagWithAvatars(tag: NexusTag): TagWithAvatars {
  return {
    label: tag.label ?? '',
    taggers_count: tag.taggers_count ?? 0,
    relationship: tag.relationship ?? false,
    taggers: (tag.taggers ?? []).map((taggerId) => ({
      id: taggerId,
      avatarUrl: FileController.getAvatarUrl(taggerId as Pubky),
    })),
  };
}

/**
 * Transform an array of NexusTags to TagWithAvatars, adding viewer relationship.
 * Filters out invalid tags (missing label) and resolves avatar URLs.
 *
 * Uses the existing `relationship` field from Nexus if available,
 * otherwise falls back to checking if viewerId is in the taggers array.
 * This is important because the taggers array may be truncated (e.g., only first 5 taggers)
 * but the relationship field from Nexus is always accurate.
 *
 * @param tags - Array of NexusTags to transform
 * @param viewerId - Optional viewer ID to determine relationship status
 * @returns Array of TagWithAvatars with relationship and avatar data
 */
export function transformTagsForViewer(tags: NexusTag[], viewerId?: string | null): TagWithAvatars[] {
  return tags
    .filter((tag) => tag.label)
    .map((tag) => {
      // Use existing relationship from Nexus if available, otherwise check taggers array
      const hasRelationship = tag.relationship ?? (viewerId ? (tag.taggers?.includes(viewerId) ?? false) : false);

      const tagWithRelationship = {
        ...tag,
        relationship: hasRelationship,
      };
      return transformTagWithAvatars(tagWithRelationship);
    });
}
