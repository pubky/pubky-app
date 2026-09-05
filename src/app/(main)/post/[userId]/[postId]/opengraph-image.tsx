import { OG_CONTENT_TYPE, OG_SIZE } from '@/libs/og/ogConstants';
import { renderOgWithDeadline } from '@/libs/og/renderOgWithDeadline';
import { renderPostOg } from '@/libs/og/renderPostOg';

// Metadata exports read by Next for the injected <meta> tags.
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Pubky post preview';

// Segment config must be a statically-analyzable literal — Next won't resolve an
// imported constant here — kept in sync with OG_REVALIDATE.
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ userId: string; postId: string }> }) {
  const { userId, postId } = await params;
  return renderOgWithDeadline(() => renderPostOg({ userId, postId }), { route: 'post', userId, postId });
}
