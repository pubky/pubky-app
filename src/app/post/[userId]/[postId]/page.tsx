import { permanentRedirect } from 'next/navigation';
import type { Metadata as NextMetadata } from 'next';
import { getCollectionRoute, POST_ROUTES } from '@/app/routes';
import { normalizePostIds } from '@/libs/og/routeIds';
import type { PostCoverPreloadUrls } from '@/libs/post/postCoverPreload';
import { resolvePostCoverPreloadUrls } from '@/libs/post/postCoverPreload';
import { POST_COVER_DESKTOP_MEDIA, POST_COVER_MOBILE_MEDIA } from '@/libs/post/postCoverVariant';
import { fetchUserAndPostForMetadata, resolveMentionsForMetadata } from '@/libs/post/postMetadata';
import { deriveTextPreview, isMentionResolvablePreview } from '@/libs/post/postPreview';
import { truncateByGraphemes } from '@/libs/utils/truncate';
import { resolveDisplayName } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { SinglePostPage } from '@/templates/Post/SinglePost/SinglePostPage';

/** Grapheme cap for the `<meta>` description. */
const DESCRIPTION_MAX_GRAPHEMES = 200;

export interface PostPageProps {
  params: Promise<{
    userId: string;
    postId: string;
  }>;
}

export async function generateMetadata({ params }: PostPageProps): Promise<NextMetadata> {
  try {
    const { userId, postId } = await params;

    // Crawl-mangled ids (trailing dots, brackets, bad percent-encoding) are
    // rejected at the boundary: null falls back to empty metadata without a
    // Nexus round-trip or a Sentry event (PUBKY-APP-1E/9Z/A0/BQ).
    const ids = normalizePostIds(userId, postId);
    if (!ids) return {};

    const result = await fetchUserAndPostForMetadata(ids.userId, ids.postId);
    if (!result) return {};

    const { user, post } = result;

    // Collection-kind posts canonicalize to /collections (the page also redirects
    // there) so crawlers/search engines consolidate onto the canonical URL.
    if (post.kind === 'collection') {
      return { alternates: { canonical: getCollectionRoute(ids.userId, ids.postId) } };
    }

    const username = resolveDisplayName(user);
    const preview = deriveTextPreview({ content: post.content, kind: post.kind });
    // Raw `pk:` / `pubky` mentions become display names, as the app renders them
    // (`PostMentions`), so a shared link never captions the post with a
    // 52-character key. Article titles stay verbatim, as in the app.
    const description = truncateByGraphemes(
      isMentionResolvablePreview(post) ? await resolveMentionsForMetadata(preview, DESCRIPTION_MAX_GRAPHEMES) : preview,
      DESCRIPTION_MAX_GRAPHEMES,
    );
    const title = `${username} on Pubky`;

    // Static OG/Twitter images are omitted so the dynamic `opengraph-image` /
    // `twitter-image` route is the single source of truth for the preview image.
    // `alternates` carries the canonical built from `url` — without it the page
    // would inherit the root layout's site-wide canonical (https://pubky.app).
    const { openGraph, twitter, alternates } = Metadata({
      title,
      description,
      url: `${POST_ROUTES.POST}/${ids.userId}/${ids.postId}`,
      omitImages: true,
    });

    // Emit metadata whenever we have a valid author, even when the post has no
    // textual content (e.g. a simple repost) — the `{name} on Pubky` title and the
    // dynamic OG image still surface. Description is `null` (not the parent's
    // generic one) so an empty post isn't captioned with the app's tagline.
    return username ? { title, description: description || null, openGraph, twitter, alternates } : {};
  } catch {
    // Fallback to parent metadata
    return {};
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { userId, postId } = await params;

  // Collection-kind posts live under /collections; redirect there so the
  // canonical URL and its dynamic OG image are used. The fetch is deduped by the
  // Data Cache with the one in generateMetadata. A failed lookup (e.g. Nexus
  // outage) is non-fatal — fall through and render the post page as before.
  // NOTE: permanentRedirect() signals via a thrown error, so it MUST stay
  // outside the try/catch or the redirect would be swallowed.
  // NOTE: this redirect only covers full document loads, and even then it ships
  // as a streamed 200 with the redirect embedded in the RSC payload — executed
  // client-side after hydration, never as a real HTTP 308 (observed on Next 16
  // even for redirects thrown before any await). Client-side navigations bypass
  // it entirely: the intercepted `(.)post` route never runs this page, and the
  // Next 16 router does not act on the streamed NEXT_REDIRECT during soft
  // navigation. SinglePostPage has a client-side guard that handles those
  // paths — keep both in sync.
  const ids = normalizePostIds(userId, postId);
  let isCollection = false;
  let coverPreload: PostCoverPreloadUrls | null = null;
  if (ids) {
    try {
      const result = await fetchUserAndPostForMetadata(ids.userId, ids.postId);
      isCollection = result?.post.kind === 'collection';
      // The cover is the page's largest contentful paint, and the client only learns
      // its URL after hydration + a file-metadata lookup. Preload both variants here,
      // from the post this render already fetched: the browser honours the one whose
      // media query matches, so the download starts before the app JS runs.
      coverPreload = result ? resolvePostCoverPreloadUrls(result.post) : null;
    } catch {
      // Ignore — render the post normally when the kind lookup fails.
    }
  }
  if (isCollection && ids) {
    permanentRedirect(getCollectionRoute(ids.userId, ids.postId));
  }

  // Malformed ids never reach Nexus; render with them as-is so the client-side
  // guard in SinglePostPage handles the not-found state as before.
  const compositeId = buildCompositeId({ pubky: userId, id: postId });

  return (
    <>
      {coverPreload && (
        <>
          <link
            rel="preload"
            as="image"
            href={coverPreload.mobile}
            media={POST_COVER_MOBILE_MEDIA}
            fetchPriority="high"
          />
          <link
            rel="preload"
            as="image"
            href={coverPreload.desktop}
            media={POST_COVER_DESKTOP_MEDIA}
            fetchPriority="high"
          />
        </>
      )}
      <SinglePostPage postId={compositeId} />
    </>
  );
}
