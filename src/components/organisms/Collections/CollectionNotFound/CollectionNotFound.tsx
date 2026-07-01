'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Library, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES, getProfileRoute, PROFILE_ROUTES } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { getValidAuthorPubkyFromPostCompositeId } from '@/libs/utils/utils';
import { IllustratedEmptyState } from '@/molecules/IllustratedEmptyState/IllustratedEmptyState';

interface CollectionNotFoundProps {
  /** The `author:postId` composite that failed to resolve to a collection. */
  postId: string;
}

/**
 * Empty state when a `/collections/[userId]/[postId]` URL does not resolve to a
 * collection — the post is missing (cache miss after fetch), has been deleted,
 * or isn't a parseable collection envelope (e.g. a regular post id).
 *
 * Mirrors {@link PostNotFound} but with collection-appropriate copy and a
 * "Back to Collections" action. Rendered inside the single-collection view's
 * no-sidebar `ContentLayout`; the `<CollectionsSections />` discovery stack
 * stays below it (the collection analog of the post not-found trending feed).
 */
export function CollectionNotFound({ postId }: CollectionNotFoundProps) {
  const t = useTranslations('collections.single.notFound');
  const router = useRouter();
  const viewProfilePubky = getValidAuthorPubkyFromPostCompositeId(postId);

  return (
    <IllustratedEmptyState
      imageSrc="/images/post-not-found-empty-state.webp"
      imageAlt={t('imageAlt')}
      icon={Library}
      title={t('title')}
      subtitle={
        <>
          {t('subtitle1')}
          <br />
          {t('subtitle2')}
        </>
      }
    >
      <Container overrideDefaults className="flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row">
        <Button type="button" variant={ButtonVariant.SECONDARY} onClick={() => router.push(APP_ROUTES.COLLECTIONS)}>
          <ArrowLeft className="size-4 shrink-0" />
          {t('backToCollections')}
        </Button>
        {viewProfilePubky ? (
          <Button
            type="button"
            variant={ButtonVariant.SECONDARY}
            onClick={() => router.push(getProfileRoute(PROFILE_ROUTES.PROFILE, viewProfilePubky))}
          >
            <UserRound className="size-4 shrink-0" />
            {t('viewProfile')}
          </Button>
        ) : null}
      </Container>
    </IllustratedEmptyState>
  );
}
