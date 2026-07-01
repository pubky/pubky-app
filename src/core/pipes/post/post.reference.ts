import { postUriBuilder } from 'pubky-app-specs';
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
    postUri: postUriBuilder(pubky, id),
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
