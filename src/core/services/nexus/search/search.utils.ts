import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import type { NexusSearchReach, TSearchReachParams } from '@/services/nexus/search/search.types';

/**
 * Pairs a scoped search reach with the viewer whose network it scopes. A reach without a
 * viewer is rejected rather than silently widened to All.
 */
export function toSearchReachParams(
  reach: NexusSearchReach | undefined,
  viewerId: Pubky | undefined,
  operation: string,
): TSearchReachParams {
  if (!reach) return {};
  if (!viewerId) {
    throw Err.auth(AuthErrorCode.UNAUTHORIZED, 'Sign in to search within your network', {
      service: ErrorService.Nexus,
      operation,
    });
  }
  return { reach, user_id: viewerId };
}
