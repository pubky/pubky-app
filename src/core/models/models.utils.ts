import * as Types from './models.types';
import * as Defaults from './models.defaults';
import type { Pubky } from '@/models/models.types';
/**
 * Parses a pubky:// URI to extract the author and ID,
 * then builds a composite ID in the format "author:id"
 *
 * @param uri - A pubky URI (e.g., "pubky://author/pub/pubky.app/posts/post123")
 * @param domain - The domain of the URI (e.g., "posts", "files")
 * @returns Composite ID in "author:id" format, or null if parsing fails
 *
 * @example
 * buildCompositeIdFromUri("pubky://author123/pub/pubky.app/files/file456")
 * // Returns: "author123:file456"
 */
export function buildCompositeIdFromPubkyUri({ uri, domain }: Types.CompositeIdParams): string | null {
  try {
    const parsed = new URL(uri);
    const pubky = parsed.hostname;
    const segments = parsed.pathname.split('/').filter(Boolean);
    const domainIndex = segments.lastIndexOf(domain);
    const id = domainIndex !== -1 ? segments[domainIndex + 1] : undefined;

    if (!pubky || !id) {
      return null;
    }

    return buildCompositeId({ pubky, id });
  } catch {
    return null;
  }
}

export function buildCompositeId({ pubky, id }: Types.CompositeIdResult): string {
  return `${pubky}${Defaults.COMPOSITE_ID_DELIMITER}${id}`;
}

export function parseCompositeId(compositeId: string): Types.CompositeIdResult {
  const sep = compositeId.indexOf(Defaults.COMPOSITE_ID_DELIMITER);
  if (sep <= 0 || sep === compositeId.length - 1) {
    throw new Error(`Invalid composite id: ${compositeId}`);
  }
  const pubky = compositeId.substring(0, sep) as Pubky;
  const id = compositeId.substring(sep + 1);
  return { pubky, id };
}
