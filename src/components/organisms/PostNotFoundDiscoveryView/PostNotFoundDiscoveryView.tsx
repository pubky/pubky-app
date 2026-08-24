'use client';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { PostNotFound } from '@/molecules/PostNotFound/PostNotFound';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

interface PostNotFoundDiscoveryViewProps {
  postId: string;
}

/**
 * “Post not found” experience: empty state with a trending posts timeline
 * underneath.
 *
 * Body content only — {@link PostPageShell} owns the {@link HotDiscoveryContentLayout},
 * so this never nests inside another `ContentLayout`.
 */
export function PostNotFoundDiscoveryView({ postId }: PostNotFoundDiscoveryViewProps) {
  return (
    <Container overrideDefaults className="flex flex-col gap-12">
      <PostNotFound postId={postId} />
      <Container overrideDefaults className="flex flex-col gap-2">
        <Heading level={5} size="lg" className="font-light text-muted-foreground">
          {'Trending posts'}
        </Heading>
        <TimelineFeed variant={TIMELINE_FEED_VARIANT.HOT} />
      </Container>
    </Container>
  );
}
