import { matchPostRoute, matchSingleCollectionRoute } from '@/app/routes';
import { isPubkyIdentifier, isSameDomain } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import type { EmbedData, EmbedProvider } from '../Provider.types';

/**
 * Resolve an in-app post/collection URL to a composite post id, or null.
 *
 * A URL is in-app when it is same-domain per `isSameDomain` — the same policy
 * the link-confirmation dialog uses (hostname with `www.` stripped, http(s)
 * only via `getSafeExternalUrl`) — and its path is a single post
 * (`/post/[userId]/[postId]`) or single collection
 * (`/collections/[userId]/[postId]`) route. Sharing the helper keeps the two
 * features from ever giving the same URL different internal/external verdicts.
 */
const parseInAppCompositeId = (url: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    if (!isSameDomain(url)) return null;
    const parsed = new URL(url);
    // URL.pathname excludes query/hash; the route matchers handle trailing slashes.
    const match = matchPostRoute(parsed.pathname) ?? matchSingleCollectionRoute(parsed.pathname);
    if (!match) return null;
    if (!isPubkyIdentifier(match.userId) || match.postId.length === 0) return null;
    return buildCompositeId({ pubky: match.userId, id: match.postId });
  } catch {
    return null;
  }
};

/**
 * In-app embed provider
 * Renders links to posts/collections on the current origin as the same rich
 * preview card used for quote-reposts, instead of a generic OG preview.
 */
export const InApp: EmbedProvider = {
  /**
   * The current origin is dynamic, so this provider is matched via an early
   * check in `parseContentForLinkEmbed`, never via the PROVIDER_MAP.
   */
  domains: [],

  /**
   * Parse an in-app URL into a composite post id
   * Returns null for any URL that isn't a current-origin post/collection route,
   * so callers fall through to the generic provider.
   */
  parseEmbed: (url: string): EmbedData | null => {
    const compositeId = parseInAppCompositeId(url);
    return compositeId ? { type: 'post', value: compositeId } : null;
  },

  /**
   * Render the referenced post with the same preview card reposts use
   * (`bg-muted` matches the repost preview contrast in PostContent)
   */
  renderEmbed: (embedData: EmbedData) => {
    // Type guard: ensure we have a post type
    if (embedData.type !== 'post') return null;

    return <PostPreviewCard postId={embedData.value} className="bg-muted" />;
  },
};
