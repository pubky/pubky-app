import type { PubkyAppCollectionContent } from 'pubky-app-specs';
import { type CollectionLayout, DEFAULT_COLLECTION_LAYOUT, isCollectionLayout } from '@/config/collections';

/** Parsed Collection envelope with a normalized, backwards-compatible layout. */
export type ParsedCollectionContent = PubkyAppCollectionContent & { layout: CollectionLayout };

/**
 * Parses a Collection post's `content` JSON envelope into `PubkyAppCollectionContent`.
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

  let content: Partial<PubkyAppCollectionContent> & { layout?: unknown };
  try {
    content = JSON.parse(raw) as Partial<PubkyAppCollectionContent>;
  } catch {
    return null;
  }

  if (!content || typeof content !== 'object') return null;
  if (typeof content.name !== 'string') return null;

  return {
    name: content.name,
    description: typeof content.description === 'string' ? content.description : undefined,
    items: Array.isArray(content.items) ? content.items : undefined,
    cover_image: typeof content.cover_image === 'string' ? content.cover_image : undefined,
    layout: isCollectionLayout(content.layout) ? content.layout : DEFAULT_COLLECTION_LAYOUT,
  };
}
