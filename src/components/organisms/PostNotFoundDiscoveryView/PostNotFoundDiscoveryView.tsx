'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APP_ROUTES, getProfileRoute, PROFILE_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useLayoutReset } from '@/hooks/useLayoutReset/useLayoutReset';
import { getValidAuthorPubkyFromPostCompositeId } from '@/libs/utils/utils';
import { PostNotFound } from '@/molecules/PostNotFound/PostNotFound';
import { HotDiscoveryContentLayout } from '@/organisms/HotDiscoveryContentLayout/HotDiscoveryContentLayout';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

interface PostNotFoundDiscoveryViewProps {
  postId: string;
}

/**
 * Full-window “post not found” experience: same discovery chrome as {@link Hot},
 * with a trending posts timeline under the empty state (see #1769 / Figma).
 */
export function PostNotFoundDiscoveryView({ postId }: PostNotFoundDiscoveryViewProps) {
  useLayoutReset();
  const t = useTranslations('post.notFound');
  const tHot = useTranslations('hot');
  const router = useRouter();

  const viewProfilePubky = getValidAuthorPubkyFromPostCompositeId(postId);

  return (
    <HotDiscoveryContentLayout>
      <Container overrideDefaults className="flex flex-col gap-12">
        <PostNotFound
          title={t('title')}
          subtitle={t('subtitle')}
          imageAlt={t('imageAlt')}
          backToFeedLabel={t('backToFeed')}
          viewProfileLabel={t('viewProfile')}
          exploreTagsLabel={t('exploreTags')}
          onBackToFeed={() => router.push(APP_ROUTES.HOME)}
          onViewProfile={
            viewProfilePubky ? () => router.push(getProfileRoute(PROFILE_ROUTES.PROFILE, viewProfilePubky)) : undefined
          }
          onExploreTags={() => router.push(APP_ROUTES.HOT)}
        />
        <Container overrideDefaults className="flex flex-col gap-2">
          <Heading level={5} size="lg" className="font-light text-muted-foreground">
            {tHot('trendingPosts')}
          </Heading>
          <TimelineFeed variant={TIMELINE_FEED_VARIANT.HOT} />
        </Container>
      </Container>
    </HotDiscoveryContentLayout>
  );
}
