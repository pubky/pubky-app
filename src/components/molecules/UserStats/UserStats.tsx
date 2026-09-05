import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import type { UserStatsProps } from './UserStats.types';

/**
 * UserStats
 *
 * Labelled TAGS / POSTS counts shared by user list items and suggestion cards.
 */
export function UserStats({ tags, posts }: UserStatsProps) {
  return (
    <Container overrideDefaults className="flex shrink-0 items-center gap-3">
      <Container className="items-start">
        <Typography className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
          {'TAGS'}
        </Typography>
        <Typography data-cy="profile-follower-item-tags-count" size="sm" className="font-bold">
          {tags}
        </Typography>
      </Container>
      <Container className="items-start">
        <Typography className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
          {'POSTS'}
        </Typography>
        <Typography data-cy="profile-follower-item-posts-count" size="sm" className="font-bold">
          {posts}
        </Typography>
      </Container>
    </Container>
  );
}
