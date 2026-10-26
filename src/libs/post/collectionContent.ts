import { DEFAULT_COLLECTION_LAYOUT, isCollectionLayout } from '@/config/collections';
import type { CollectionContent } from '@/models/post/collection/collectionPost.types';

/** Parsed Collection envelope with a normalized, backwards-compatible layout. */
export type ParsedCollectionContent = CollectionContent;

/**
 * Parses a Collection post's `content` JSON envelope, in either spelling: v1 items are
 * `{ uri, note }` objects, 0.x items plain URIs. Item notes are not shown, so they are dropped.
 *
 * Returns `null` when:
 *   - `raw` is null / undefined / empty
 *   - JSON parse fails
 *   - the parsed value isn't an object with a string `name`
 *
 * Input tolerance: accepts `null` or missing values on optional fields and
 * normalizes them to `undefined` to match the canonical type. `items` is
 * normalized to `undefined` when missing (the type marks it optional);
 * callers that need a definite array should default with `?? []`.
 *
 * Pure function — safe to call from any layer (UI, services, models).
 */
export function parseCollectionContent(raw: string | null | undefined): ParsedCollectionContent | null {
  if (!raw) return null;

  let content: { name?: unknown; description?: unknown; items?: unknown; cover_image?: unknown; layout?: unknown };
  try {
    content = JSON.parse(raw) as typeof content;
  } catch {
    return null;
  }

  if (!content || typeof content !== 'object') return null;
  if (typeof content.name !== 'string') return null;

  return {
    name: content.name,
    description: typeof content.description === 'string' ? content.description : undefined,
    items: Array.isArray(content.items) ? collectionItemUris(content.items) : undefined,
    cover_image: typeof content.cover_image === 'string' ? content.cover_image : undefined,
    layout: isCollectionLayout(content.layout) ? content.layout : DEFAULT_COLLECTION_LAYOUT,
  };
}

/** The URIs of a stored item list: v1 `{ uri, note }` objects or 0.x strings; anything else is skipped. */
export function collectionItemUris(items: unknown[]): string[] {
  return items.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (typeof item === 'object' && item !== null && typeof (item as { uri?: unknown }).uri === 'string') {
      return [(item as { uri: string }).uri];
    }
    return [];
  });
}
