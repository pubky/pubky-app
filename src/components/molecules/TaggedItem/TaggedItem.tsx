'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Tag } from '@/atoms/Tag/Tag';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { WhoTaggedExpandedList } from '../WhoTaggedExpandedList/WhoTaggedExpandedList';
import { MAX_VISIBLE_AVATARS } from './TaggedItem.constants';
import type { TaggedItemProps } from './TaggedItem.types';

export function TaggedItem({
  tag,
  onTagClick,
  onSearchClick,
  hideAvatars = false,
  isExpanded = false,
  onExpandToggle,
  expandedTaggerIds,
  isLoadingTaggers,
}: TaggedItemProps) {
  const router = useRouter();
  const { requireAuth } = useRequireAuth();
  const visibleTaggers = tag.taggers.slice(0, MAX_VISIBLE_AVATARS);
  const totalTaggersCount = tag.taggers_count ?? tag.taggers.length;
  const overflowCount = Math.max(0, totalTaggersCount - MAX_VISIBLE_AVATARS);
  const handleTagClick = () => {
    onTagClick(tag);
  };
  const handleSearchClick = () => {
    requireAuth(() => {
      if (onSearchClick) {
        onSearchClick();
      } else {
        // Default behavior: navigate to search with tag filter
        const searchParams = new URLSearchParams();
        searchParams.set('tags', tag.label);
        router.push(`${APP_ROUTES.SEARCH}?${searchParams.toString()}`);
      }
    });
  };
  const handleAvatarGroupClick = () => {
    onExpandToggle?.(tag.label);
  };
  return (
    <Container overrideDefaults={true} className="flex flex-col gap-2">
      {/* Tag row with tag badge, search button, and avatar group */}
      <Container overrideDefaults={true} className="flex items-center gap-2">
        {/* Tag badge with count - clickable to toggle */}
        <Tag
          name={tag.label}
          count={tag.taggers_count}
          clicked={!!tag.relationship}
          onClick={handleTagClick}
          className="cursor-pointer transition-opacity hover:opacity-80"
        />

        {/* Search button */}
        <Button variant="secondary" className="size-8" onClick={handleSearchClick}>
          <Search size={16} className="text-secondary-foreground" />
        </Button>

        {/* Avatar group - clickable to expand user list */}
        {!hideAvatars && tag.taggers.length > 0 && (
          <Button
            overrideDefaults
            onClick={handleAvatarGroupClick}
            className="flex cursor-pointer items-center pr-2 transition-opacity hover:opacity-80"
            aria-expanded={isExpanded}
            aria-label={`Show ${tag.taggers_count} users who tagged`}
          >
            {visibleTaggers.map((tagger, index) => (
              <AvatarWithFallback
                key={tagger.id}
                name={
                  tagger.name ||
                  formatPublicKey({
                    key: tagger.id,
                  })
                }
                avatarUrl={tagger.avatarUrl}
                fallbackSeed={tagger.id}
                size="md"
                className={cn('shrink-0', index > 0 && '-ml-2')}
              />
            ))}
            {overflowCount > 0 && (
              <Container
                overrideDefaults={true}
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-full border border-muted-foreground bg-background shadow-sm',
                  'size-8 text-xs font-medium text-foreground',
                  visibleTaggers.length > 0 && 'z-10 -ml-2',
                )}
              >
                +{overflowCount}
              </Container>
            )}
          </Button>
        )}
      </Container>

      {/* Expanded user list */}
      {isExpanded && !hideAvatars && (
        <WhoTaggedExpandedList
          taggerIds={expandedTaggerIds ?? tag.taggers.map((tagger) => tagger.id)}
          fallbackTaggers={tag.taggers}
          isLoadingTaggers={isLoadingTaggers}
        />
      )}
    </Container>
  );
}
