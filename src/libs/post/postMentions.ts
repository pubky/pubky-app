import { PUBKY_IDENTIFIER_WITH_PREFIX_SOURCE } from '@/libs/identity/identity.constants';
import { formatPublicKey, stripPubkyPrefix } from '@/libs/utils/utils';

/**
 * Standalone `pk:<key>` / `pubky<key>` tokens: at the start of the text or after
 * whitespace, the same boundary rule `remarkMentions` uses to linkify them in
 * the app, so a key glued to other text (a URL path, a word) is left alone.
 *
 * Capture groups: (leading boundary)(mention token).
 */
const MENTION_IN_TEXT_REGEX = new RegExp(`(^|\\s)(${PUBKY_IDENTIFIER_WITH_PREFIX_SOURCE})`, 'g');

/**
 * Unique public keys (prefix stripped) mentioned in `content`, in order of
 * first appearance. Pure.
 */
export function extractMentionedPubkys(content: string): string[] {
  const pubkys = new Set<string>();
  for (const match of content.matchAll(MENTION_IN_TEXT_REGEX)) {
    pubkys.add(stripPubkyPrefix(match[2]));
  }
  return [...pubkys];
}

/**
 * Display label for a mentioned user, mirroring what `PostMentions` renders in
 * the app: `@name` when the profile has a name, otherwise the shortened key.
 */
export function formatMentionLabel({ pubky, name }: { pubky: string; name?: string | null }): string {
  return name ? `@${name}` : formatPublicKey({ key: pubky });
}

/** A run of text: plain copy, or a mention already resolved to its label. */
export type MentionSegment = { text: string; isMention: boolean };

/**
 * Splits `content` into plain runs and mentions, each standalone mention
 * replaced by `labelFor(pubky)` and flagged so renderers can style it (the OG
 * image draws mentions in the brand colour, as the app does). The captured
 * leading boundary (start of text or whitespace) stays in the plain run before
 * the mention. Pure — callers decide how a key maps to a label.
 */
export function splitMentions(content: string, labelFor: (pubky: string) => string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(MENTION_IN_TEXT_REGEX)) {
    const [, leading, mention] = match;
    const mentionStart = (match.index ?? 0) + leading.length;
    const before = content.slice(lastIndex, mentionStart);
    if (before) segments.push({ text: before, isMention: false });
    segments.push({ text: labelFor(stripPubkyPrefix(mention)), isMention: true });
    lastIndex = mentionStart + mention.length;
  }

  const rest = content.slice(lastIndex);
  if (rest) segments.push({ text: rest, isMention: false });
  return segments;
}

/** `splitMentions` flattened back to a string, for plain-text surfaces (`<meta>` descriptions). */
export function replaceMentions(content: string, labelFor: (pubky: string) => string): string {
  return splitMentions(content, labelFor)
    .map((segment) => segment.text)
    .join('');
}
