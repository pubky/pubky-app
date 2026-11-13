'use client';

import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import {
  AppWindow,
  Archive,
  Briefcase,
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChefHat,
  CircleCheck,
  Globe,
  Hash,
  History,
  House,
  LocateFixed,
  MapPin,
  Ruler,
  Sun,
  Tag,
  X,
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
import { Input } from '@/atoms/Input/Input';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import {
  RESOURCE_KIND_IDENTIFIERS,
  RESOURCE_SEARCH_DEFAULT_RADIUS_KM,
  RESOURCE_SEARCH_FACETS_SHOWN,
  RESOURCE_SEARCH_MAX_INGREDIENTS,
  RESOURCE_SEARCH_RADII_KM,
  type TResourceIdentifier,
  type TResourceKindSection,
} from '@/config/pinakes';
import { useResourcePlaces } from '@/hooks/useResourcePlaces/useResourcePlaces';
import { useResourceSearchFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import { FilterRadioGroup } from '@/molecules/Filters/FilterRadioGroup/FilterRadioGroup';
import type { FilterListItem } from '@/molecules/Filters/Filters.types';
import { ResourceSourceIcon } from '@/molecules/ResourceCard/ResourceSourceIcon';
import {
  getResourceCategoryLabel,
  getResourceServices,
  parseResourceIdentifier,
  parseResourceIngredient,
  RESOURCE_SEARCH_MAX_HOSTS,
  type TResourceEventWhen,
  withKnownHostNames,
} from '@/pipes/resource/resource.search';
import type { TPinakesCategoryFacet, TPinakesHostFacet } from '@/services/pinakes/pinakes.types';

/** The row that clears a one-of-many filter (any category). */
const ANY = 'any';

export const WHEN_ITEMS: FilterListItem<TResourceEventWhen>[] = [
  { key: 'upcoming', label: 'Upcoming', icon: CalendarClock },
  { key: 'today', label: 'Today', icon: Sun },
  { key: 'weekend', label: 'This weekend', icon: CalendarDays },
  { key: 'week', label: 'This week', icon: CalendarRange },
  { key: 'month', label: 'This month', icon: Calendar },
  { key: 'past', label: 'Past', icon: History },
  { key: 'dates', label: 'Dates', icon: CalendarDays },
];

export const REMOTE_ITEMS: FilterListItem<'any' | 'yes' | 'no'>[] = [
  { key: 'any', label: 'Any', icon: Briefcase },
  { key: 'yes', label: 'Remote', icon: House },
  { key: 'no', label: 'On site', icon: Building2 },
];

export const POSTINGS_ITEMS: FilterListItem<'open' | 'closed'>[] = [
  { key: 'open', label: 'Open only', icon: CircleCheck },
  { key: 'closed', label: 'Include closed', icon: Archive },
];

/** How a distance around a point reads. */
export const getRadiusLabel = (km: number | string) => `Within ${km} km`;

const IDENTIFIER_NAMES: Record<TResourceIdentifier, string> = {
  isrc: 'ISRC',
  upc: 'UPC',
  mbid: 'MBID',
  isbn: 'ISBN',
  doi: 'DOI',
};

/** Names as a list: `ISRC, UPC or MBID`. */
const orList = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : (names[0] ?? '');

/** The viewer's own location is kept to about a kilometre: it goes into a URL that may be shared. */
const roundOwnLocation = (value: number) => Math.round(value * 100) / 100;

/** How long Near me waits for the browser at most: a permission prompt left open may never answer. */
const LOCATING_TIMEOUT_MS = 15_000;

/**
 * The point Near me set in this session: a point without a place name in a URL someone shared is
 * their location, not the viewer's, so it reads as a shared location instead. Kept outside React so
 * it outlives the drawer; it is read while rendering, which is safe because it only changes together
 * with the URL's `near` (a new object each render), never on its own.
 */
let ownLocation: { lat: number; lon: number } | null = null;
const isOwnLocation = (point: { lat: number; lon: number } | null) =>
  point !== null && ownLocation !== null && point.lat === ownLocation.lat && point.lon === ownLocation.lon;

/** A value a section holds, as the panel's own row: pressing it removes the value. */
export function RemovableRow({
  icon,
  label,
  isLoading = false,
  onRemove,
  testId,
}: {
  icon: FilterListItem['icon'];
  label: string;
  /** Its value is being read: a skeleton follows the label (after a comma when the label holds a value). */
  isLoading?: boolean;
  onRemove: () => void;
  testId?: string;
}) {
  return (
    <FilterItem
      isSelected
      // An action, not a toggle
      aria-pressed={undefined}
      aria-label={isLoading ? `Remove ${label} (loading)` : `Remove ${label}`}
      aria-busy={isLoading || undefined}
      onClick={onRemove}
      data-testid={testId}
    >
      <FilterItemIcon icon={icon} />
      <FilterItemLabel className="truncate" title={label}>
        {label}
        {/* More of the list follows: shown, not read (the row is named loading) */}
        {isLoading && !label.endsWith(':') && <span aria-hidden>{','}</span>}
      </FilterItemLabel>
      {isLoading && <Skeleton className="h-4 w-24" data-testid="removable-row-skeleton" />}
      <FilterItemIcon icon={X} className="ml-auto shrink-0" />
    </FilterItem>
  );
}

/** A text box of a filter section: Enter (or the browser's submit) hands its value over. */
function SectionInput({
  label,
  placeholder,
  disabled,
  error,
  onSubmit,
  testId,
}: {
  label: string;
  placeholder: string;
  disabled?: boolean;
  /** Why the last value was not taken (shown by the section's subtitle, read with the box). */
  error?: string;
  onSubmit: (value: string) => boolean;
  testId: string;
}) {
  const [value, setValue] = useState('');
  const errorId = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (onSubmit(value)) setValue('');
  };
  return (
    <form onSubmit={submit} className="w-full">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        enterKeyHint="search"
        data-testid={testId}
      />
      <span id={errorId} role="status" className="sr-only">
        {error ?? ''}
      </span>
    </form>
  );
}

/** Where: anywhere, around the viewer (asked only on click), or around a place found by name; then how far. */
function WhereSection() {
  const { filters, setFilters } = useResourceSearchFilters();
  const [isPicking, setIsPicking] = useState(false);
  const [name, setName] = useState('');
  const [locationFailed, setLocationFailed] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const { places, loading, failed } = useResourcePlaces(isPicking ? name : '');
  const isOwn = isOwnLocation(filters.near);
  const selected = filters.near ? (isOwn && !filters.place ? 'me' : 'place') : isPicking ? 'place' : 'anywhere';
  // A point with no name is someone's shared location (or the viewer's from an earlier visit)
  const pointLabel =
    filters.place ?? (filters.near && !isOwn ? `Shared location (${filters.near.lat}, ${filters.near.lon})` : null);

  // The Near me request still awaited (its give-up timer): another Where choice, or leaving, drops it,
  // so a late answer never overrides what the viewer picked since
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropLocating = () => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    setIsLocating(false);
  };
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
    },
    [],
  );

  const askLocation = () => {
    if (isLocating) return;
    setLocationFailed(false);
    setIsPicking(false);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationFailed(true);
      return;
    }
    setIsLocating(true);
    const request = setTimeout(() => {
      if (pending.current !== request) return;
      dropLocating();
      setLocationFailed(true);
    }, LOCATING_TIMEOUT_MS);
    pending.current = request;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (pending.current !== request) return;
        dropLocating();
        ownLocation = { lat: roundOwnLocation(coords.latitude), lon: roundOwnLocation(coords.longitude) };
        setFilters({ near: ownLocation, place: null });
      },
      () => {
        if (pending.current !== request) return;
        dropLocating();
        setLocationFailed(true);
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const placePicker = selected === 'place' && (
    <Container overrideDefaults className="flex flex-col gap-2 py-1" data-testid="search-resource-place-picker">
      {pointLabel ? (
        <RemovableRow
          icon={MapPin}
          label={pointLabel}
          onRemove={() => setFilters({ near: null, place: null, radius: null })}
          testId="search-resource-place"
        />
      ) : (
        <>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="City, venue, address"
            aria-label="Find a place"
            data-testid="search-resource-place-input"
          />
          <span role="status" className="sr-only">
            {loading || name.trim().length < 2
              ? ''
              : failed
                ? 'Places could not be read.'
                : places.length === 1
                  ? '1 place found'
                  : `${places.length} places found`}
          </span>
          {(places.length > 0 || failed || (!loading && name.trim().length >= 2)) && (
            <FilterList role="group" aria-label="Places found">
              {places.map((place) => (
                <FilterItem
                  key={place.id}
                  // An action, not a toggle
                  aria-pressed={undefined}
                  onClick={() => {
                    setFilters({ near: place.point, place: place.name });
                    setIsPicking(false);
                    setName('');
                  }}
                  data-testid="search-resource-place-option"
                >
                  <FilterItemIcon icon={MapPin} />
                  <FilterItemLabel className="truncate">{place.name}</FilterItemLabel>
                </FilterItem>
              ))}
              {places.length === 0 && (
                <FilterItemLabel className="text-muted-foreground">
                  {failed ? 'Places could not be read.' : 'No place by that name.'}
                </FilterItemLabel>
              )}
            </FilterList>
          )}
        </>
      )}
    </Container>
  );

  return (
    <>
      <span role="status" className="sr-only">
        {isLocating ? 'Finding your location' : locationFailed ? 'Your location is not available.' : ''}
      </span>
      <FilterRadioGroup<'anywhere' | 'me' | 'place'>
        title="Where"
        subtitle={locationFailed ? 'Your location is not available.' : undefined}
        items={[
          { key: 'anywhere', label: 'Anywhere', icon: Globe },
          { key: 'me', label: 'Near me', icon: LocateFixed },
          { key: 'place', label: 'Near a place', icon: MapPin },
        ]}
        itemExtras={{ place: placePicker }}
        selectedValue={selected}
        onChange={(key) => {
          if (key === 'me') askLocation();
          else if (key === 'place') {
            dropLocating();
            setLocationFailed(false);
            setIsPicking(true);
            // A point of the viewer's own is no place: picking one starts from the name
            if (isOwn && !filters.place) setFilters({ near: null, radius: null });
          } else {
            dropLocating();
            setLocationFailed(false);
            setIsPicking(false);
            setFilters({ near: null, place: null, radius: null });
          }
        }}
        testId="filter-resource-where-radiogroup"
      />
      {filters.near && (
        <FilterRadioGroup<string>
          title="Distance"
          // A distance no option stands for (another client's 25 km) is its own row while picked
          items={[
            ...new Set<number>([...RESOURCE_SEARCH_RADII_KM, filters.radius ?? RESOURCE_SEARCH_DEFAULT_RADIUS_KM]),
          ]
            .sort((a, b) => a - b)
            .map((km) => ({ key: String(km), label: getRadiusLabel(km), icon: Ruler }))}
          selectedValue={String(filters.radius ?? RESOURCE_SEARCH_DEFAULT_RADIUS_KM)}
          onChange={(key) => setFilters({ radius: Number(key) })}
          testId="filter-resource-radius-radiogroup"
        />
      )}
    </>
  );
}

