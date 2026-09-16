import { SUGGESTED_USER_CARD_MAX_TAGS } from '@/config/tags';
import { canonicalizeTagLabel } from '@/libs/utils/utils';
import { buildStarterPackStreamId } from '@/models/stream/user/userStream.helper';
import { type UserStreamId, UserStreamTypes } from '@/models/stream/user/userStream.types';

/**
 * Resolve the suggestions stream for the chosen interests.
 *
 * With tags → the tag-aware starter pack stream (order preserved, Nexus interleaves per tag).
 * Without tags → most active users this month (`influencers:this_month:all`).
 * The persisted selection is sanitized by the tags step, so an invalid seed is unexpected;
 * if it still fails validation we fall back to the no-tags stream rather than crash the step.
 */
export function resolveSuggestionsStreamId(interestTags: string[]): UserStreamId {
  if (interestTags.length === 0) {
    return UserStreamTypes.THIS_MONTH_INFLUENCERS_ALL;
  }
  try {
    return buildStarterPackStreamId(interestTags);
  } catch {
    // Err.validation already logged the offending labels.
    return UserStreamTypes.THIS_MONTH_INFLUENCERS_ALL;
  }
}

/**
 * Profile tags that intersect the chosen interests, in the user's tag order, capped per design.
 * Returns an empty list when nothing matches (the card then renders no chips).
 */
export function selectMatchingTags(
  userTags: string[] | undefined,
  interestTags: string[],
  max: number = SUGGESTED_USER_CARD_MAX_TAGS,
): string[] {
  if (!userTags || userTags.length === 0 || interestTags.length === 0) return [];

  const interests = new Set(interestTags.map(canonicalizeTagLabel));
  const matching: string[] = [];
  for (const tag of userTags) {
    const canonical = canonicalizeTagLabel(tag);
    if (!interests.has(canonical) || matching.includes(canonical)) continue;
    matching.push(canonical);
    if (matching.length >= max) break;
  }
  return matching;
}
