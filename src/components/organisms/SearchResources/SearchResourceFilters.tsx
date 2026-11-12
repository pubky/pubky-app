'use client';

import * as React from 'react';
import {
  BookOpen,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ChefHat,
  Clock,
  Code,
  Film,
  Flame,
  GraduationCap,
  Layers,
  LayoutGrid,
  List,
  LocateFixed,
  MapPin,
  Music,
  Newspaper,
  Package,
  Podcast,
  Scale,
  ScrollText,
  Shapes,
  SquareAsterisk,
  Tag,
  Tags,
  TextSearch,
  TrendingUp,
} from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import {
  FilterHeader,
  FilterItem,
  FilterItemCheck,
  FilterItemIcon,
  FilterItemLabel,
  FilterList,
  FilterRoot,
} from '@/atoms/Filter/Filter';
import { RESOURCE_KINDS, RESOURCE_MORE_KINDS, RESOURCE_TRENDING_WINDOWS } from '@/config/pinakes';
import { toKindAndTypes } from '@/hooks/useCustomResourceFeed/useCustomResourceFeed.utils';
import { useResourceSearch } from '@/hooks/useResourceSearch/useResourceSearch';
import { pickResourceKind, useResourceSearchFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import {
  type TResourceFeedSearch,
  useSearchResourceQuery,
} from '@/hooks/useSearchResourceQuery/useSearchResourceQuery';
import { FilterRadioGroup } from '@/molecules/Filters/FilterRadioGroup/FilterRadioGroup';
import type { FilterListItem } from '@/molecules/Filters/Filters.types';
import { SearchResourceKindFilters } from '@/organisms/SearchResources/SearchResourceKindFilters';
import {
  getResourceSubKinds,
  getResourceTypeLabel,
  RESOURCE_SEARCH_MAX_TYPES,
  rollUpResourceKinds,
  type TResourceQuery,
  type TResourceSearchSort,
  type TResourceTrendingWindow,
} from '@/pipes/resource/resource.search';

/** A search without its services: the one whose services the Service rows list. */
function withoutHosts(query: TResourceQuery): TResourceQuery {
  const search = { ...query };
  delete search.hosts;
  return search;
}

/** The Kind row that clears the kind. */
const EVERY_KIND = 'all';

export const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  music: Music,
  video: Film,
  podcast: Podcast,
  event: CalendarDays,
  place: MapPin,
  book: BookOpen,
  paper: ScrollText,
  article: Newspaper,
  software: Code,
  learning: GraduationCap,
  law: Scale,
  job: Briefcase,
  recipe: ChefHat,
  product: Package,
  [RESOURCE_MORE_KINDS]: Shapes,
};

export const SORT_ITEMS: Record<TResourceSearchSort, Omit<FilterListItem<TResourceSearchSort>, 'key'>> = {
  relevance: { label: 'Relevance', icon: TextSearch },
  activity: { label: 'Popular', icon: Flame },
  trending: { label: 'Trending', icon: TrendingUp },
  recent: { label: 'Recent', icon: SquareAsterisk },
  upcoming: { label: 'Upcoming', icon: CalendarClock },
  distance: { label: 'Nearest', icon: LocateFixed },
};

export const WINDOW_LABELS: Record<TResourceTrendingWindow, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

export const ROWS_ITEMS: FilterListItem<'group' | 'links'>[] = [
  { key: 'group', label: 'One per thing', icon: Layers },
  { key: 'links', label: 'Every link', icon: List },
];

/**
 * Type: the picked kind's sub-kinds (Songs, Albums, Cafés…) with their links, in the panel's own
 * rows; several can be picked, up to the types one search takes. All types clears them (for More
 * kinds: every type no kind stands for).
 */
function TypeSection({
  kind,
  subKinds,
  picked,
  onChange,
}: {
  kind: string;
  subKinds: { type: string; count: number }[];
  picked: string[];
  onChange: (types: string[]) => void;
}) {
  const headerId = React.useId();
  const icon = KIND_ICONS[kind] ?? Shapes;
  const isFull = picked.length >= RESOURCE_SEARCH_MAX_TYPES;
  return (
    <FilterRoot data-testid="filter-resource-type">
      <FilterHeader title="Type" id={headerId} />
      <FilterList role="group" aria-labelledby={headerId} data-testid="search-resource-kinds">
        <FilterItem isSelected={picked.length === 0} onClick={() => onChange([])} data-testid="resource-type-all">
          <FilterItemIcon icon={icon} />
          <FilterItemLabel>{'All types'}</FilterItemLabel>
          {picked.length === 0 && <FilterItemCheck />}
        </FilterItem>
        {subKinds.map(({ type, count }) => {
          const isPicked = picked.includes(type);
          const isDisabled = !isPicked && isFull;
          const label = getResourceTypeLabel(type);
          return (
            <FilterItem
              key={type}
              isSelected={isPicked}
              onClick={() => {
                if (!isDisabled) onChange(isPicked ? picked.filter((one) => one !== type) : [...picked, type]);
              }}
              // Pinakes counts links, while the list shows one row per thing (its other links under Also on)
              aria-label={`${label}, ${count} links`}
              aria-disabled={isDisabled || undefined}
              className={isDisabled ? 'cursor-default opacity-40' : undefined}
              data-testid={`resource-type-${type}`}
            >
              <FilterItemIcon icon={icon} />
              <FilterItemLabel>{label}</FilterItemLabel>
              <FilterItemLabel className="text-muted-foreground" aria-hidden>
                {count}
              </FilterItemLabel>
              {isPicked && <FilterItemCheck />}
            </FilterItem>
          );
        })}
      </FilterList>
    </FilterRoot>
  );
}

