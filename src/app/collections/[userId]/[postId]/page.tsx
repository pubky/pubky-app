import { buildCompositeId } from '@/models/models.utils';
import { Collection } from '@/templates/Collection/Collection';

export interface CollectionPageProps {
  params: Promise<{
    userId: string;
    postId: string;
  }>;
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { userId, postId } = await params;
  const compositeId = buildCompositeId({ pubky: userId, id: postId });

  return <Collection postId={compositeId} />;
}
