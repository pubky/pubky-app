import type { Metadata as NextMetadata } from 'next';
import type { ArticleJSON } from '@/hooks/usePostArticle/usePostArticle.types';
import * as Templates from '@/templates';
import * as Core from '@/core';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { httpResponseToError, ErrorService } from '@/libs';

export interface PostPageProps {
  params: Promise<{
    userId: string;
    postId: string;
  }>;
}

/**
 * Server-side fetch with Next.js caching and proper error handling.
 * Used for SSR/ISR metadata generation where client-side services are not available.
 */
async function fetchWithValidation<T>(url: string, operation: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw httpResponseToError(res, ErrorService.Nexus, operation, url);
  }
  return res.json();
}

function parseArticleTitle(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as ArticleJSON;
    return parsed.title || null;
  } catch {
    return null;
  }
}

// Reuse a single Segmenter instance across requests.
// 'en' locale is fine — grapheme segmentation follows Unicode rules (UAX #29)
// which are language-agnostic, so the locale has no practical effect.
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

export async function generateMetadata({ params }: PostPageProps): Promise<NextMetadata> {
  try {
    const { userId, postId } = await params;

    // fetch user and post information concurrently using Core URL builders
    const [user, post] = await Promise.all([
      fetchWithValidation<Core.NexusUserDetails>(Core.userApi.details({ user_id: userId }), 'fetchUserDetails'),
      fetchWithValidation<Core.NexusPostDetails>(
        Core.postApi.details({ author_id: userId, post_id: postId }),
        'fetchPostDetails',
      ),
    ]);

    const username = user.name;
    const { content, kind } = post;

    const isArticle = kind === 'long';
    const postPreview = isArticle ? (parseArticleTitle(content) ?? content) : content;
    // Use Intl.Segmenter to truncate by grapheme clusters, avoiding broken emojis.
    const segments = [...graphemeSegmenter.segment(postPreview)];
    const postPreviewTruncated =
      segments.length > 200
        ? `${segments
            .slice(0, 200)
            .map((s) => s.segment)
            .join('')}...`
        : postPreview;

    const title = `${username} on Pubky`;
    const description = postPreviewTruncated;

    const { openGraph, twitter } = Metadata({
      title,
      description,
    });

    return username && postPreviewTruncated
      ? {
          title,
          description,
          openGraph,
          twitter,
        }
      : {};
  } catch {
    // Fallback to parent metadata
    return {};
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { userId, postId } = await params;
  const compositeId = Core.buildCompositeId({ pubky: userId, id: postId });

  return <Templates.SinglePost postId={compositeId} />;
}
