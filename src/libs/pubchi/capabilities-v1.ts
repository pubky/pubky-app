import { buildUri, listPrefix, parseUri, ValidationError } from 'pubky-social-specs';
import { parsePostReference as parseAppPostReference } from '@/pipes/post/post.reference';

export type PostReference = { uri: string; pubky: string; postId: string };

export function parsePostReference(value: string): PostReference | null {
  const input = value.trim();
  if (input.startsWith('pubky://')) {
    try {
      const parsed = parseUri(input);
      if (parsed.root !== 'public') return null;
      if (parsed.kind === 'post') {
        return { pubky: parsed.owner, postId: parsed.id, uri: buildUri(parsed.owner, 'post', parsed.id) };
      }
      // Pasted links to pre-migration posts are sent to the service as v1 references.
      if (parsed.kind === 'foreign' && parsed.rest.length === 2) {
        const id = parsed.rest[1];
        if (input === `${listPrefix(parsed.owner, 'legacy')}posts/${id}`) {
          return { pubky: parsed.owner, postId: id, uri: buildUri(parsed.owner, 'post', id) };
        }
      }
      return null;
    } catch (error) {
      if (error instanceof ValidationError) return null;
      throw error;
    }
  }

  // Only accept complete HTTPS links on an App host. URL alone would normalize dot segments.
  const match = /^https:\/\/([^/?#@]+)\/post\/([^/?#]+)\/([^/?#]+)$/.exec(input);
  if (!match || !['pubky.app', 'bots.pubky.app', globalThis.location?.host].includes(match[1])) return null;
  const parsed = parseAppPostReference(input);
  return parsed ? { pubky: parsed.pubky, postId: parsed.postId, uri: parsed.postUri } : null;
}

export function linkifyPubkys(text: string): Array<string | { pubky: string; href: string }> {
  const parts = text.split(/(pubky:[ybndrfg8ejkmcpqxot1uwisza345h769]{52})/g);
  return parts.map((part) => {
    if (!part.startsWith('pubky:')) return part;
    const pubky = part.slice('pubky:'.length);
    return { pubky, href: `/profile/${pubky}` };
  });
}

export const PUBCHI_CURSOR_STORAGE_PREFIX = 'pubchi-cursor:';

export function readLocalCursor(owner: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(`${PUBCHI_CURSOR_STORAGE_PREFIX}${owner}`);
}

export function writeLocalCursor(owner: string, cursor: string): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(`${PUBCHI_CURSOR_STORAGE_PREFIX}${owner}`, cursor);
}

/** Pass the outgoing owner during auth cleanup so another account's state survives. */
export function clearLocalCursors(owner?: string): void {
  if (typeof window === 'undefined') return;
  if (owner !== undefined) {
    window.localStorage.removeItem(`${PUBCHI_CURSOR_STORAGE_PREFIX}${owner}`);
    return;
  }
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(PUBCHI_CURSOR_STORAGE_PREFIX)) window.localStorage.removeItem(key);
  }
}
