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
  return firstReposterProfile?.name || Libs.formatPublicKey({ key: firstReposterId });
}
