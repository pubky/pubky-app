import type { Metadata } from 'next';
import { fetchProfileForMetadata } from '@/libs/og/ogData';
import { truncateByGraphemes } from '@/libs/utils/truncate';
import { resolveDisplayName, stripPubkyPrefix } from '@/libs/utils/utils';
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
  const normalizedPubky = stripPubkyPrefix(decodeURIComponent(pubky));
  const canonical = `/profile/${normalizedPubky}`;

  try {
    const result = await fetchProfileForMetadata(pubky);
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