/**
 * A one-of-many filter read from a facet (categories): Any, then the most common ones with their
 * links; the picked one stays listed. Not shown before the facet is read, unless one is picked.
 */
function FacetSection({
  title,
  anyLabel,
  icon,
  options,
  selected,
  labelFor = (key) => key,
  onChange,
  testId,
}: {
  title: string;
  anyLabel: string;
  icon: FilterListItem['icon'];
  options: { key: string; label: string; count: number }[] | null;
  selected: string | null;
  /** How a picked one the facet does not list reads. */
  labelFor?: (key: string) => string;
  onChange: (key: string | null) => void;
  testId: string;
}) {
  const shown = (options ?? []).slice(0, RESOURCE_SEARCH_FACETS_SHOWN);
  if (selected && !shown.some((option) => option.key === selected)) {
    const picked = options?.find((option) => option.key === selected);
    shown.push(picked ?? { key: selected, label: labelFor(selected), count: 0 });
  }
  if (shown.length === 0) return null;
  return (
    <FilterRadioGroup
      title={title}
      items={[
        { key: ANY, label: anyLabel, icon },
        ...shown.map(({ key, label, count }) => ({ key, label, icon, count })),
      ]}
      selectedValue={selected ?? ANY}
      onChange={(key) => onChange(key === ANY ? null : key)}
      testId={testId}
    />
  );
}

