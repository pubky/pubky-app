import { permanentRedirect } from 'next/navigation';
import type { Metadata as NextMetadata } from 'next';
import { parseArticleContent } from '@/libs/post/articleContent';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { fetchUserAndPostForMetadata } from '@/libs/post/postMetadata';
import { isPostDeleted } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { SinglePostPage } from '@/templates/Post/SinglePost/SinglePostPage';

export interface PostPageProps {
  params: Promise<{
    userId: string;
    postId: string;
  }>;
}

// Reuse a single Segmenter instance across requests.
// 'en' locale is fine — grapheme segmentation follows Unicode rules (UAX #29)
// which are language-agnostic, so the locale has no practical effect.
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

export async function generateMetadata({ params }: PostPageProps): Promise<NextMetadata> {
  try {
    const { userId, postId } = await params;

    const result = await fetchUserAndPostForMetadata(userId, postId);
    if (!result) return {};

    const { user, post } = result;

    if (post.kind === 'collection') {
      return { alternates: { canonical: `/collections/${userId}/${postId}` } };
    }

    const username = user.name;
    const { content, kind } = post;

    const isDeleted = isPostDeleted(content);

    const postPreview = isDeleted
      ? 'This post has been deleted by its author.'
      : kind === 'long'
        ? parseArticleContent(content)?.title || content
        : kind === 'collection'
          ? (parseCollectionContent(content)?.name ?? content)
          : content;
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

  let isCollection = false;
  try {
    const result = await fetchUserAndPostForMetadata(userId, postId);
    isCollection = result?.post.kind === 'collection';
  } catch {
    // Preserve the existing post page when the kind lookup fails.
  }

  if (isCollection) {
    permanentRedirect(`/collections/${userId}/${postId}`);
  }

  const compositeId = buildCompositeId({ pubky: userId, id: postId });

  return <SinglePostPage postId={compositeId} />;
}
