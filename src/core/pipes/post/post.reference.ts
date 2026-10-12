import { buildUri, listPrefix } from 'pubky-social-specs';
import { isValidPostCompositeId } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId, parseCompositeId } from '@/models/models.utils';

interface ParsedPostReference {
  compositeId: string;
  pubky: Pubky;
  postId: string;
  postUri: string;
}

export function parsePostReference(value: string): ParsedPostReference | null {
  const compositeId = resolveAppPostUrl(value);

  if (!compositeId || !isValidPostCompositeId(compositeId)) {
    return null;
  }

  const { pubky, id } = parseCompositeId(compositeId);

  return {
    compositeId,
    pubky,
    postId: id,
    postUri: buildUri(pubky, 'post', id),
  };
}

function resolveAppPostUrl(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  try {
    const url = new URL(input);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const segments = url.pathname.split('/').filter(Boolean);

    if (segments[0] !== 'post' || segments.length !== 3) {
      return null;
    }

    return buildCompositeId({ pubky: segments[1] as Pubky, id: segments[2] });
  } catch {
    return null;
  }
}

/**
 * Both spellings of a reference to one post. Nexus serves the 0.x spelling
 * (`/pub/pubky.app/posts/{id}`) for posts of an account that has not migrated, and a v1 write
 * references the post as `buildUri` spells it, so a lookup by URI has to match either.
 */
export function postReferenceSpellings(pubky: Pubky, postId: string): string[] {
  return [buildUri(pubky, 'post', postId), `${listPrefix(pubky, 'legacy')}posts/${postId}`];
}
