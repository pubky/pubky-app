/**
 * Mention Autocomplete Constants
 *
 * Constants for mention autocomplete functionality including debounce timing,
 * result limits, and pattern matching rules.
 */

/** Debounce delay in milliseconds for mention search */
export const MENTION_DEBOUNCE_MS = 250;

/** Maximum number of user suggestions to return */
export const MENTION_USER_LIMIT = 10;

/** Minimum character length for @ username searches */
export const MIN_USERNAME_SEARCH_LENGTH = 2;

/** Minimum character length for pubky ID searches */
export const MIN_USER_ID_SEARCH_LENGTH = 3;

/** Length of a complete pubky identifier (52 chars) */
export const COMPLETE_PUBKY_LENGTH = 52;

/**
 * Regex pattern for an @username typed up to the caret
 * Matched against the text before the caret, so `$` is the caret, not the end of the value
 */
export const AT_MENTION_PATTERN = /@[^\s]*$/;

/**
 * Regex pattern for a pubky ID typed up to the caret
 * Supports both new format (pubky) and legacy format (pk:) for backwards compatibility
 * Uses negative lookahead (?!:) to ensure pubky is not followed by a colon
 * Matched against the text before the caret, so `$` is the caret, not the end of the value
 */
export const PUBKY_MENTION_PATTERN = /(?:pk:|pubky(?!:))[^\s]*$/;

/** Legacy prefix for backwards compatibility detection */
export const LEGACY_PK_PREFIX = 'pk:';

/** New prefix for pubky ID mentions (no colon) */
export const PUBKY_PREFIX = 'pubky';
