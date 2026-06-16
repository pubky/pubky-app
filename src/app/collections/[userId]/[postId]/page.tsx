import type { Metadata as NextMetadata } from 'next';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { fetchUserAndPostForMetadata } from '@/libs/post/postMetadata';
import { isPostDeleted } from '@/libs/utils/utils';
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

    const username = user.name;
    const { content } = post;

    const description = isPostDeleted(content)
      ? 'This collection has been deleted by its author.'
      : (parseCollectionContent(content)?.name ?? content);

    const title = `${username} on Pubky`;

    const { openGraph, twitter } = Metadata({
      title,
      description,
    });

    return username && description
      ? {
          title,
          description,
          openGraph,
          twitter,
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
