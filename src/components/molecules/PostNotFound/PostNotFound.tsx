'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, FileQuestion, Tag, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES, getUserProfileUrl } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { getValidAuthorPubkyFromPostCompositeId } from '@/libs/utils/utils';
import { useAuthStore } from '@/stores/auth/auth.store';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

interface PostNotFoundProps {
  postId: string;
}

/**
 * Empty state when a post URL does not resolve to a post (cache miss after fetch).
 */
export function PostNotFound({ postId }: PostNotFoundProps) {
  const t = useTranslations('post.notFound');
  const router = useRouter();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const viewProfilePubky = getValidAuthorPubkyFromPostCompositeId(postId);

  return (
    <IllustratedEmptyState
      imageSrc="/images/post-not-found-empty-state.webp"
      imageAlt={t('imageAlt')}
      icon={FileQuestion}
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
        <Button type="button" variant={ButtonVariant.SECONDARY} onClick={() => router.push(APP_ROUTES.HOME)}>
          <ArrowLeft className="size-4 shrink-0" />
          {t('backToFeed')}
        </Button>
        {viewProfilePubky ? (
          <Button
            type="button"
            variant={ButtonVariant.SECONDARY}
            onClick={() => router.push(getUserProfileUrl(viewProfilePubky, currentUserPubky))}
          >
            <UserRound className="size-4 shrink-0" />
            {t('viewProfile')}
          </Button>
        ) : null}
        <Button type="button" variant={ButtonVariant.SECONDARY} onClick={() => router.push(APP_ROUTES.HOT)}>
          <Tag className="size-4 shrink-0" />
          {t('exploreTags')}
        </Button>
      </Container>
    </IllustratedEmptyState>
  );
}