/**
 * SearchResourceFilters
 *
 * The External resources filters of `/search`, as sections of the search's filter panel (sidebar
 * and drawer), in the panel's own radio groups and rows: Kind (each kind the search finds, with its
 * links, and More kinds), Type (the picked kind's sub-kinds, several at once), the picked kind's own
 * sections (`SearchResourceKindFilters`: Events When and Where, Places Category, a Service…), Sort
 * (Relevance for a text, Upcoming for Events, Nearest around a point), the Trending window, Tags (any
 * or all of the searched ones, where both apply) and Rows (one per thing or every link). Every choice
 * is kept in the URL (`useResourceSearchFilters`). A section or option the search cannot apply is
 * not shown. With `feed`, the same sections filter a feed's External resources (Home), on that feed's
 * search (`useSearchResourceQuery`'s `feed`).
 */
export function SearchResourceFilters({ feed }: { feed?: TResourceFeedSearch } = {}) {
  const { filters, setFilters } = useResourceSearchFilters();
  const { query, isPending, sort, defaultSort, sorts, typeFacets, canMatchAll, narrowTags, sections } =
    useSearchResourceQuery({ withKinds: true, feed });
  // Categories are counted by the tab's own read (the same request, shared); services by the same
  // search without the picked ones, so every service keeps its count while some are on (the tab's own
  // read while none is)
  const results = useResourceSearch(sections.includes('category') ? query : null, { facets: true });
  const services = useResourceSearch(sections.includes('service') && query ? withoutHosts(query) : null, {
    facets: true,
  });
  // Any or all of the searched tags, where both apply: related tags picked to narrow the search make
  // every tag match, and all of them works with up to 3 tags; otherwise the one that applies is used
  const showMatch = canMatchAll && narrowTags.length === 0;
  const foundSubKinds = filters.kind && typeFacets ? getResourceSubKinds(filters.kind, typeFacets) : [];
  // On a custom feed of sub-kinds, its saved ones (under their kind) and the picked types stay offered
  // when this search finds none of them (or its types failed): they filter the list, so they are seen
  const savedSubKinds = feed?.subKinds && toKindAndTypes(feed.subKinds)?.kind === filters.kind ? feed.subKinds : [];
  const keptTypes = feed?.subKinds ? [...savedSubKinds, ...filters.types] : [];
  const subKinds = [
    ...foundSubKinds,
    ...[...new Set(keptTypes)]
      .filter((type) => !foundSubKinds.some((found) => found.type === type))
      .map((type) => ({ type, count: 0 })),
  ];
  const kinds = rollUpResourceKinds(typeFacets ?? []);
  // The picked kind stays offered when this search finds none of it
  const shownKinds =
    filters.kind && !kinds.some((kind) => kind.id === filters.kind) ? [...kinds, { id: filters.kind }] : kinds;

  const kindItems: FilterListItem[] = [
    { key: EVERY_KIND, label: 'All kinds', icon: LayoutGrid },
    ...shownKinds.map((kind) => ({
      key: kind.id,
      label: RESOURCE_KINDS.find(({ id }) => id === kind.id)?.label ?? 'More kinds',
      icon: KIND_ICONS[kind.id] ?? Shapes,
      ...('count' in kind ? { count: kind.count } : {}),
    })),
  ];

  return (
    <Container overrideDefaults className="flex flex-col gap-6" data-testid="search-resource-filters">
      <FilterRadioGroup
        title="Kind"
        items={kindItems}
        selectedValue={filters.kind ?? EVERY_KIND}
        onChange={(key) => setFilters(pickResourceKind(filters, key === EVERY_KIND ? null : key))}
        testId="filter-resource-kind-radiogroup"
      />
      {filters.kind && subKinds.length > 0 && (
        <TypeSection
          kind={filters.kind}
          subKinds={subKinds}
          picked={filters.types}
          onChange={(types) => setFilters({ types })}
        />
      )}
      {sections.length > 0 && (
        <SearchResourceKindFilters
          sections={sections}
          hostFacets={services.hostFacets}
          // Also while the search waits for its types: the services are read once it has them
          hostFacetsLoading={services.loading || isPending}
          categoryFacets={results.categoryFacets}
        />
      )}
      {sorts.length > 0 && (
        <FilterRadioGroup<TResourceSearchSort>
          title="Sort"
          items={sorts.map((key) => ({ key, ...SORT_ITEMS[key] }))}
          selectedValue={sort}
          onChange={(key) => setFilters({ sort: key === defaultSort ? null : key })}
          testId="filter-resource-sort-radiogroup"
        />
      )}
      {sort === 'trending' && (
        <FilterRadioGroup<TResourceTrendingWindow>
          title="Trending"
          items={RESOURCE_TRENDING_WINDOWS.map((key) => ({ key, label: WINDOW_LABELS[key], icon: Clock }))}
          selectedValue={filters.window}
          onChange={(key) => setFilters({ window: key })}
          testId="filter-resource-window-radiogroup"
        />
      )}
      {showMatch && (
        <FilterRadioGroup<'any' | 'all'>
          title="Tags"
          items={[
            { key: 'any', label: 'Any tag', icon: Tag },
            { key: 'all', label: 'All tags', icon: Tags },
          ]}
          selectedValue={filters.match === 'all' ? 'all' : 'any'}
          onChange={(key) => setFilters({ match: key })}
          testId="filter-resource-match-radiogroup"
        />
      )}
      <FilterRadioGroup<'group' | 'links'>
        title="Rows"
        items={ROWS_ITEMS}
        selectedValue={filters.collapse ? 'group' : 'links'}
        onChange={(key) => setFilters({ collapse: key === 'group' })}
        testId="filter-resource-rows-radiogroup"
      />
    </Container>
  );
}