/**
 * Service: the services the search finds (Any service, then the most common ones with their links),
 * several at once, as the Type rows: each row turns its service on or off and the others stay on;
 * Any service clears them. One row per service name, with all its hosts (`getResourceServices`) and
 * the service's icon as its cards show it. Picked ones stay listed. Not shown before the services are
 * read, unless one is picked: while they are read (`loading`), a picked one keeps the name the last
 * read gave it (a skeleton for its links), else shows its icon and a skeleton for its name, never its
 * host. A read that does not list a picked one counts no links for it, under the name an earlier read
 * gave it, else its host; after a failed read a host reads as itself.
 */
function ServiceSection({ facets, loading }: { facets: TPinakesHostFacet[] | null; loading: boolean }) {
  const { filters, setFilters } = useResourceSearchFilters();
  const headerId = useId();
  const picked = filters.hosts;
  const isOn = (hosts: readonly string[]) => hosts.some((host) => picked.includes(host));
  // The services the reads named: a name on screen stays while another search's are read, and after a
  // read that does not list a picked one
  const [known, setKnown] = useState({ facets, names: facets ?? [] });
  if (facets && facets !== known.facets) setKnown({ facets, names: withKnownHostNames(facets, known.names, picked) });
  const named = facets
    ? withKnownHostNames(facets, known.names, picked)
    : loading
      ? known.names.filter((facet) => picked.includes(facet.host))
      : null;
  // The most common ones, and every picked one
  const shown = getResourceServices(named, picked).filter(
    (service, index) => index < RESOURCE_SEARCH_FACETS_SHOWN || isOn(service.hosts),
  );
  // Its links are counted by the read on its way
  const isCounting = loading && facets === null;
  // Named by no read yet: its host is no name to show meanwhile
  const unnamed = loading ? shown.filter(({ hosts }) => !named?.some((facet) => hosts.includes(facet.host))) : [];
  if (shown.length === 0) return null;
  return (
    <FilterRoot data-testid="filter-resource-service">
      <FilterHeader title="Service" id={headerId} />
      <FilterList role="group" aria-labelledby={headerId} data-testid="search-resource-services">
        <FilterItem
          isSelected={picked.length === 0}
          onClick={() => setFilters({ hosts: [] })}
          data-testid="resource-service-any"
        >
          <FilterItemIcon icon={AppWindow} />
          <FilterItemLabel>{'Any service'}</FilterItemLabel>
          {picked.length === 0 && <FilterItemCheck />}
        </FilterItem>
        {shown.map((service) => {
          const { name, hosts, count } = service;
          const isPicked = isOn(hosts);
          // Its hosts go on together, as many as one search takes
          const isDisabled = !isPicked && picked.length >= RESOURCE_SEARCH_MAX_HOSTS;
          const unnamedIndex = unnamed.indexOf(service);
          return (
            <FilterItem
              key={hosts[0]}
              isSelected={isPicked}
              onClick={() => {
                if (!isDisabled)
                  setFilters({
                    hosts: isPicked
                      ? picked.filter((host) => !hosts.includes(host))
                      : [...picked, ...hosts.slice(0, RESOURCE_SEARCH_MAX_HOSTS - picked.length)],
                  });
              }}
              aria-label={
                unnamedIndex >= 0
                  ? `Loading service name, ${unnamedIndex + 1} of ${unnamed.length}`
                  : isCounting
                    ? name
                    : `${name}, ${count} links`
              }
              aria-busy={unnamedIndex >= 0 || isCounting || undefined}
              aria-disabled={isDisabled || undefined}
              className={isDisabled ? 'cursor-default opacity-40' : undefined}
              data-testid={`resource-service-${hosts[0]}`}
            >
              {/* The service's own icon, as its cards show it, in the rows' icon box */}
              <span className="flex size-5 shrink-0 items-center justify-center">
                <ResourceSourceIcon uri={`https://${hosts[0]}/`} />
              </span>
              {unnamedIndex >= 0 ? (
                <Skeleton className="h-4 w-24" data-testid="resource-service-name-skeleton" />
              ) : (
                <>
                  <FilterItemLabel>{name}</FilterItemLabel>
                  {isCounting ? (
                    <Skeleton className="h-4 w-6" data-testid="resource-service-count-skeleton" />
                  ) : (
                    <FilterItemLabel className="text-muted-foreground" aria-hidden>
                      {count}
                    </FilterItemLabel>
                  )}
                </>
              )}
              {isPicked && <FilterItemCheck />}
            </FilterItem>
          );
        })}
      </FilterList>
    </FilterRoot>
  );
}

