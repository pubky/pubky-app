'use client';
// ============================================================================
// Shared Components
// ============================================================================
/**
 * HomeFeedContent
 *
 * Shared content for regular feed sidebars - WhoToFollow, ActiveUsers, HotTags, FeedbackCard.
 * Used by both HomeFeedRightSidebar (desktop) and HomeFeedRightDrawer (tablet).
 */
import { Container } from '@/atoms/Container/Container';
import { ActiveUsers } from '../ActiveUsers/ActiveUsers';
import { FeedbackCard } from '../FeedbackCard/FeedbackCard';
import { HotTags } from '../HotTags/HotTags';
import { VibesCard } from '../VibesCard/VibesCard';
import { WhoToFollowSidebar } from '../WhoToFollowSidebar/WhoToFollowSidebar';

function HomeFeedContent({ showVibes = false }: { showVibes?: boolean }) {
  return (
    <>
      <WhoToFollowSidebar />
      <ActiveUsers />
      <HotTags />
      {showVibes && <VibesCard />}
      <FeedbackCard />
    </>
  );
}

// ============================================================================
// Home Feed Right Sidebar Components
// ============================================================================

/**
 * HomeFeedRightSidebar
 *
 * Right sidebar for Home feed - displays WhoToFollow, ActiveUsers, HotTags, FeedbackCard.
 * Desktop version.
 */
export function HomeFeedRightSidebar({ showVibes = false }: { showVibes?: boolean }) {
  return <HomeFeedContent showVibes={showVibes} />;
}

/**
 * HomeFeedRightDrawer
 *
 * Right drawer for Home feed (tablet) - displays WhoToFollow, ActiveUsers, HotTags, FeedbackCard.
 */
export function HomeFeedRightDrawer({ showVibes = false }: { showVibes?: boolean }) {
  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      <HomeFeedContent showVibes={showVibes} />
    </Container>
  );
}

// ============================================================================
// Hot Feed Right Sidebar Components
// ============================================================================

/**
 * HotFeedRightSidebar
 *
 * Right sidebar for Hot feed - displays WhoToFollow, FeedbackCard.
 * Desktop version with sticky positioning.
 */
export function HotFeedRightSidebar() {
  return (
    <>
      <WhoToFollowSidebar />
      <Container overrideDefaults className="sticky top-[100px] flex w-full flex-col gap-6 self-start">
        <VibesCard />
        <FeedbackCard />
      </Container>
    </>
  );
}

/**
 * HotFeedRightDrawer
 *
 * Right drawer for Hot feed (tablet/mobile) - displays WhoToFollow, FeedbackCard.
 */
export function HotFeedRightDrawer() {
  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      <WhoToFollowSidebar />
      <VibesCard />
      <FeedbackCard />
    </Container>
  );
}
