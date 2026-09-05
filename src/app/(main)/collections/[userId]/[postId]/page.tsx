import type { Metadata as NextMetadata } from 'next';
import { getCollectionRoute } from '@/app/routes';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { fetchUserAndPostForMetadata } from '@/libs/post/postMetadata';
import { isPostDeleted, resolveDisplayName } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { Collection } from '@/templates/Collection/Collection';

export interface CollectionPageProps {
  params: Promise<{
    userId: string;
    postId: string;
  }>;
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<NextMetadata> {
  try {
    const { userId, postId } = await params;

    const result = await fetchUserAndPostForMetadata(userId, postId);
    if (!result) return {};

    const { user, post } = result;
    if (post.kind !== 'collection') return {};

    const username = resolveDisplayName(user);
    const { content } = post;

    const description = isPostDeleted(content)
      ? 'This collection has been deleted by its author.'
      : (parseCollectionContent(content)?.name ?? content);

    const title = `${username} on Pubky`;

    // Static OG/Twitter images are omitted so the dynamic `opengraph-image` /
    // `twitter-image` route is the single source of truth for the preview image.
    // `alternates` carries the canonical built from `url` — without it the page
    // would inherit the root layout's site-wide canonical (https://pubky.app).
    const { openGraph, twitter, alternates } = Metadata({
      title,
      description,
      url: getCollectionRoute(userId, postId),
      omitImages: true,
    });

    return username && description
      ? {
          title,
          description,
          openGraph,
          twitter,
          alternates,
        }
      : {};
  } catch {
    return {};
  }
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { userId, postId } = await params;
  const compositeId = buildCompositeId({ pubky: userId, id: postId });

  return <Collection postId={compositeId} />;
}
