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

/**
 * Replaces every standalone mention in `content` with `labelFor(pubky)`,
 * keeping the captured leading boundary (start of text or whitespace) intact.
 * Pure — callers decide how a key maps to a label.
 */
export function replaceMentions(content: string, labelFor: (pubky: string) => string): string {
  return content.replace(
    MENTION_IN_TEXT_REGEX,
    (_match, leading: string, mention: string) => leading + labelFor(stripPubkyPrefix(mention)),
  );
}
