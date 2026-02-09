import * as Libs from '@/libs';
import type { GetFirstReposterNameParams } from './GroupedRepostHeader.types';

/**
 * Determines the display name for the first reposter.
 * Returns "You" label if current user, profile name if loaded, or formatted pubky as fallback.
 */
export function getFirstReposterName({
  includesCurrentUser,
  isFirstReposterLoading,
  firstReposterProfile,
  firstReposterId,
  youLabel,
}: GetFirstReposterNameParams): string {
  if (includesCurrentUser) {
    return youLabel;
  }
  if (isFirstReposterLoading) {
    return '...';
  }
  // In this header we want the *rest of the sentence* ("and N others reposted this")
  // to remain visible even with very long usernames, so we truncate the username itself.
  if (firstReposterProfile?.name) {
    return Libs.truncateString(firstReposterProfile.name, 15);
  }
  return Libs.formatPublicKey({ key: firstReposterId });
}
