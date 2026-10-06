import type { NexusUserDetails, NexusUserLink } from '@/services/nexus/nexus.types';
import type { UserDetailsModelSchema } from './userDetails.schema';

type ProfileFields = Pick<NexusUserDetails, 'name' | 'bio' | 'image' | 'links' | 'status'>;

const blankAsNull = (value: string | null | undefined) => value || null;

function sameLinks(left: NexusUserLink[] | null | undefined, right: NexusUserLink[] | null | undefined): boolean {
  const leftLinks = left ?? [];
  const rightLinks = right ?? [];
  return (
    leftLinks.length === rightLinks.length &&
    leftLinks.every((link, index) => link.title === rightLinks[index]?.title && link.url === rightLinks[index]?.url)
  );
}

function sameProfile(left: ProfileFields, right: ProfileFields): boolean {
  return (
    left.name === right.name &&
    blankAsNull(left.bio) === blankAsNull(right.bio) &&
    blankAsNull(left.image) === blankAsNull(right.image) &&
    blankAsNull(left.status) === blankAsNull(right.status) &&
    sameLinks(left.links, right.links)
  );
}

/**
 * Why a Nexus profile must be kept out of the cached row, or null if it may replace it.
 * An older revision never replaces the row. While a local edit is pending, only a response
 * that started after the edit, carries a newer revision and publishes the same fields does:
 * equal content alone can be a cached or pre-edit copy.
 * Once `pendingEditMs` has passed the edit is no longer protected, confirmed or not.
 */
export function getUserDetailsRejectionReason({
  existing,
  incoming,
  responseStartedAt,
  now,
  pendingEditMs,
}: {
  existing: UserDetailsModelSchema | null | undefined;
  incoming: NexusUserDetails;
  responseStartedAt: number | undefined;
  now: number;
  pendingEditMs: number;
}): 'older-revision' | 'pending-local-edit' | null {
  if (!existing) return null;
  const knownRevision = existing.nexusIndexedAt;
  const isOlderRevision = knownRevision !== undefined && incoming.indexed_at < knownRevision;
  const pendingSince = existing.localUpdatedAt;
  if (pendingSince !== undefined && now - pendingSince < pendingEditMs) {
    const confirmsEdit =
      responseStartedAt !== undefined &&
      responseStartedAt > pendingSince &&
      (knownRevision === undefined || incoming.indexed_at > knownRevision) &&
      sameProfile(existing, incoming);
    // Even an older revision needs a short retry while a local edit awaits confirmation.
    if (!confirmsEdit) return 'pending-local-edit';
  }
  return isOlderRevision ? 'older-revision' : null;
}

export function canReplaceUserDetails(params: Parameters<typeof getUserDetailsRejectionReason>[0]): boolean {
  return getUserDetailsRejectionReason(params) === null;
}