/** Identifier: one ISRC/UPC/MBID (music, videos, podcasts), ISBN (books) or DOI (papers). */
function IdentifierSection({ namespaces }: { namespaces: readonly TResourceIdentifier[] }) {
  const { filters, setFilters } = useResourceSearchFilters();
  const [isInvalid, setIsInvalid] = useState(false);
  const names = orList(namespaces.map((namespace) => IDENTIFIER_NAMES[namespace]));
  const error = isInvalid ? `Not a valid ${names}.` : undefined;
  const key = filters.key && parseResourceIdentifier(filters.key, namespaces) === filters.key ? filters.key : null;
  return (
    <FilterRoot data-testid="filter-resource-identifier">
      <FilterHeader title="Identifier" subtitle={error} />
      {key ? (
        <RemovableRow
          icon={Hash}
          label={key}
          onRemove={() => setFilters({ key: null })}
          testId="search-resource-identifier"
        />
      ) : (
        <SectionInput
          label={`Identifier: ${names}`}
          placeholder={names}
          error={error}
          onSubmit={(value) => {
            const parsed = parseResourceIdentifier(value, namespaces);
            setIsInvalid(parsed === null && value.trim() !== '');
            if (parsed) setFilters({ key: parsed });
            return parsed !== null;
          }}
          testId="search-resource-identifier-input"
        />
      )}
    </FilterRoot>
  );
}

