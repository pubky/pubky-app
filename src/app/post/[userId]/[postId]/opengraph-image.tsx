import { OG_CONTENT_TYPE, OG_SIZE } from '@/libs/og/ogConstants';
import { renderFallbackOg } from '@/libs/og/renderFallbackOg';
import { renderOgWithDeadline } from '@/libs/og/renderOgWithDeadline';
import { renderPostOg } from '@/libs/og/renderPostOg';
import { normalizePostIds } from '@/libs/og/routeIds';

// Metadata exports read by Next for the injected <meta> tags.
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Pubky post preview';

// Segment config must be a statically-analyzable literal — Next won't resolve an
// imported constant here — kept in sync with OG_REVALIDATE.
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ userId: string; postId: string }> }) {
  const { userId, postId } = await params;
  // Crawl-mangled ids never reach Nexus or the renderer (PUBKY-APP-1E/9Z/A0/BQ).
  const ids = normalizePostIds(userId, postId);
  if (!ids) return renderFallbackOg();
  return renderOgWithDeadline(() => renderPostOg({ userId: ids.userId, postId: ids.postId }), {
    route: 'post',
    userId,
    postId,
  });
}
