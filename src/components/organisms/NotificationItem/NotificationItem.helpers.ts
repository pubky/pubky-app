import { UserController } from '@/controllers/user/user';
import { Identity } from '@/libs/identity/identity';
import { MENTION_IN_TEXT_REGEX } from '@/libs/identity/identity.constants';
import { Logger } from '@/libs/logger/logger';
import { resolveUserDisplayName } from '@/libs/utils/utils';

/**
 * Replaces `pk:<key>` / `pubky<key>` tokens with display names when available.
 * Keeps the original token when resolution fails.
 */
export async function resolvePubkyToNames(content: string): Promise<string> {
  if (!content) return content;

  // 1) Scan for mention-like tokens (same boundary rule as `remarkMentions`).
  const mentions = new Set<string>();
  for (const match of content.matchAll(MENTION_IN_TEXT_REGEX)) {
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
        // Resolve through the shared helper so a tombstone mentioned in a notification renders
        // `[DELETED]`, as an in-app mention does; a live user with no name stays a raw token.
        const name = resolveUserDisplayName(details);
        return name ? { mention, name } : null;
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
  return content.replace(MENTION_IN_TEXT_REGEX, (_full, leading: string, mention: string) => {
    return leading + (mentionToName.has(mention) ? `@${mentionToName.get(mention)}` : mention);
  });
}
