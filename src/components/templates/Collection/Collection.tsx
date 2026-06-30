'use client';

import { useRef } from 'react';
import { Container } from '@/atoms/Container/Container';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { isPostDeleted, isValidPostCompositeId } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { CollectionItems } from '@/organisms/Collections/CollectionItems/CollectionItems';
import { CollectionNotFound } from '@/organisms/Collections/CollectionNotFound/CollectionNotFound';
import { CollectionsSections } from '@/organisms/Collections/CollectionsSections/CollectionsSections';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import type { CollectionProps } from './Collection.types';

/**
 * Collection Template (singular — distinct from the `Collections` landing template)
 *
 * Single-column page for one collection at `/collections/[userId]/[postId]`.
 * No sidebars and no mobile drawer buttons — three stacked regions only:
 *
 * 1. Hero (collection name, owner, description, tags, cover, actions) — Phase D.
 * 2. Infinite-scroll grid of the collection's items — Phase B.
 * 3. The shared `<CollectionsSections />` stack (My / Followed / Discover), reused verbatim.
 *
 * The Hero → feed → Sections structure is identical for both the owner and
 * other-user views; only the hero actions and the items empty-state differ.
 *
 * When the URL doesn't resolve to a collection — malformed composite id, a
 * missing/404'd post (cache miss after the local-first fetch), a deleted
 * collection, or a post that isn't a parseable collection envelope — the hero +
 * items regions are replaced with `<CollectionNotFound />`. The discovery
 * `<CollectionsSections />` stack stays below so the user can still explore.
 */
export function Collection({ postId }: CollectionProps) {
  const compositeValid = isValidPostCompositeId(postId);
  const { postDetails, isLoading } = usePostDetails(postId, { enabled: compositeValid });

  // A deleted collection has no name/items to render; a non-collection post
  // (e.g. a regular post id at this route) doesn't parse into an envelope.
  // Both are treated as "not found" rather than rendering a broken hero/feed.
  const isDeleted = postDetails != null && isPostDeleted(postDetails.content);
  const isNotCollection = postDetails != null && !isDeleted && parseCollectionContent(postDetails.content) === null;
  const collectionMissing = !compositeValid || (!isLoading && postDetails === null) || isDeleted || isNotCollection;

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-24 lg:pb-12 xl:px-0!"
    >
      <Container overrideDefaults className="flex w-full flex-col gap-12">
        {collectionMissing ? (
          <CollectionNotFound postId={postId} />
        ) : (
          <CollectionResolved postId={postId} postDetails={postDetails} />
        )}
        <CollectionsSections />
      </Container>
    </ContentLayout>
  );
}

/**
 * Hero + items regions for a resolved collection. Only rendered once the
 * composite id is valid, so `parseCompositeId` (which throws on malformed ids)
 * is safe here.
 */
function CollectionResolved({
  postId,
  postDetails,
}: CollectionProps & { postDetails: ReturnType<typeof usePostDetails>['postDetails'] }) {
  const pullToRefreshContainerRef = useRef<HTMLDivElement>(null);
  const { pubky: authorPubky, id: rawPostId } = parseCompositeId(postId);

  return (
    <Container ref={pullToRefreshContainerRef} overrideDefaults className="flex w-full flex-col gap-12">
      <CollectionItems
        authorPubky={authorPubky}
        postId={rawPostId}
        postDetails={postDetails}
        pullToRefreshContainerRef={pullToRefreshContainerRef}
      />
    </Container>
  );
}
