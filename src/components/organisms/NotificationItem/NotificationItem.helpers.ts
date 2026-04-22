import { Identity, Logger } from '@/libs';
import { UserController } from '@/core/controllers/user/user';

// Mention pattern: pk: or pubky followed by exactly 52 lowercase alphanumeric characters
const mentionInTextRegex = new RegExp(`(^|\\s)(${Identity.PUBKY_IDENTIFIER_WITH_PREFIX_SOURCE})`, 'g');

/**
 * Replaces `pk:<key>` / `pubky<key>` tokens with display names when available.
 * Keeps the original token when resolution fails.
 */
export async function resolvePubkyToNames(content: string): Promise<string> {
  if (!content) return content;

  // 1) Scan for mention-like tokens (same boundary rule as `remarkMentions`).
  const mentions = new Set<string>();
  for (const match of content.matchAll(mentionInTextRegex)) {
    // Regex: (^|\s)(pk:abc... | pubkyabc...)
    // match[0] = " pk:abc..."   — full match including leading whitespace
    // match[1] = " "            — leading boundary (start-of-string or whitespace)
    // match[2] = "pk:abc..."    — mention token without boundary
    mentions.add(match[2]);
  }

  // 2) Fast-path: nothing to resolve.
  if (mentions.size === 0) return content;

  // 3) Resolve each mention to a display name (local-first; falls back to original mention on failure).
  const resolvedPairs = await Promise.all(
    [...mentions].map(async (mention) => {
      const key = Identity.extractPubkyPublicKey(mention);
      if (!key) return null;

      try {
        const details = await UserController.getOrFetchDetails({ userId: key });
        return details?.name ? { mention, name: details.name } : null;
      } catch (error) {
        Logger.debug('Failed to resolve mention', { mention, error });
        return null;
      }
    }),
  );

  // 4) Build an O(1) lookup map from mention token to display name.
  const mentionToName = new Map<string, string>();
  for (const pair of resolvedPairs) {
    if (pair) mentionToName.set(pair.mention, pair.name);
  }

  // 5) Replace mentions while preserving the captured leading boundary (start/whitespace).
  return content.replace(mentionInTextRegex, (_full, leading: string, mention: string) => {
    return leading + (mentionToName.has(mention) ? `@${mentionToName.get(mention)}` : mention);
  });
}
