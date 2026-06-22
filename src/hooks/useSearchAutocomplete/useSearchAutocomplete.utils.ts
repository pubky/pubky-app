import { TAG_MAX_LENGTH } from '@/config/posts';
import {
  COMPACT_USER_ID_PREFIX,
  DELIMITED_USER_ID_PREFIXES,
  MIN_USER_ID_SEARCH_LENGTH,
} from './useSearchAutocomplete.constants';

interface SearchAutocompletePlan {
  tagPrefix: string | null;
  userNamePrefix: string | null;
  userIdPrefix: string | null;
}

const USER_ID_PREFIX_PATTERN = /^[a-z0-9]+$/i;

function getValidUserIdPrefix(candidate: string): string | null {
  if (candidate.length < MIN_USER_ID_SEARCH_LENGTH || !USER_ID_PREFIX_PATTERN.test(candidate)) {
    return null;
  }

  return candidate;
}

/**
 * Resolves the independent Nexus autocomplete queries for a search term.
 *
 * Delimited legacy prefixes are unambiguous ID searches. The compact `pubky`
 * prefix is ambiguous with normal tag and username text, so those endpoints
 * keep the raw query while only the ID endpoint receives the stripped suffix.
 */
export function resolveSearchAutocompletePlan(searchQuery: string): SearchAutocompletePlan {
  if (!searchQuery) {
    return { tagPrefix: null, userNamePrefix: null, userIdPrefix: null };
  }

  const normalizedSearchQuery = searchQuery.toLowerCase();
  const delimitedPrefix = DELIMITED_USER_ID_PREFIXES.find((prefix) => normalizedSearchQuery.startsWith(prefix));
  if (delimitedPrefix) {
    return {
      tagPrefix: null,
      userNamePrefix: null,
      userIdPrefix: getValidUserIdPrefix(searchQuery.slice(delimitedPrefix.length)),
    };
  }

  const userIdCandidate = normalizedSearchQuery.startsWith(COMPACT_USER_ID_PREFIX)
    ? searchQuery.slice(COMPACT_USER_ID_PREFIX.length)
    : searchQuery;
  const isProgressiveCompactPrefix = COMPACT_USER_ID_PREFIX.startsWith(normalizedSearchQuery);

  return {
    tagPrefix: searchQuery.length <= TAG_MAX_LENGTH ? searchQuery : null,
    userNamePrefix: searchQuery,
    userIdPrefix: isProgressiveCompactPrefix ? null : getValidUserIdPrefix(userIdCandidate),
  };
}
