import {
  AppWindow,
  ArrowDownUp,
  Briefcase,
  CalendarDays,
  ChefHat,
  Hash,
  List,
  MapPin,
  Shapes,
  Tag,
} from 'lucide-react';
import { RESOURCE_SEARCH_DEFAULT_RADIUS_KM } from '@/config/pinakes';
import type { TFeedResourceFilterName, TFeedResourceFilters } from '@/models/feed/feed.schema';
import type { FilterListItem } from '@/molecules/Filters/Filters.types';
import { ROWS_ITEMS, SORT_ITEMS, WINDOW_LABELS } from '@/organisms/SearchResources/SearchResourceFilters';
import {
  getRadiusLabel,
  POSTINGS_ITEMS,
  REMOTE_ITEMS,
  WHEN_ITEMS,
} from '@/organisms/SearchResources/SearchResourceKindFilters';
import {
  getResourceCategoryLabel,
  getResourceServices,
  RESOURCE_SEARCH_TRENDING_WINDOW,
  type TResourceSearchSort,
  type TResourceTrendingWindow,
} from '@/pipes/resource/resource.search';
import type { TPinakesHostFacet } from '@/services/pinakes/pinakes.types';

/**
 * A saved filter as one row of the feed's filter list: the section it is on Search, and its value.
 * `isLoading`: its value is being read (the services' names), so the label is the section alone.
 */
export type TFeedResourceFilterRow = {
  name: TFeedResourceFilterName;
  label: string;
  icon: FilterListItem['icon'];
  isLoading?: boolean;
};

/** The panel's order for a saved one (`nearest` is Search's Nearest). */
const SEARCH_SORTS: Record<string, TResourceSearchSort> = {
  trending: 'trending',
  upcoming: 'upcoming',
  nearest: 'distance',
};

/** A saved value as its option on Search reads (a value the panel has no option for: as spelled, with the section's icon). */
const toOption = (items: readonly FilterListItem[], key: string, icon: FilterListItem['icon']) =>
  items.find((item) => item.key === key) ?? { label: key, icon };

const SORT_OPTIONS: FilterListItem[] = Object.entries(SORT_ITEMS).map(([key, item]) => ({ key, ...item }));

/**
 * The saved filters as rows (When, Where, Category…), each read with the label and icon Search's filter
 * panel gives it; the place's name, the distance and the trending window read with the row they
 * belong to. The services read by name, each once, as the Service filter lists them, from `hostFacets`
 * (Pinakes' host facet of a search on them); while that read is on its way (`isNamingHosts`), the
 * row names the services known and is loading for the others rather than naming a host, and once it
 * ended, a host it does not name reads as itself.
 */
export function getFeedResourceFilterRows(
  filters: TFeedResourceFilters | null | undefined,
  hostFacets?: readonly TPinakesHostFacet[] | null,
  isNamingHosts = false,
): TFeedResourceFilterRow[] {
  if (!filters) return [];
  const rows: TFeedResourceFilterRow[] = [];
  const row = (name: TFeedResourceFilterName, title: string, { label, icon }: Omit<FilterListItem, 'key'>) =>
    rows.push({ name, label: `${title}: ${label}`, icon });
  // Every type but the kinds': the Kind filter's More kinds
  if (filters.exclude_types) row('exclude_types', 'Kind', { label: 'More kinds', icon: Shapes });
  const dates = toOption(WHEN_ITEMS, 'dates', CalendarDays);
  if (filters.when) row('when', 'When', toOption(WHEN_ITEMS, filters.when, dates.icon));
  else if (filters.from || filters.to) {
    const label =
      filters.from && filters.to
        ? `${filters.from} – ${filters.to}`
        : filters.from
          ? `From ${filters.from}`
          : `Until ${filters.to}`;
    row(filters.from ? 'from' : 'to', 'When', { label, icon: dates.icon });
  }
  if (filters.near) {
    const radius = getRadiusLabel(filters.radius ?? RESOURCE_SEARCH_DEFAULT_RADIUS_KM);
    row('near', 'Where', { label: `${filters.place ?? filters.near} · ${radius}`, icon: MapPin });
  }
  if (filters.category) row('category', 'Category', { label: getResourceCategoryLabel(filters.category), icon: Tag });
  if (filters.host) {
    const hosts = filters.host.split(',');
    const isNamed = (host: string) => hostFacets?.some((facet) => facet.host === host) ?? false;
    const services = getResourceServices(hostFacets, hosts);
    const nameOf = (host: string) => services.find((service) => service.hosts.includes(host))?.name ?? host;
    if (isNamingHosts && !hosts.every(isNamed)) {
      // The names known, then a skeleton for the others: a host is never shown as a name meanwhile
      const names = [...new Set(hosts.filter(isNamed).map(nameOf))];
      const label = names.length > 0 ? `Service: ${names.join(', ')},` : 'Service:';
      rows.push({ name: 'host', label, icon: AppWindow, isLoading: true });
    } else {
      row('host', 'Service', { label: [...new Set(hosts.map(nameOf))].join(', '), icon: AppWindow });
    }
  }
  if (filters.key) row('key', 'Identifier', { label: filters.key, icon: Hash });
  if (filters.remote) row('remote', 'Remote', toOption(REMOTE_ITEMS, filters.remote, Briefcase));
  if (filters.closed) row('closed', 'Postings', toOption(POSTINGS_ITEMS, 'closed', Briefcase));
  if (filters.ingredients) {
    row('ingredients', 'Ingredients', { label: filters.ingredients.split(',').join(', '), icon: ChefHat });
  }
  if (filters.sort) {
    const sort = toOption(SORT_OPTIONS, SEARCH_SORTS[filters.sort] ?? filters.sort, ArrowDownUp);
    const window = filters.window ?? RESOURCE_SEARCH_TRENDING_WINDOW;
    const windowLabel = WINDOW_LABELS[window as TResourceTrendingWindow] ?? window;
    row('sort', 'Sort', filters.sort === 'trending' ? { ...sort, label: `${sort.label} · ${windowLabel}` } : sort);
  }
  if (filters.rows) row('rows', 'Rows', toOption(ROWS_ITEMS, filters.rows, List));
  return rows;
}
