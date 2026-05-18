import type { Metadata } from 'next';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { ProfilePostsPage } from '@/templates/Profile/Posts/ProfilePostsPage';

interface DynamicProfilePageProps {
  params: Promise<{ pubky: string }>;
}

/**
 * Canonical metadata for the profile route.
 *
 * Emits `alternates.canonical` pointing at `/profile/[pubky]` so that search
 * engines and link previewers consolidate the legacy `/profile/[pubky]/posts`
 * URL (which 308-redirects here via `next.config.ts`) onto this canonical URL.
 *
 * Rich title / Open Graph data derived from the profile is intentionally
 * omitted here because the profile data is hydrated on the client (Dexie /
 * Nexus); adding it would require a server-side profile fetch that this route
 * does not currently perform. Revisit when SSR profile fetching is in place.
 */
export async function generateMetadata({ params }: DynamicProfilePageProps): Promise<Metadata> {
  const { pubky } = await params;
  const normalizedPubky = stripPubkyPrefix(decodeURIComponent(pubky));

  return {
    alternates: {
      canonical: `/profile/${normalizedPubky}`,
    },
  };
}

/**
 * Default page for /profile/[pubky]/ route
 *
 * Canonical posts view for other users on every viewport.
 * Mobile-only profile summary is injected by ProfilePageLayout using the
 * already-loaded profile header data.
 */
export default function DynamicProfilePage() {
  return <ProfilePostsPage />;
}
