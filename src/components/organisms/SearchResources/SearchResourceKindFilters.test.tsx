import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Tag } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseResourceSearchFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import type { TPinakesHostFacet } from '@/services/pinakes/pinakes.types';
import { RemovableRow, SearchResourceKindFilters } from './SearchResourceKindFilters';

const mocks = vi.hoisted(() => ({ search: '', setFilters: vi.fn() }));

vi.mock('@/hooks/useResourceSearchFilters/useResourceSearchFilters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useResourceSearchFilters/useResourceSearchFilters')>()),
  useResourceSearchFilters: () => ({
    filters: parseResourceSearchFilters(new URLSearchParams(mocks.search)),
    setFilters: mocks.setFilters,
  }),
}));
vi.mock('@/hooks/useResourcePlaces/useResourcePlaces', () => ({
  useResourcePlaces: () => ({ places: [], loading: false, failed: false }),
}));

const where = () =>
  within(screen.getByTestId('filter-resource-where-radiogroup'))
    .getAllByRole('radio')
    .map((radio) => `${radio.getAttribute('aria-label')}${radio.getAttribute('aria-checked') === 'true' ? ' *' : ''}`);
const renderWhere = () =>
  render(<SearchResourceKindFilters sections={['where']} hostFacets={null} categoryFacets={null} />);
const setGeolocation = (getCurrentPosition: Geolocation['getCurrentPosition'] | undefined) =>
  Object.defineProperty(navigator, 'geolocation', {
    value: getCurrentPosition ? { getCurrentPosition } : undefined,
    configurable: true,
  });

