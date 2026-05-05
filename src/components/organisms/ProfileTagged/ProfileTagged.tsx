'use client';

import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { useTagged } from '@/hooks/useTagged/useTagged';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { TaggedEmpty } from '@/molecules/TaggedEmpty/TaggedEmpty';
import { TaggedSection } from '@/molecules/TaggedSection/TaggedSection';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { ProfileTaggedSkeleton } from './ProfileTagged.skeleton';

/**
 * ProfileTagged Organism
 *
 * Handles all data fetching and state management for the tagged section.
 * This organism is responsible for:
 * - Fetching user profile data
 * - Fetching and managing tags
 * - Handling tag add/toggle operations
 * - Managing loading and empty states
 * Uses ProfileContext to get the target user's pubky.
 */
export function ProfileTagged() {
  // Get the profile pubky from context
  const { pubky } = useProfileContext();

  // Get user profile data for the target user
  const { profile } = useUserProfile(pubky ?? '');

  const { tags, count, isLoading, handleTagAdd, handleTagToggle, hasMore, isLoadingMore, loadMore } = useTagged(pubky);

  const userName = profile?.name || '';

  if (isLoading) {
    return <ProfileTaggedSkeleton />;
  }

  // Show empty state only after loading is complete and there are no tags
  if (tags.length === 0) {
    return <TaggedEmpty onTagAdd={handleTagAdd} />;
  }

  return (
    <Container className="gap-3">
      <Heading level={5} size="lg" className="leading-normal font-light text-muted-foreground lg:hidden">
        Tagged ({count})
      </Heading>
      <TaggedSection
        tags={tags}
        userName={userName}
        handleTagAdd={handleTagAdd}
        handleTagToggle={handleTagToggle}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        loadMore={loadMore}
      />
    </Container>
  );
}
