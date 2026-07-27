import type { PubkyAppCollectionContent } from 'pubky-app-specs';

/**
 * Re-export the canonical Collection content envelope type from `pubky-app-specs`
 * so consumers can import the type and the parser from a single project module.
 *
 * This module must stay pure (no Controller/Application imports): the parser is
 * consumed by the application layer (`PostStreamApplication.filterEmptyCollections`),
 * which must not depend on Controllers (AGENTS.md layering). The
 * `FileController`-backed cover-image resolver lives in `collectionCoverImage.ts`.
 *
 * Shape (per the specs package, `>= 0.5.2-rc2`):
 *   - `name: string` (required)
 *   - `description: string | undefined`
 *   - `items?: string[]` (TS-optional for forward-compat; runtime validator
 *     produces an array)
 *   - `cover_image: string | undefined`
 */
export type { PubkyAppCollectionContent } from 'pubky-app-specs';

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
export function parseCollectionContent(raw: string | null | undefined): PubkyAppCollectionContent | null {
  if (!raw) return null;

  let content: Partial<PubkyAppCollectionContent>;
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
  };
}
