import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseResourceSearchResult } from '@/hooks/useResourceSearch/useResourceSearch';
import { useResourceLocationVariant } from '@/molecules/ResourceMap/ResourceLocationContext';
import type { ResourceMapProps } from '@/molecules/ResourceMap/ResourceMap';
import type { TEventInstance } from '@/pipes/resource/resource.events';
import eventsFixture from '@/services/pinakes/fixtures/search.events.json';
import nearbyFixture from '@/services/pinakes/fixtures/search.places-nearby.json';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { SearchResourceMap } from './SearchResourceMap';

const mocks = vi.hoisted(() => ({ map: null as unknown, detailsLoading: false, instancesAsked: [] as unknown[] }));

// The map itself is tested in ResourceMap.test: here its pins are plain buttons
vi.mock('@/molecules/ResourceMap/ResourceMap', () => ({
  ResourceMap: (props: ResourceMapProps) => {
    mocks.map = props;
    return (
      <div data-testid="resource-map" data-mode={props.mode} data-size={props.size} aria-label={props.label}>
        {props.markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            aria-pressed={marker.id === props.selectedId}
            data-count={marker.count ?? 1}
            data-zooms={marker.bounds ? 'yes' : 'no'}
            onClick={() => props.onSelect?.(marker.id)}
          >
            {marker.label}
          </button>
        ))}
      </div>
    );
  },
}));
vi.mock('@/hooks/useEventInstances/useEventInstances', () => ({
  useEventInstances: (cards: TPinakesCard[]) => {
    mocks.instancesAsked.push(cards);
    return { instances: mocks.detailsLoading ? [] : cards, isLoading: mocks.detailsLoading };
  },
}));
vi.mock('@/molecules/ResourceCard/ResourceItem', () => ({
  ResourceItem: function ResourceItemStub({ uri }: { uri: string }) {
    return <div data-testid="place-card" data-uri={uri} data-location={useResourceLocationVariant()} />;
  },
}));
vi.mock('@/organisms/ResourceInstanceCard/ResourceInstanceCard', () => ({
  ResourceInstanceCard: function ResourceInstanceCardStub({ card }: { card: TEventInstance }) {
    return (
      <div data-testid="event-card" data-uid={card.occurrence?.uid ?? ''} data-location={useResourceLocationVariant()}>
        {card.name}
      </div>
    );
  },
}));

const PLACES: TPinakesCard[] = nearbyFixture.items;
const EVENTS: TPinakesCard[] = eventsFixture.items;
const map = () => mocks.map as ResourceMapProps;
/** Tells the page how close the map is, as the map does once drawn and after a zoom. */
const zoomTo = (zoom: number) => act(() => map().onZoom?.(zoom));

const search = (overrides: Partial<UseResourceSearchResult> = {}): UseResourceSearchResult => ({
  uris: [],
  cards: PLACES,
  typeFacets: null,
  relatedTags: [],
  hostFacets: null,
  categoryFacets: null,
  source: 'pinakes',
  unavailable: false,
  reachTruncated: false,
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  loadMore: vi.fn(async () => {}),
  retry: vi.fn(),
  ...overrides,
});

