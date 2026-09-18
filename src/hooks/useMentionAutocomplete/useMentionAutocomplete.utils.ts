import {
  AT_MENTION_PATTERN,
  COMPLETE_PUBKY_LENGTH,
  LEGACY_PK_PREFIX,
  MIN_USER_ID_SEARCH_LENGTH,
  MIN_USERNAME_SEARCH_LENGTH,
  PUBKY_MENTION_PATTERN,
  PUBKY_PREFIX,
} from './useMentionAutocomplete.constants';

/** Range of a mention pattern inside the content */
export interface MentionRange {
  /** Index of the first character of the pattern (the `@`, `pk:` or `pubky` prefix) */
  start: number;
  /** Index just past the last character of the pattern — the caret */
  end: number;
}

export interface ExtractedMentionQuery {
  /** The last valid @username query (without @ prefix), or null if none */
  atQuery: string | null;
  /** The last valid pubky ID query (without prefix), or null if none */
  pkQuery: string | null;
  /** The pattern a selection writes over, or null when the caret is not in one */
  range: MentionRange | null;
}

/** Result of writing a mention into the content */
export interface MentionInsertion {
  /** Content with the mention written in place of the pattern */
  content: string;
  /** Caret position to restore, just after the inserted mention */
  caret: number;
}

/** Keep a caret that is out of step with the content (a stale render, a programmatic set) usable */
function clampCaret(content: string, caret: number): number {
  if (!Number.isFinite(caret)) return content.length;
  return Math.max(0, Math.min(caret, content.length));
}

/**
 * Extract the mention query the caret sits in
 *
 * Only the text before the caret can hold the pattern being typed, so a mention
 * completes wherever the caret is, not only at the end of the value (#1959).
 *
 * Filtering rules (matching pubky-app):
 * - @username: requires at least MIN_USERNAME_SEARCH_LENGTH (2) chars after @
 * - pubky/pk: ID: requires at least MIN_USER_ID_SEARCH_LENGTH (3) chars after prefix
 * - pubky/pk: ID: skips complete pubkeys (52+ alphanumeric chars)
 *
 * Supports both new format (pubky) and legacy format (pk:) for backwards compatibility
 *
 * @param content - Full textarea value
 * @param caret - Caret position in `content`; defaults to the end of the value
 */
export function extractMentionQuery(content: string, caret: number = content.length): ExtractedMentionQuery {
  const caretIndex = clampCaret(content, caret);
  const beforeCaret = content.slice(0, caretIndex);

  let atQuery: string | null = null;
  let pkQuery: string | null = null;

  // Check for @username in the text before the caret
  const atMatch = beforeCaret.match(AT_MENTION_PATTERN);
  if (atMatch) {
    const username = atMatch[0].slice(1); // Remove @ prefix
    if (username.length >= MIN_USERNAME_SEARCH_LENGTH) {
      atQuery = username;
    }
  }

  // Check for pubky ID before the caret (supports both pk: and pubky patterns)
  const pubkyMatch = beforeCaret.match(PUBKY_MENTION_PATTERN);
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

  // The pattern a selection writes over. A pubky ID pattern wins over an @ in the
  // same tail, and a pattern too short to search on still counts: there is nothing
  // else the selection could complete. The pattern ends at the caret, so it starts
  // one pattern-length back.
  const matchedPattern = pubkyMatch ?? atMatch;
  const range = matchedPattern ? { start: caretIndex - matchedPattern[0].length, end: caretIndex } : null;

  return { atQuery, pkQuery, range };
}

/**
 * Write a mention for `userId` at the caret, replacing the mention pattern the
 * caret sits in
 *
 * The text after the caret is preserved, and the caret is reported back so the
 * caller can leave the user typing where they were instead of at the end of the
 * value. With no pattern to complete (a direct call, or a stale selection) the
 * mention is written at the caret.
 *
 * @param content - Full textarea value
 * @param caret - Caret position in `content`
 * @param userId - Pubky of the selected user
 */
export function getContentWithMention(content: string, caret: number, userId: string): MentionInsertion {
  const caretIndex = clampCaret(content, caret);
  const { range } = extractMentionQuery(content, caretIndex);
  const mention = `${PUBKY_PREFIX}${userId} `;

  if (!range) {
    // Fallback: write at the caret (with a space before if the text before it is not empty)
    const prefix = content.slice(0, caretIndex);
    const space = prefix.length > 0 ? ' ' : '';
    const inserted = `${space}${mention}`;
    return { content: prefix + inserted + content.slice(caretIndex), caret: caretIndex + inserted.length };
  }

  return {
    content: content.slice(0, range.start) + mention + content.slice(range.end),
    caret: range.start + mention.length,
  };
}