describe('SearchResourceKindFilters: Where', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = 'kind=place';
    // Each case brings its own location service (the own point Near me sets is distinct per case)
    setGeolocation(undefined);
  });

  it('says so when the location is refused, and asks once at a time', () => {
    const getCurrentPosition = vi.fn();
    setGeolocation(getCurrentPosition);
    renderWhere();

    fireEvent.click(screen.getByRole('radio', { name: 'Near me' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Near me' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Finding your location');

    const refuse = getCurrentPosition.mock.calls[0][1] as PositionErrorCallback;
    act(() => refuse({ code: 1, message: 'denied' } as GeolocationPositionError));
    expect(screen.getAllByText('Your location is not available.').length).toBeGreaterThan(0);
    expect(mocks.setFilters).not.toHaveBeenCalled();
  });

  it('reads a point someone shared as a shared location, not as Near me', () => {
    mocks.search = 'kind=place&near=47.37,8.54';
    renderWhere();

    expect(where()).toEqual(['Anywhere', 'Near me', 'Near a place *']);
    expect(screen.getByRole('button', { name: 'Remove Shared location (47.37, 8.54)' })).toBeInTheDocument();
  });

  it("shows the viewer's own point as Near me, and Near a place starts over from a name", () => {
    setGeolocation((done) => done({ coords: { latitude: 46.948, longitude: 7.4474 } } as GeolocationPosition));
    const { rerender } = renderWhere();
    fireEvent.click(screen.getByRole('radio', { name: 'Near me' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ near: { lat: 46.95, lon: 7.45 }, place: null });

    mocks.search = 'kind=place&near=46.95,7.45';
    rerender(<SearchResourceKindFilters sections={['where']} hostFacets={null} categoryFacets={null} />);
    expect(where()).toEqual(['Anywhere', 'Near me *', 'Near a place']);
    fireEvent.click(screen.getByRole('radio', { name: 'Near a place' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ near: null, radius: null });
    mocks.search = 'kind=place';
    rerender(<SearchResourceKindFilters sections={['where']} hostFacets={null} categoryFacets={null} />);
    expect(where()).toEqual(['Anywhere', 'Near me', 'Near a place *']);
    expect(screen.getByLabelText('Find a place')).toBeInTheDocument();
  });

  it('lists a distance no option stands for as its own row, picked, until another is picked', () => {
    const distance = () =>
      within(screen.getByTestId('filter-resource-radius-radiogroup'))
        .getAllByRole('radio')
        .map(
          (radio) => `${radio.getAttribute('aria-label')}${radio.getAttribute('aria-checked') === 'true' ? ' *' : ''}`,
        );
    mocks.search = 'kind=place&near=47.37,8.54&radius=25';
    const { rerender } = renderWhere();
    expect(distance()).toEqual(['Within 2 km', 'Within 10 km', 'Within 25 km *', 'Within 50 km', 'Within 200 km']);

    fireEvent.click(screen.getByRole('radio', { name: 'Within 50 km' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ radius: 50 });
    mocks.search = 'kind=place&near=47.37,8.54&radius=50';
    rerender(<SearchResourceKindFilters sections={['where']} hostFacets={null} categoryFacets={null} />);
    expect(distance()).toEqual(['Within 2 km', 'Within 10 km', 'Within 50 km *', 'Within 200 km']);
  });

  it('gives up on a browser that never answers', () => {
    vi.useFakeTimers();
    try {
      setGeolocation(vi.fn());
      renderWhere();
      fireEvent.click(screen.getByRole('radio', { name: 'Near me' }));
      expect(screen.getByRole('status')).toHaveTextContent('Finding your location');
      act(() => {
        vi.advanceTimersByTime(15_000);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Your location is not available.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a late answer once another Where is picked, or the section is gone', () => {
    const getCurrentPosition = vi.fn();
    setGeolocation(getCurrentPosition);
    const { unmount } = renderWhere();
    const answer = (call: number) =>
      act(() =>
        (getCurrentPosition.mock.calls[call][0] as PositionCallback)({
          coords: { latitude: 47.37, longitude: 8.54 },
        } as GeolocationPosition),
      );

    fireEvent.click(screen.getByRole('radio', { name: 'Near me' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Near a place' }));
    answer(0);
    expect(mocks.setFilters).not.toHaveBeenCalled();
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('');

    fireEvent.click(screen.getByRole('radio', { name: 'Near me' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    unmount();
    answer(1);
    expect(mocks.setFilters).not.toHaveBeenCalled();
  });

  it('drops a late answer once another kind with Where is picked', () => {
    const getCurrentPosition = vi.fn();
    setGeolocation(getCurrentPosition);
    mocks.search = 'kind=event';
    const { rerender } = renderWhere();
    fireEvent.click(screen.getByRole('radio', { name: 'Near me' }));

    mocks.search = 'kind=place';
    rerender(<SearchResourceKindFilters sections={['where']} hostFacets={null} categoryFacets={null} />);
    act(() =>
      (getCurrentPosition.mock.calls[0][0] as PositionCallback)({
        coords: { latitude: 47.37, longitude: 8.54 },
      } as GeolocationPosition),
    );
    expect(mocks.setFilters).not.toHaveBeenCalled();
    // The new kind's Where asks afresh
    fireEvent.click(screen.getByRole('radio', { name: 'Near me' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('says so without a location service', () => {
    setGeolocation(undefined);
    renderWhere();
    fireEvent.click(screen.getByRole('radio', { name: 'Near me' }));
    expect(screen.getAllByText('Your location is not available.').length).toBeGreaterThan(0);
  });
});

describe('SearchResourceKindFilters: Service', () => {
  const PICKED = ['music.amazon.com', 'open.spotify.com'];
  const renderService = (props: { hostFacets: TPinakesHostFacet[] | null; hostFacetsLoading?: boolean }) =>
    render(<SearchResourceKindFilters sections={['service']} categoryFacets={null} {...props} />);
  const hostText = () => within(screen.getByTestId('filter-resource-service')).queryByText(/amazon|spotify/);

  beforeEach(() => {
    mocks.search = `kind=music&service=${PICKED.join(',')}`;
  });

  it('shows a picked service’s icon and a skeleton, never its host, while the services are read', () => {
    renderService({ hostFacets: null, hostFacetsLoading: true });

    expect(hostText()).not.toBeInTheDocument();
    expect(screen.getAllByTestId('resource-service-name-skeleton')).toHaveLength(2);
    const spotify = screen.getByTestId('resource-service-open.spotify.com');
    expect(spotify).toHaveAttribute('aria-busy', 'true');
    expect(spotify).toHaveAttribute('aria-pressed', 'true');
    expect(within(spotify).getByTestId('resource-source-favicon')).toBeInTheDocument();
    // Each loading one is told apart by its place
    expect(screen.getByTestId('resource-service-music.amazon.com')).toHaveAccessibleName(
      'Loading service name, 1 of 2',
    );
    expect(spotify).toHaveAccessibleName('Loading service name, 2 of 2');
  });

  it('keeps the names the last read gave while another search’s services are read', () => {
    const FACETS = [
      { host: 'open.spotify.com', site: 'Spotify', count: 12 },
      { host: 'music.amazon.com', site: 'Amazon Music', count: 3 },
      { host: 'tidal.com', site: 'TIDAL', count: 2 },
    ];
    const { rerender } = renderService({ hostFacets: FACETS });
    const read = (props: { hostFacets: TPinakesHostFacet[] | null; hostFacetsLoading?: boolean }) =>
      rerender(<SearchResourceKindFilters sections={['service']} categoryFacets={null} {...props} />);

    // Sort, Window or Where changed: the picked ones keep their names, their links are being counted
    mocks.search = `kind=music&service=${[...PICKED, 'bandcamp.com'].join(',')}`;
    read({ hostFacets: null, hostFacetsLoading: true });
    const spotify = screen.getByTestId('resource-service-open.spotify.com');
    expect(spotify).toHaveTextContent('Spotify');
    expect(spotify).toHaveAccessibleName('Spotify');
    expect(spotify).toHaveAttribute('aria-busy', 'true');
    expect(within(spotify).getByTestId('resource-service-count-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('resource-service-music.amazon.com')).toHaveTextContent('Amazon Music');
    // Not picked: not listed while read; picked and named by no read yet: a skeleton, never its host
    expect(screen.queryByTestId('resource-service-tidal.com')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-service-bandcamp.com')).toHaveAccessibleName('Loading service name, 1 of 1');
    expect(screen.queryByText('bandcamp.com')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('resource-service-name-skeleton')).toHaveLength(1);

    read({ hostFacets: [{ host: 'open.spotify.com', site: 'Spotify', count: 5 }] });
    expect(screen.getByRole('button', { name: 'Spotify, 5 links' })).not.toHaveAttribute('aria-busy');
    expect(screen.queryByTestId('resource-service-count-skeleton')).not.toBeInTheDocument();
  });

  it('keeps a picked service’s name, with no links, after a read that does not list it', () => {
    const { rerender } = renderService({
      hostFacets: [
        { host: 'open.spotify.com', site: 'Spotify', count: 12 },
        { host: 'music.amazon.com', site: 'Amazon Music', count: 3 },
      ],
    });
    const read = (props: { hostFacets: TPinakesHostFacet[] | null; hostFacetsLoading?: boolean }) =>
      rerender(<SearchResourceKindFilters sections={['service']} categoryFacets={null} {...props} />);

    read({ hostFacets: null, hostFacetsLoading: true });
    read({ hostFacets: [{ host: 'open.spotify.com', site: 'Spotify', count: 5 }] });
    expect(screen.getByRole('button', { name: 'Amazon Music, 0 links' })).toHaveTextContent('Amazon Music0');
    expect(screen.queryByText('music.amazon.com')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spotify, 5 links' })).toBeInTheDocument();

    // And after the next read too, which also does not list it
    read({ hostFacets: [{ host: 'open.spotify.com', site: 'Spotify', count: 4 }] });
    expect(screen.getByRole('button', { name: 'Amazon Music, 0 links' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spotify, 4 links' })).toBeInTheDocument();
  });

  it('names them once the read answers, and reads a host as itself once it failed', () => {
    const { rerender } = renderService({ hostFacets: null, hostFacetsLoading: true });

    rerender(
      <SearchResourceKindFilters
        sections={['service']}
        categoryFacets={null}
        hostFacets={[
          { host: 'open.spotify.com', site: 'Spotify', count: 12 },
          { host: 'music.amazon.com', site: 'Amazon Music', count: 3 },
        ]}
      />,
    );
    expect(screen.queryByTestId('resource-service-name-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spotify, 12 links' })).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button', { name: 'Amazon Music, 3 links' })).toBeInTheDocument();

    // Failed: no name to wait for
    rerender(<SearchResourceKindFilters sections={['service']} categoryFacets={null} hostFacets={null} />);
    expect(screen.queryByTestId('resource-service-name-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'open.spotify.com, 0 links' })).toHaveTextContent('open.spotify.com0');
  });
});

describe('RemovableRow', () => {
  it('shows a skeleton after its label while its value is read, and is busy', () => {
    const onRemove = vi.fn();
    const { rerender } = render(
      <RemovableRow icon={Tag} label="Service:" isLoading onRemove={onRemove} testId="row" />,
    );

    const row = screen.getByTestId('row');
    expect(row).toHaveAttribute('aria-busy', 'true');
    expect(row).toHaveAccessibleName('Remove Service: (loading)');
    expect(within(row).getByTestId('removable-row-skeleton')).toBeInTheDocument();
    fireEvent.click(row);
    expect(onRemove).toHaveBeenCalledOnce();

    rerender(<RemovableRow icon={Tag} label="Service: Spotify" onRemove={onRemove} testId="row" />);
    expect(screen.getByTestId('row')).not.toHaveAttribute('aria-busy');
    expect(screen.getByTestId('row')).toHaveAccessibleName('Remove Service: Spotify');
    expect(screen.queryByTestId('removable-row-skeleton')).not.toBeInTheDocument();
  });

  it('shows a comma before the skeleton after a value, which its name leaves out', () => {
    const { rerender } = render(
      <RemovableRow icon={Tag} label="Service: Amazon Music" isLoading onRemove={vi.fn()} testId="row" />,
    );

    expect(screen.getByTestId('row').textContent).toBe('Service: Amazon Music,');
    expect(screen.getByTestId('row')).toHaveAccessibleName('Remove Service: Amazon Music (loading)');

    // Its value read: no comma
    rerender(<RemovableRow icon={Tag} label="Service: Amazon Music" onRemove={vi.fn()} testId="row" />);
    expect(screen.getByTestId('row').textContent).toBe('Service: Amazon Music');
  });
});
