import {
  AT_PATTERN_END,
  COMPLETE_PUBKY_LENGTH,
  LEGACY_PK_PREFIX,
  MIN_USER_ID_SEARCH_LENGTH,
  MIN_USERNAME_SEARCH_LENGTH,
  PUBKY_PATTERN_END,
  PUBKY_PREFIX,
} from './useMentionAutocomplete.constants';

export interface ExtractedMentionQuery {
  /** The last valid @username query (without @ prefix), or null if none */
  atQuery: string | null;
  /** The last valid pubky ID query (without prefix), or null if none */
  pkQuery: string | null;
}

/**
 * Extract the last mention query from content
 *
 * Finds @username or pubky ID pattern at the end of content and returns
 * the query if it should trigger a search.
 *
 * Filtering rules (matching pubky-app):
 * - @username: requires at least MIN_USERNAME_SEARCH_LENGTH (2) chars after @
 * - pubky/pk: ID: requires at least MIN_USER_ID_SEARCH_LENGTH (3) chars after prefix
 * - pubky/pk: ID: skips complete pubkeys (52+ alphanumeric chars)
 *
 * Supports both new format (pubky) and legacy format (pk:) for backwards compatibility
 */
export function extractMentionQuery(content: string): ExtractedMentionQuery {
  let atQuery: string | null = null;
  let pkQuery: string | null = null;

  // Check for @username at end of content
  const atMatch = content.match(AT_PATTERN_END);
  if (atMatch) {
    const username = atMatch[0].slice(1); // Remove @ prefix
    if (username.length >= MIN_USERNAME_SEARCH_LENGTH) {
      atQuery = username;
    }
  }

  // Check for pubky ID at end of content (supports both pk: and pubky patterns)
  const pubkyMatch = content.match(PUBKY_PATTERN_END);
  if (pubkyMatch) {
    const matchedText = pubkyMatch[0];
    // Determine which prefix was matched and extract the ID
    let userId: string;
    if (matchedText.startsWith(LEGACY_PK_PREFIX)) {
      userId = matchedText.slice(LEGACY_PK_PREFIX.length);
    } else {
      userId = matchedText.slice(PUBKY_PREFIX.length);
    }
    const isCompletePubkey = userId.length >= COMPLETE_PUBKY_LENGTH && /^[a-z0-9]+$/.test(userId);
    if (!isCompletePubkey && userId.length >= MIN_USER_ID_SEARCH_LENGTH) {
      pkQuery = userId;
    }
  }

  return { atQuery, pkQuery };
}

/**
 * Replace mention pattern in content with user ID
 *
 * Finds the @username or pubky ID pattern at the end of content
 * and replaces it with pubky{userId} (new format, no colon).
 */
export function getContentWithMention(content: string, userId: string): string {
  // Check if there's a pubky ID pattern at the end of the text (pk: or pubky)
  if (PUBKY_PATTERN_END.test(content)) {
    return content.replace(PUBKY_PATTERN_END, `${PUBKY_PREFIX}${userId} `);
  }
  // Check if there's an @ pattern at the end of the text
  if (AT_PATTERN_END.test(content)) {
    return content.replace(AT_PATTERN_END, `${PUBKY_PREFIX}${userId} `);
  }
  // Fallback: just append (with space before if content is not empty)
  const space = content.length > 0 ? ' ' : '';
  return content + `${space}${PUBKY_PREFIX}${userId} `;
}