/** Ingredients: recipes with every one of up to 3. */
function IngredientsSection() {
  const { filters, setFilters } = useResourceSearchFilters();
  const [isInvalid, setIsInvalid] = useState(false);
  const isFull = filters.ingredients.length >= RESOURCE_SEARCH_MAX_INGREDIENTS;
  const error = isInvalid ? 'Letters, digits, spaces and hyphens only.' : undefined;
  return (
    <FilterRoot data-testid="filter-resource-ingredients">
      <FilterHeader title="Ingredients" subtitle={error} />
      <SectionInput
        label="Add an ingredient"
        placeholder={isFull ? `${RESOURCE_SEARCH_MAX_INGREDIENTS} ingredients max` : 'Ingredient'}
        disabled={isFull}
        error={error}
        onSubmit={(value) => {
          const ingredient = parseResourceIngredient(value);
          setIsInvalid(ingredient === null && value.trim() !== '');
          if (!ingredient) return false;
          if (!filters.ingredients.includes(ingredient)) {
            setFilters({ ingredients: [...filters.ingredients, ingredient] });
          }
          return true;
        }}
        testId="search-resource-ingredient-input"
      />
      {filters.ingredients.length > 0 && (
        <FilterList data-testid="search-resource-ingredients">
          {filters.ingredients.map((ingredient) => (
            <RemovableRow
              key={ingredient}
              icon={ChefHat}
              label={ingredient}
              onRemove={() => setFilters({ ingredients: filters.ingredients.filter((item) => item !== ingredient) })}
            />
          ))}
        </FilterList>
      )}
    </FilterRoot>
  );
}

