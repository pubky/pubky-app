import { renderFallbackOg } from './renderFallbackOg';

/**
 * Collection OG image — DEFERRED (the collection card design is still pending).
 *
 * For now this serves the app's default static preview image via
 * `renderFallbackOg`. All wiring is intentionally left in place: both the
 * collections `opengraph-image` route and the `renderPostOg` collection
 * short-circuit call this, so re-activating the real card is a single follow-up —
 * build the layout here (see the post / article variants in `renderPostOg` for
 * the pattern: fetch via `fetchUserAndPostForMetadata`, `parseCollectionContent`
 * for the name, render with `ogImageResponse`) and it lights up on both
 * `/collections/[userId]/[postId]` and collection-kind posts at once.
 */
export function renderCollectionOg(_args: { userId: string; postId: string }): Response {
  return renderFallbackOg();
}