describe('SearchResourceMap', () => {
  beforeEach(() => {
    mocks.map = null;
    mocks.detailsLoading = false;
    mocks.instancesAsked.length = 0;
  });

  it('shows the places read so far on one map to explore, fitted to all of them', () => {
    render(<SearchResourceMap kind="place" search={search()} />);

    expect(screen.getByTestId('resource-map')).toHaveAttribute('data-mode', 'explore');
    expect(screen.getByTestId('resource-map')).toHaveAttribute('data-size', 'wide');
    expect(map().fit).toEqual(PLACES.map((card) => card.point));
    expect(map().label).toBe('Map of 7 places');
  });

  it('groups pins too close to tell apart, counting them, and tells them apart once the map is close', () => {
    render(<SearchResourceMap kind="place" search={search()} />);

    // Seven places in Zurich's old town, seen from far away: one pin
    zoomTo(4);
    const [group] = within(screen.getByTestId('resource-map')).getAllByRole('button');
    expect(group).toHaveTextContent('7 places here');
    expect(group).toHaveAttribute('data-count', '7');
    expect(group).toHaveAttribute('data-zooms', 'yes');

    zoomTo(18);
    const pins = within(screen.getByTestId('resource-map')).getAllByRole('button');
    expect(pins.map((pin) => pin.textContent)).toEqual(PLACES.map((card) => card.name));
  });

  it('opens the real card of a selected pin under the map, with its tag bar, saying where it is on a line with Open in Maps', () => {
    render(<SearchResourceMap kind="place" search={search()} />);
    zoomTo(18);
    expect(screen.getByTestId('search-map-selection')).toHaveTextContent('Select a pin to see its card');

    fireEvent.click(screen.getByRole('button', { name: 'Henrici' }));

    const cards = screen.getAllByTestId('place-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute('data-uri', 'https://www.openstreetmap.org/node/633601362');
    expect(cards[0]).toHaveAttribute('data-location', 'row');
    expect(screen.getByRole('button', { name: 'Henrici' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the selected card when the map is zoomed and its pin joins a group', () => {
    render(<SearchResourceMap kind="place" search={search()} />);
    zoomTo(18);
    fireEvent.click(screen.getByRole('button', { name: 'Henrici' }));

    zoomTo(4);

    expect(screen.getByTestId('place-card')).toHaveAttribute(
      'data-uri',
      'https://www.openstreetmap.org/node/633601362',
    );
    expect(screen.getByRole('button', { name: '7 places here' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens every card of a pin that stands for results at one spot: they cannot be zoomed apart', () => {
    const spot = { lat: 47.37546, lon: 8.52722 };
    const sameVenue = [
      { ...EVENTS[1], point: spot },
      { ...EVENTS[5], point: spot },
    ];
    render(<SearchResourceMap kind="event" search={search({ cards: sameVenue })} />);
    zoomTo(18);

    const pin = screen.getByRole('button', { name: '2 events here' });
    expect(pin).toHaveAttribute('data-zooms', 'no');
    fireEvent.click(pin);

    expect(screen.getAllByTestId('event-card').map((card) => card.textContent)).toEqual([
      'Annett Louisan @ Volkshaus',
      'Noah Kahan @ Hallenstadion',
    ]);
  });

  it('says how much the map shows: the results loaded so far, and how many have no location', () => {
    render(<SearchResourceMap kind="event" search={search({ cards: EVENTS, hasMore: true })} />);

    expect(mocks.instancesAsked.at(-1)).toBe(EVENTS);
    const scope = screen.getByTestId('search-map-scope');
    expect(scope).toHaveTextContent('Showing the 6 events loaded so far');
    expect(scope).toHaveTextContent('3 have no location and are not on the map');
    expect(map().markers.reduce((sum, marker) => sum + (marker.count ?? 1), 0)).toBe(3);
  });

  it('says so when it shows every result, and counts one event right', () => {
    render(<SearchResourceMap kind="event" search={search({ cards: [EVENTS[1], EVENTS[0]] })} />);

    const scope = screen.getByTestId('search-map-scope');
    expect(scope).toHaveTextContent('Showing all 2 events');
    expect(scope).toHaveTextContent('1 has no location and is not on the map');
  });

  it('keeps a calendar’s occurrences apart on the map too: each with a place is its own result', () => {
    const [first, , second] = EVENTS;
    const placed = [
      { ...first, point: { lat: 52.52, lon: 13.4 } },
      { ...second, point: { lat: 48.14, lon: 11.58 } },
    ];
    render(<SearchResourceMap kind="event" search={search({ cards: placed })} />);
    zoomTo(18);

    fireEvent.click(screen.getByRole('button', { name: 'Repentance Day (Saxony)' }));

    expect(screen.getByTestId('event-card')).toHaveAttribute('data-uid', second.occurrence!.uid);
  });

  it('loads the next page only when asked, and adds its results to the map', () => {
    const loadMore = vi.fn(async () => {});
    const { rerender } = render(
      <SearchResourceMap kind="place" search={search({ cards: PLACES.slice(0, 3), hasMore: true, loadMore })} />,
    );
    expect(loadMore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Load more results' }));
    expect(loadMore).toHaveBeenCalledTimes(1);

    rerender(<SearchResourceMap kind="place" search={search({ cards: PLACES, hasMore: false, loadMore })} />);
    expect(map().fit).toHaveLength(7);
    expect(screen.queryByRole('button', { name: 'Load more results' })).toBeNull();
  });

  it('shows that more results are being read', () => {
    render(<SearchResourceMap kind="place" search={search({ hasMore: true, loadingMore: true })} />);

    expect(screen.getByRole('button', { name: 'Loading more results' })).toBeDisabled();
  });

  it('draws no map when none of the results has a location, and says so', () => {
    const unplaced = EVENTS.filter((card) => !card.point);
    render(<SearchResourceMap kind="event" search={search({ cards: unplaced, hasMore: true })} />);

    expect(screen.queryByTestId('resource-map')).toBeNull();
    expect(screen.getByTestId('search-map-empty')).toHaveTextContent(
      'None of the 3 events loaded so far has a location',
    );
    expect(screen.getByRole('button', { name: 'Load more results' })).toBeInTheDocument();
  });

  it('leaves a result whose point is not on the map off it', () => {
    const broken = [{ ...PLACES[0], point: { lat: 947, lon: 8 } }, PLACES[1]];
    render(<SearchResourceMap kind="place" search={search({ cards: broken })} />);

    expect(map().fit).toEqual([PLACES[1].point]);
    expect(screen.getByTestId('search-map-scope')).toHaveTextContent('1 has no location and is not on the map');
  });

  it('shows a loading map while the search is read, and for events while their details are', () => {
    const { rerender } = render(<SearchResourceMap kind="place" search={search({ cards: [], loading: true })} />);
    expect(screen.getByTestId('search-map-loading')).toBeInTheDocument();

    mocks.detailsLoading = true;
    rerender(<SearchResourceMap kind="event" search={search({ cards: EVENTS })} />);
    expect(screen.getByTestId('search-map-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-map')).toBeNull();
  });

  it('says so when nothing matches, and when the search failed, with a way to try again', () => {
    const { rerender } = render(<SearchResourceMap kind="place" search={search({ cards: [] })} />);
    expect(screen.getByTestId('search-map-empty')).toHaveTextContent('No places found');

    const retry = vi.fn();
    rerender(<SearchResourceMap kind="place" search={search({ cards: [], error: 'Pinakes is down', retry })} />);
    expect(screen.getByTestId('search-map-error')).toHaveTextContent('Pinakes is down');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('says so when more results could not be read: it keeps the map, claims no "all", and offers to try again', () => {
    const retry = vi.fn();
    // As the search hook leaves it after a failed next page: the rows read, no more to ask for, the error
    render(
      <SearchResourceMap
        kind="place"
        search={search({ cards: PLACES.slice(0, 3), hasMore: false, error: 'Pinakes is down', retry })}
      />,
    );

    expect(screen.getByTestId('resource-map')).toBeInTheDocument();
    expect(screen.getByTestId('search-map-scope')).toHaveTextContent('Showing the 3 places loaded so far');
    expect(screen.getByTestId('search-map-scope')).not.toHaveTextContent('all');
    expect(screen.getByTestId('search-map-more-error')).toHaveTextContent('Pinakes is down');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('says so too when more results could not be read and none read so far has a location', () => {
    const retry = vi.fn();
    const unplaced = EVENTS.filter((card) => !card.point);
    render(
      <SearchResourceMap
        kind="event"
        search={search({ cards: unplaced, hasMore: false, error: 'Pinakes is down', retry })}
      />,
    );

    expect(screen.getByTestId('search-map-empty')).toHaveTextContent(
      'None of the 3 events loaded so far has a location',
    );
    expect(screen.getByTestId('search-map-more-error')).toHaveTextContent('Pinakes is down');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('says quietly what is coming for the kind it shows, with nothing to press', () => {
    const { rerender } = render(<SearchResourceMap kind="place" search={search()} />);
    expect(screen.getByTestId('search-map-hint')).toHaveTextContent('Pubky Maps is coming');

    rerender(<SearchResourceMap kind="event" search={search({ cards: EVENTS })} />);
    const hint = screen.getByTestId('search-map-hint');
    expect(hint).toHaveTextContent('Events on Pubky are coming');
    expect(within(hint).queryByRole('button')).toBeNull();
  });

  it('asks Pinakes for nothing as the map moves: no search of the area in view', () => {
    const loadMore = vi.fn(async () => {});
    const retry = vi.fn();
    render(<SearchResourceMap kind="place" search={search({ hasMore: true, loadMore, retry })} />);

    zoomTo(4);
    zoomTo(12);
    zoomTo(18);

    expect(loadMore).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });
});
