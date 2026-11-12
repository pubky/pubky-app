'use client';
import { Shapes } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Label } from '@/atoms/Label/Label';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { isPinakesReachSetServed } from '@/config/pinakes';
import { useCustomFeed } from '@/hooks/useCustomFeed/useCustomFeed';
import { useCustomResourceFeed } from '@/hooks/useCustomResourceFeed/useCustomResourceFeed';
import { FilterContent } from '@/molecules/Filters/FilterContent/FilterContent';
import { FilterLayout } from '@/molecules/Filters/FilterLayout/FilterLayout';
import { FilterRadioGroup } from '@/molecules/Filters/FilterRadioGroup/FilterRadioGroup';
import { FilterReach } from '@/molecules/Filters/FilterReach/FilterReach';
import { FilterSort } from '@/molecules/Filters/FilterSort/FilterSort';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { SearchResourceFilters } from '@/organisms/SearchResources/SearchResourceFilters';
import { getResourceTypesLabel, toResourceSearchReach } from '@/pipes/resource/resource.search';
import { type ReachFilterValue } from '@/stores/home/home.types';
import { CONTENT, REACH } from '@/stores/home/home.types';
import {
  pubkyLayoutToHomeLayout,
  pubkyPostKindToHomeContent,
  pubkyReachToHomeReach,
  pubkySortToHomeSort,
} from '@/utils/pubky-app-spec-feed-mappers';

/**
 * The reaches a feed of external resources has no counterpart for: not listed (it reads as All). My
 * network is one unless the configured Pinakes serves reach sets (`wot_2`).
 */
const RESOURCE_HIDDEN_REACHES: readonly ReachFilterValue[] = [TAGGED_AS_FILTER_KEY, REACH.ME];
const RESOURCE_HIDDEN_REACHES_WITHOUT_NETWORK: readonly ReachFilterValue[] = [
  REACH.NETWORK,
  ...RESOURCE_HIDDEN_REACHES,
];

interface CustomFeedFiltersProps {
  variant: 'sidebar' | 'drawer';
}

/**
 * The filters of the custom feed on screen, read-only as the feed saved them; a feed of external
 * resources has Search's resource filters (`SearchResourceFilters`) under its reach and tags, which
 * start as the feed's saved types and filters and change what it lists in the URL only (Edit feed
 * saves them).
 */
export function CustomFeedFilters({ variant }: CustomFeedFiltersProps) {
  const customFeed = useCustomFeed();
  const { feed: resourceFeed, isReady: isResourceFeedReady } = useCustomResourceFeed();
  const reach: ReachFilterValue | undefined =
    customFeed?.reach === 'wot' && customFeed.domain_tags.length > 0
      ? TAGGED_AS_FILTER_KEY
      : customFeed?.reach !== undefined
        ? pubkyReachToHomeReach(customFeed.reach)
        : undefined;
  const isResourceFeed = customFeed?.target === 'resources';
  // A reach another client stored that the resource search has none for, Tagged as included, reads as
  // everyone's
  const resourceReach =
    isResourceFeed && customFeed && (reach === TAGGED_AS_FILTER_KEY || toResourceSearchReach(customFeed.reach) === null)
      ? REACH.ALL
      : reach;
  const resourceHiddenReaches = isPinakesReachSetServed()
    ? RESOURCE_HIDDEN_REACHES
    : RESOURCE_HIDDEN_REACHES_WITHOUT_NETWORK;
  const sort = customFeed?.sort !== undefined ? pubkySortToHomeSort(customFeed.sort) : undefined;
  const layout = customFeed?.layout !== undefined ? pubkyLayoutToHomeLayout(customFeed.layout) : undefined;
  const content = isResourceFeed
    ? CONTENT.RESOURCES
    : customFeed?.content === null
      ? CONTENT.ALL
      : customFeed?.content !== undefined
        ? pubkyPostKindToHomeContent(customFeed.content)
        : undefined;

  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      <FilterReach
        selectedTab={resourceReach}
        defaultSelectedTab={undefined}
        disabled
        showTaggedAs
        hiddenTabs={isResourceFeed ? resourceHiddenReaches : undefined}
      />

      {customFeed?.tags.length ? (
        <Container
          overrideDefaults
          className="flex flex-col gap-2"
          data-testid="custom-feed-post-tags"
          data-cy="custom-feed-post-tags"
        >
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">
            {customFeed.target === 'resources' ? 'Filter on Tags' : 'Filter on Content Tags'}
          </Label>
          <Container overrideDefaults className="flex flex-wrap gap-2">
            {customFeed.tags.map((tag) => (
              <PostTag key={tag} label={tag} aria-disabled tabIndex={-1} />
            ))}
          </Container>
        </Container>
      ) : null}

      {resourceFeed?.types && (
        // Types of several kinds (another client's), which the Kind filter cannot show: read-only
        <FilterRadioGroup
          title="Type"
          items={[{ key: 'types', label: getResourceTypesLabel(resourceFeed.types), icon: Shapes, disabled: true }]}
          selectedValue="types"
          testId="custom-feed-resource-types"
        />
      )}
      {resourceFeed && isResourceFeedReady && <SearchResourceFilters feed={resourceFeed} />}

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

      {!isResourceFeed && <FilterSort selectedTab={sort} defaultSelectedTab={undefined} disabled />}

      {variant === 'sidebar' ? (
        <Container overrideDefaults className="sticky top-[100px] flex w-full flex-col gap-6 self-start">
          <FilterLayout
            selectedTab={layout}
            defaultSelectedTab={undefined}
            disabled
            showVisual={!isResourceFeed}
            showCards
          />

          <FilterContent selectedTab={content} defaultSelectedTab={undefined} disabled />
        </Container>
      ) : (
        <>
          <FilterLayout
            selectedTab={layout}
            defaultSelectedTab={undefined}
            disabled
            showVisual={!isResourceFeed}
            showCards
          />

          <FilterContent selectedTab={content} defaultSelectedTab={undefined} disabled />
        </>
      )}
    </Container>
  );
}
