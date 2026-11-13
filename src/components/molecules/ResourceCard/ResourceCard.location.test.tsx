import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceLocationProvider } from '@/molecules/ResourceMap/ResourceLocationContext';
import type { ResourceMapProps } from '@/molecules/ResourceMap/ResourceMap';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import placeFixture from '@/services/pinakes/fixtures/by-uri.place.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { ResourceCard } from './ResourceCard';

const mocks = vi.hoisted(() => ({ push: vi.fn(), maps: [] as unknown[] }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));
// The map itself is tested in ResourceMap.test: here, what the card hands it
vi.mock('@/molecules/ResourceMap/ResourceMap', () => ({
  ResourceMap: (props: ResourceMapProps) => {
    mocks.maps.push(props);
    return (
      <div data-testid="resource-map" data-size={props.size} aria-label={props.label}>
        {props.corner}
      </div>
    );
  },
}));

const CAFE = {
  ...placeFixture,
  type: 'CafeOrCoffeeShop',
  type_path: ['Thing', 'Organization', 'Place', 'LocalBusiness', 'FoodEstablishment', 'CafeOrCoffeeShop'],
  name: 'Conditorei schober',
  point: { lat: 47.3708689, lon: 8.5418241 },
  address: { street: 'Stegengasse', postcode: '8001', city: 'Zürich', country_code: 'ch' },
};

const lastMap = () => mocks.maps.at(-1) as ResourceMapProps;

describe('ResourceCard location', () => {
  beforeEach(() => {
    mocks.maps.length = 0;
    mocks.push.mockClear();
  });

  it('shows a place’s point on a small map with Open in Maps on its corner', () => {
    render(<ResourceCard card={CAFE} href={CAFE.uri} />);

    const map = screen.getByTestId('resource-map');
    expect(map).toHaveAttribute('aria-label', 'Map of Conditorei schober');
    expect(map).toHaveAttribute('data-size', 'small');
    expect(lastMap().markers).toEqual([
      { id: CAFE.id, point: { lat: 47.3708689, lon: 8.5418241 }, label: 'Conditorei schober' },
    ]);
    expect(lastMap().mode ?? 'preview').toBe('preview');
    expect(within(map).getByRole('button', { name: 'Open in Maps' })).toBeInTheDocument();
    // The address stays the card's summary line, said once
    expect(screen.getByTestId('resource-card-summary')).toHaveTextContent('Stegengasse, 8001 Zürich, Switzerland');
    expect(screen.queryByTestId('resource-location-row')).toBeNull();
  });

  it('shows the larger, closer map on the resource page’s card', () => {
    render(<ResourceCard card={CAFE} href={CAFE.uri} size="large" />);

    expect(screen.getByTestId('resource-map')).toHaveAttribute('data-size', 'large');
    expect(lastMap().zoom).toBe(15);
  });

  it('shows an event’s venue on the map, named by the venue', () => {
    render(<ResourceCard card={eventFixture} href={eventFixture.uri} />);

    expect(screen.getByTestId('resource-map')).toHaveAttribute('aria-label', 'Map of Hilton Austin');
    expect(lastMap().markers[0].point).toEqual({ lat: 30.2651833, lon: -97.73810329999999 });
    expect(screen.getByRole('button', { name: 'Open in Maps' })).toBeInTheDocument();
  });

  it('gives an online event, or one without a place, no map and no way to a maps app', () => {
    const online = { ...eventFixture, point: null, attendance: 'online', venue: { id: null, name: 'Zoom' } };
    const { unmount } = render(<ResourceCard card={online} href={eventFixture.uri} />);

    expect(screen.queryByTestId('resource-map')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open in Maps' })).toBeNull();
    expect(screen.queryByTestId('resource-location-row')).toBeNull();
    unmount();

    render(<ResourceCard card={{ ...eventFixture, point: null, venue: null }} href={eventFixture.uri} />);
    expect(screen.queryByTestId('resource-map')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open in Maps' })).toBeNull();
  });

  it('gives a place with an address but no point no map: its address line ends in Open in Maps, said once', () => {
    render(<ResourceCard card={{ ...CAFE, point: null }} href={CAFE.uri} />);

    expect(screen.queryByTestId('resource-map')).toBeNull();
    const row = screen.getByTestId('resource-location-row');
    expect(row).toHaveTextContent('Stegengasse, 8001 Zürich, Switzerland');
    expect(within(row).getByRole('button', { name: 'Open in Maps' })).toBeInTheDocument();
    expect(screen.queryByTestId('resource-card-summary')).toBeNull();
  });

  it('draws no map for a point that is not on the map', () => {
    render(<ResourceCard card={{ ...CAFE, point: { lat: 947, lon: 8 }, address: null }} href={CAFE.uri} />);

    expect(screen.queryByTestId('resource-map')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open in Maps' })).toBeNull();
  });

  it('draws no map for a card that is neither a place nor an event', () => {
    render(<ResourceCard card={{ ...videoFixture, point: { lat: 47, lon: 8 } }} href={videoFixture.uri} />);

    expect(screen.queryByTestId('resource-map')).toBeNull();
  });

  it('shows where it is as a line ending in Open in Maps where a map already shows it (a selected pin, a list beside a map)', () => {
    render(
      <ResourceLocationProvider variant="row">
        <ResourceCard card={{ ...CAFE, address: null }} href={CAFE.uri} />
      </ResourceLocationProvider>,
    );

    expect(screen.queryByTestId('resource-map')).toBeNull();
    const row = screen.getByTestId('resource-location-row');
    expect(row).toHaveTextContent('47.37087, 8.54182');
    expect(within(row).getByRole('button', { name: 'Open in Maps' })).toBeInTheDocument();
    // The line has the coordinates: the card does not say them a second time
    expect(screen.queryByTestId('resource-card-point')).toBeNull();
  });

  it('keeps a press on Open in Maps on the card: it does not open the resource’s page', () => {
    render(<ResourceCard card={CAFE} href={CAFE.uri} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open in Maps' }));

    expect(mocks.push).not.toHaveBeenCalled();
  });
});
