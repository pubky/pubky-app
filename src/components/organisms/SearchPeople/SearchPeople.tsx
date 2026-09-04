'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { SEARCH_PEOPLE_PREVIEW_COUNT } from '@/config/search';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { useSearchPeople } from '@/hooks/useSearchPeople/useSearchPeople';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import { UserListItem } from '@/organisms/UserListItem/UserListItem';
import { useAuthStore } from '@/stores/auth/auth.store';
import { SearchPersonCardSkeleton } from './SearchPeople.skeleton';

/**
 * SearchPeople
 *
 * "People" section on `/search` — users whose profile is tagged with the
 * searched tags, via `search/users/by_tags`. Collapsed to a preview of
 * `SEARCH_PEOPLE_PREVIEW_COUNT` cards; "See all" expands in place to the
 * paginated grid. Renders nothing without a tag search (a full-text query has
 * no tags to match) or without matches.
 */
export function SearchPeople() {
  const criteria = useSearchCriteria();

  if (criteria.mode !== 'tags') {
    return null;
  }

  const tags = criteria.tags;

  // Remount on any tag change so the expansion state resets with the query.
  return <SearchPeopleContent key={tags.join(',')} tags={tags} />;
}

/** Inner data-driven body — only mounted with a non-empty tag list. */
function SearchPeopleContent({ tags }: { tags: string[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { toggleFollow, isUserLoading } = useFollowUser();

  const { users, loading, loadingMore, hasMore, loadMore } = useSearchPeople(tags, {
    onError: () => {
      toast({
        variant: 'error',
        description: 'Failed to load people. Please try again.',
      });
    },
  });

  const showSkeletons = loading && users.length === 0;

  // Settled empty with the stream exhausted (including error) — the section
  // vanishes entirely.
  if (!loading && users.length === 0 && !hasMore) {
    return null;
  }

  const visibleUsers = isExpanded ? users : users.slice(0, SEARCH_PEOPLE_PREVIEW_COUNT);
  const showSeeAll = !isExpanded && users.length > 0 && (users.length > SEARCH_PEOPLE_PREVIEW_COUNT || hasMore);
  // A fully-filtered page keeps hasMore — with nothing to preview, surface
  // "Show more" directly so the cursor can still advance.
  const showShowMore = !loading && hasMore && (isExpanded || users.length === 0);

  const handleFollow = async (userId: Pubky, isCurrentlyFollowing: boolean, displayName: string) => {
    await toggleFollow(userId, isCurrentlyFollowing, displayName);
  };

  return (
    <Container overrideDefaults data-cy="search-people-section" className="flex w-full flex-col gap-4">
      <Container overrideDefaults className="flex items-center justify-between gap-3">
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {'People'}
        </Heading>
        {showSeeAll && (
          <Button variant="secondary" size="sm" data-cy="search-people-see-all" onClick={() => setIsExpanded(true)}>
            {'See all'}
          </Button>
        )}
      </Container>

      <Container overrideDefaults className="grid w-full grid-cols-2 gap-3 lg:gap-6">
        {showSkeletons
          ? Array.from({ length: SEARCH_PEOPLE_PREVIEW_COUNT }).map((_, index) => (
              <SearchPersonCardSkeleton key={`search-people-skeleton-${index}`} />
            ))
          : visibleUsers.map((user) => (
              <UserListItem
                key={user.id}
                user={user}
                variant="card"
                isLoading={isUserLoading(user.id)}
                isCurrentUser={currentUserPubky === user.id}
                onFollowClick={handleFollow}
              />
            ))}
      </Container>

      {showShowMore && (
        <Container overrideDefaults className="flex w-full justify-center">
          <Button
            variant="default"
            size="sm"
            data-cy="search-people-show-more"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            {'Show more'}
          </Button>
        </Container>
      )}
    </Container>
  );
}
