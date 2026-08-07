'use client';

import { useRouter } from 'next/navigation';
import { Tag as TagIcon } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Tag } from '@/atoms/Tag/Tag';
import { Typography } from '@/atoms/Typography/Typography';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { SidebarSection } from '@/molecules/SidebarSection/SidebarSection';
import { MAX_TAGS } from './HotTags.constants';
import { HotTagsSkeleton } from './HotTags.skeleton';
import type { HotTagsProps } from './HotTags.types';

/**
 * HotTags
 *
 * Sidebar section showing trending tags.
 * Fetches tags via useHotTags hook and handles navigation.
 *
 * Note: This is an Organism because it interacts with data hooks (useHotTags)
 * and handles routing.
 */
export function HotTags({ className }: HotTagsProps) {
  const router = useRouter();
  const { tags, isLoading } = useHotTags();
  const displayTags = tags.slice(0, MAX_TAGS);
  const handleTagClick = (tagName: string) => {
    router.push(`${APP_ROUTES.SEARCH}?tags=${encodeURIComponent(tagName)}`);
  };
  const handleSeeAll = () => {
    router.push(APP_ROUTES.HOT);
  };
  return (
    <SidebarSection
      title={'Hot tags'}
      footerIcon={TagIcon}
      footerText={'Explore all'}
      onFooterClick={handleSeeAll}
      footerTestId="see-all-button"
      className={className}
      data-testid="hot-tags"
      dataCy="hot-tags"
    >
      {isLoading ? (
        <HotTagsSkeleton />
      ) : displayTags.length === 0 ? (
        <Typography className="font-light text-muted-foreground">{'No tags to show'}</Typography>
      ) : (
        <Container overrideDefaults className="flex w-full flex-col gap-2" data-cy="hot-tags-list">
          {displayTags.map((tag, index) => (
            <Tag
              key={tag.name}
              name={tag.name}
              count={tag.count}
              onClick={handleTagClick}
              data-testid={`tag-${index}`}
            />
          ))}
        </Container>
      )}
    </SidebarSection>
  );
}
