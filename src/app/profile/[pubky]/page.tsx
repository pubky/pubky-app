import type { Metadata } from 'next';
import { fetchProfileForMetadata } from '@/libs/og/ogData';
import { normalizeProfileId } from '@/libs/og/routeIds';
import { truncateByGraphemes } from '@/libs/utils/truncate';
import { resolveDisplayName } from '@/libs/utils/utils';
import { Metadata as buildMetadata } from '@/molecules/Metadata/Metadata';
import { ProfilePostsPage } from '@/templates/Profile/Posts/ProfilePostsPage';

interface DynamicProfilePageProps {
  params: Promise<{ pubky: string }>;
}

/**
 * Dynamic metadata for the profile route.
 *
 * Fetches the profile server-side (deduped by the Data Cache with the
 * `opengraph-image` route) to emit a rich title/description plus OpenGraph /
 * Twitter text. The preview image itself is supplied by the dynamic
 * `opengraph-image` / `twitter-image` file convention, so the static images are
 * omitted here (`omitImages`).
 *
 * `alternates.canonical` points at `/profile/[pubky]` so search engines and link
 * previewers consolidate the legacy `/profile/[pubky]/posts` URL (which
 * 308-redirects here via `next.config.ts`) onto this canonical URL. Falls back to
 * canonical-only metadata when the profile fetch fails.
 */
export async function generateMetadata({ params }: DynamicProfilePageProps): Promise<Metadata> {
  const { pubky } = await params;

  // Crawl-mangled ids (trailing dots, bad percent-encoding) are rejected at the
  // boundary: null falls back to canonical-only metadata without a Nexus
  // round-trip or a Sentry event (PUBKY-APP-1E/9Z/A0/BQ).
  const profileId = normalizeProfileId(pubky);
  const canonical = `/profile/${profileId ?? pubky}`;

  if (!profileId) return { alternates: { canonical } };

  try {
    const result = await fetchProfileForMetadata(profileId);
    if (!result) return { alternates: { canonical } };

    const { user } = result;
    const title = `${resolveDisplayName(user)} on Pubky`;
    const description = truncateByGraphemes(user.bio ?? '', 200);

    const { openGraph, twitter } = buildMetadata({ title, description, url: canonical, omitImages: true });

    return {
      title,
      // `null` (not the parent's generic description) when the profile has no bio.
      description: description || null,
      openGraph,
      twitter,
      alternates: { canonical },
    };
  } catch {
    return { alternates: { canonical } };
  }
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
