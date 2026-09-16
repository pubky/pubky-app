import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { PopoverSocialGraph } from '../PopoverSocialGraph/PopoverSocialGraph';
import { SocialGraphBadge } from '../SocialGraphBadge/SocialGraphBadge';
import type { ProfilePageSocialGraphProps } from './ProfilePageSocialGraph.types';

/**
 * ProfilePageSocialGraph
 *
 * "Social Graph" profile section: heading with a help popover, and the tier badge.
 */
export function ProfilePageSocialGraph({ status }: ProfilePageSocialGraphProps) {
  return (
    <Container data-cy="profile-social-graph-section" overrideDefaults={true} className="flex flex-col gap-2">
      <Container overrideDefaults={true} className="flex items-start gap-1">
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {'Social Graph'}
        </Heading>
        <PopoverSocialGraph />
      </Container>
      <SocialGraphBadge status={status} />
    </Container>
  );
}
