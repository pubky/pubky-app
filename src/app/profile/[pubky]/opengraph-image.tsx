import { OG_CONTENT_TYPE, OG_SIZE } from '@/libs/og/ogConstants';
import { renderProfileOg } from '@/libs/og/renderProfileOg';

// Metadata exports read by Next for the injected <meta> tags.
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Pubky profile preview';

// Segment config must be a statically-analyzable literal — Next won't resolve an
// imported constant here — kept in sync with OG_REVALIDATE.
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ pubky: string }> }) {
  const { pubky } = await params;
  return renderProfileOg({ pubky });
}
