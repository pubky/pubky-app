'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
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
  const tHot = useTranslations('hot');

  return (
    <HotDiscoveryContentLayout>
      <Container overrideDefaults className="flex flex-col gap-12">
        <PostNotFound postId={postId} />
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
