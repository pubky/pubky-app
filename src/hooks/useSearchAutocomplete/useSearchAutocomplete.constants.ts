/**
 * Search Autocomplete Constants
 *
 * Constants for search autocomplete functionality including debounce timing,
 * result limits, and user ID prefix handling.
 */

/** Debounce delay in milliseconds for autocomplete search */
export const AUTOCOMPLETE_DEBOUNCE_MS = 500;

/** Maximum number of tag suggestions to return */
export const AUTOCOMPLETE_TAG_LIMIT = 10;

/** Maximum number of user suggestions to return */
export const AUTOCOMPLETE_USER_LIMIT = 10;

/** Minimum character length for user ID searches after "pubky" prefix */
export const MIN_USER_ID_SEARCH_LENGTH = 3;

/** New compact user ID prefix. It is also valid text in tags and usernames. */
export const COMPACT_USER_ID_PREFIX = 'pubky';

/** Legacy, unambiguous user ID prefixes that remain ID-only searches. */
export const DELIMITED_USER_ID_PREFIXES = ['pubky:', 'pk:'] as const;