export interface SearchResourceKindFiltersProps {
  /** The picked kind's own sections. */
  sections: readonly TResourceKindSection[];
  /** The services of the whole result without the picked ones (`facet=host`), `null` until read. */
  hostFacets: TPinakesHostFacet[] | null;
  /** Whether those services are being read: a picked service's name is not known yet. */
  hostFacetsLoading?: boolean;
  /** The categories of the whole result (`facet=category`), `null` until read. */
  categoryFacets: TPinakesCategoryFacet[] | null;
}

/**
 * SearchResourceKindFilters
 *
 * The filter panel sections only some kinds have, in the panel's own radio groups and inputs:
 * Events When (Upcoming, Today … Past, Dates) and Where; Places Where (around the viewer, asked
 * only on click, or a place found by name), Distance and Category; Music, Videos and Podcasts
 * Service and Identifier; Books and Papers Identifier; Jobs Remote and Closed postings; Recipes
 * Ingredients. Every choice is kept in the URL (`useResourceSearchFilters`).
 */
export function SearchResourceKindFilters({
  sections,
  hostFacets,
  hostFacetsLoading = false,
  categoryFacets,
}: SearchResourceKindFiltersProps) {
  const { filters, setFilters } = useResourceSearchFilters();
  const has = (section: TResourceKindSection) => sections.includes(section);
  const namespaces = RESOURCE_KIND_IDENTIFIERS[filters.kind ?? ''] ?? [];

  return (
    <>
      {has('when') && (
        <FilterRadioGroup<TResourceEventWhen>
          title="When"
          items={WHEN_ITEMS}
          itemExtras={{
            dates: filters.when === 'dates' && (
              <Container overrideDefaults className="flex flex-col gap-2 py-1" data-testid="search-resource-dates">
                <Input
                  type="date"
                  aria-label="First day"
                  value={filters.dateFrom ?? ''}
                  onChange={(event) => setFilters({ dateFrom: event.target.value || null })}
                />
                <Input
                  type="date"
                  aria-label="Last day"
                  value={filters.dateTo ?? ''}
                  onChange={(event) => setFilters({ dateTo: event.target.value || null })}
                />
              </Container>
            ),
          }}
          selectedValue={filters.when ?? 'upcoming'}
          onChange={(key) => setFilters({ when: key, dateFrom: null, dateTo: null })}
          testId="filter-resource-when-radiogroup"
        />
      )}
      {/* Keyed by kind: another kind starts Where over and drops a Near me request still waiting */}
      {has('where') && <WhereSection key={filters.kind ?? ''} />}
      {has('category') && (
        <FacetSection
          title="Category"
          anyLabel="Any category"
          icon={Tag}
          options={
            categoryFacets?.map(({ category, count }) => ({
              key: category,
              label: getResourceCategoryLabel(category),
              count,
            })) ?? null
          }
          selected={filters.category}
          labelFor={getResourceCategoryLabel}
          onChange={(category) => setFilters({ category })}
          testId="filter-resource-category-radiogroup"
        />
      )}
      {has('service') && <ServiceSection facets={hostFacets} loading={hostFacetsLoading} />}
      {has('identifier') && namespaces.length > 0 && <IdentifierSection namespaces={namespaces} />}
      {has('jobs') && (
        <>
          <FilterRadioGroup<'any' | 'yes' | 'no'>
            title="Remote"
            items={REMOTE_ITEMS}
            selectedValue={filters.remote ?? 'any'}
            onChange={(key) => setFilters({ remote: key === 'any' ? null : key })}
            testId="filter-resource-remote-radiogroup"
          />
          <FilterRadioGroup<'open' | 'closed'>
            title="Postings"
            items={POSTINGS_ITEMS}
            selectedValue={filters.closed ? 'closed' : 'open'}
            onChange={(key) => setFilters({ closed: key === 'closed' })}
            testId="filter-resource-closed-radiogroup"
          />
        </>
      )}
      {has('ingredients') && <IngredientsSection />}
    </>
  );
}
