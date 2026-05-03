import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { ActiveUsers } from '../ActiveUsers/ActiveUsers';
import { FeedbackCard } from '../FeedbackCard/FeedbackCard';
import { WhoToFollowSidebar } from '../WhoToFollowSidebar/WhoToFollowSidebar';
import type { RightSidebarProps } from './RightSidebar.types';

export function RightSidebar({ className }: RightSidebarProps) {
  return (
    <Container
      overrideDefaults
      data-testid="right-sidebar"
      className={cn('hidden w-(--filter-bar-width) flex-col items-start justify-start gap-6 lg:flex', className)}
    >
      <WhoToFollowSidebar />
      <ActiveUsers />
      <Container overrideDefaults className="sticky top-[100px] self-start">
        <FeedbackCard />
      </Container>
    </Container>
  );
}
