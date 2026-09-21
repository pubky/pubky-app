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
 *
 * Display names can hold spaces, so the query runs over the words typed after `@`
 * instead of stopping at the first space (#1638): `@John Carvalho` searches for the
 * whole name. It starts on a letter or digit (a bare `@ ` is not a mention) and
 * stops at a newline, at sentence punctuation, or at anything else a name cannot
 * hold, so the pattern never reaches back over the text around it. A trailing space
 * stays part of the match: the caret is still inside the mention, and writing over
 * the whole range keeps the space from doubling.
 *
 * Matched against the text before the caret, so `$` is the caret, not the end of the value
 */
export const AT_MENTION_PATTERN = /@(?:[\p{L}\p{M}\p{N}._'’-]+(?:[ ][\p{L}\p{M}\p{N}._'’-]*)*)?$/u;

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
