'use client';
import { PubkyAppFeedReach } from 'pubky-app-specs';
import { Container } from '@/atoms/Container/Container';
import { Label } from '@/atoms/Label/Label';
import { useCustomFeed } from '@/hooks/useCustomFeed/useCustomFeed';
import { FilterContent } from '@/molecules/Filters/FilterContent/FilterContent';
import { FilterLayout } from '@/molecules/Filters/FilterLayout/FilterLayout';
import { FilterReach, type ReachFilterValue, TAGGED_AS_FILTER_KEY } from '@/molecules/Filters/FilterReach/FilterReach';
import { FilterSort } from '@/molecules/Filters/FilterSort/FilterSort';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { CONTENT } from '@/stores/home/home.types';
import {
  pubkyLayoutToHomeLayout,
  pubkyPostKindToHomeContent,
  pubkyReachToHomeReach,
  pubkySortToHomeSort,
} from '@/utils/pubky-app-spec-feed-mappers';

interface CustomFeedFiltersProps {
  variant: 'sidebar' | 'drawer';
}

export function CustomFeedFilters({ variant }: CustomFeedFiltersProps) {
  const customFeed = useCustomFeed();
  const reach: ReachFilterValue | undefined =
    customFeed?.reach === PubkyAppFeedReach.Wot && customFeed.domain_tags.length > 0
      ? TAGGED_AS_FILTER_KEY
      : customFeed?.reach !== undefined
        ? pubkyReachToHomeReach(customFeed.reach)
        : undefined;
  const sort = customFeed?.sort !== undefined ? pubkySortToHomeSort(customFeed.sort) : undefined;
  const layout = customFeed?.layout !== undefined ? pubkyLayoutToHomeLayout(customFeed.layout) : undefined;
  const content =
    customFeed?.content === null
      ? CONTENT.ALL
      : customFeed?.content !== undefined
        ? pubkyPostKindToHomeContent(customFeed.content)
        : undefined;

  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      <FilterReach selectedTab={reach} defaultSelectedTab={undefined} disabled showTaggedAs />

      {customFeed?.tags.length ? (
        <Container overrideDefaults className="flex flex-col gap-2" data-testid="custom-feed-post-tags">
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Filter on Content Tags'}</Label>
          <Container overrideDefaults className="flex flex-wrap gap-2">
            {customFeed.tags.map((tag) => (
              <PostTag key={tag} label={tag} aria-disabled tabIndex={-1} />
            ))}
          </Container>
        </Container>
      ) : null}

      {customFeed?.domain_tags.length ? (
        <Container overrideDefaults className="flex flex-col gap-2" data-testid="custom-feed-profile-tags">
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Profile Tags'}</Label>
          <Container overrideDefaults className="flex flex-wrap gap-2">
            {customFeed.domain_tags.map((tag) => (
              <PostTag key={tag} label={tag} aria-disabled tabIndex={-1} />
            ))}
          </Container>
        </Container>
      ) : null}

      <FilterSort selectedTab={sort} defaultSelectedTab={undefined} disabled />

      {variant === 'sidebar' ? (
        <Container overrideDefaults className="sticky top-[100px] flex w-full flex-col gap-6 self-start">
          <FilterLayout selectedTab={layout} defaultSelectedTab={undefined} disabled showVisual />

          <FilterContent selectedTab={content} defaultSelectedTab={undefined} disabled />
        </Container>
      ) : (
        <>
          <FilterLayout selectedTab={layout} defaultSelectedTab={undefined} disabled showVisual />

          <FilterContent selectedTab={content} defaultSelectedTab={undefined} disabled />
        </>
      )}
    </Container>
  );
}
