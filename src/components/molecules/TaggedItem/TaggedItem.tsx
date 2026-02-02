'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import * as Hooks from '@/hooks';
import { useRouter } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';
import type { TaggedItemProps } from './TaggedItem.types';
import { MAX_VISIBLE_AVATARS } from './TaggedItem.constants';

export function TaggedItem({
  tag,
  onTagClick,
  onSearchClick,
  hideAvatars = false,
  isExpanded = false,
  onExpandToggle,
}: TaggedItemProps) {
  const router = useRouter();
  const { requireAuth } = Hooks.useRequireAuth();
  const visibleTaggers = tag.taggers.slice(0, MAX_VISIBLE_AVATARS);
  const overflowCount = tag.taggers.length - MAX_VISIBLE_AVATARS;

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
    <Atoms.Container overrideDefaults={true} className="flex flex-col gap-2">
      {/* Tag row with tag badge, search button, and avatar group */}
      <Atoms.Container overrideDefaults={true} className="flex items-center gap-2">
        {/* Tag badge with count - clickable to toggle */}
        <Atoms.Tag
          name={tag.label}
          count={tag.taggers_count}
          clicked={!!tag.relationship}
          onClick={handleTagClick}
          className="max-w-(--tag-max-width) cursor-pointer transition-opacity hover:opacity-80"
        />

        {/* Search button */}
        <Atoms.Button variant="secondary" size="icon" onClick={handleSearchClick}>
          <Libs.Search size={16} className="text-secondary-foreground" />
        </Atoms.Button>

        {/* Avatar group - clickable to expand user list */}
        {!hideAvatars && tag.taggers.length > 0 && (
          <Atoms.Button
            overrideDefaults
            onClick={handleAvatarGroupClick}
            className="flex cursor-pointer items-center pr-2 transition-opacity hover:opacity-80"
            aria-expanded={isExpanded}
            aria-label={`Show ${tag.taggers_count} users who tagged`}
          >
            {visibleTaggers.map((tagger, index) => (
              <Organisms.AvatarWithFallback
                key={tagger.id}
                name={tagger.name || Libs.formatPublicKey({ key: tagger.id })}
                avatarUrl={tagger.avatarUrl}
                size="md"
                className={Libs.cn('shrink-0', index > 0 && '-ml-2')}
              />
            ))}
            {overflowCount > 0 && (
              <Atoms.Container
                overrideDefaults={true}
                className={Libs.cn(
                  'flex shrink-0 items-center justify-center rounded-full bg-background shadow-sm',
                  'size-8 text-xs font-medium text-foreground',
                  visibleTaggers.length > 0 && '-ml-2',
                )}
              >
                +{overflowCount}
              </Atoms.Container>
            )}
          </Atoms.Button>
        )}
      </Atoms.Container>

      {/* Expanded user list */}
      {isExpanded && !hideAvatars && <Molecules.WhoTaggedExpandedList taggers={tag.taggers} />}
    </Atoms.Container>
  );
}
