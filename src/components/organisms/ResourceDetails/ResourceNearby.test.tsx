import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResourceLocationVariant } from '@/molecules/ResourceMap/ResourceLocationContext';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import cafeFixture from '@/services/pinakes/fixtures/by-uri.place-cafe.json';
import { ResourceNearby } from './ResourceNearby';

const mocks = vi.hoisted(() => ({
  read: { data: null as string[] | null | undefined, isLoading: false, isError: false },
  asked: [] as unknown[],
}));

vi.mock('@/hooks/useNearbyPlaces/useNearbyPlaces', () => ({
  useNearbyPlaces: (card: unknown) => {
    mocks.asked.push(card);
    return mocks.read;
  },
}));
// Each nearby place is the app's own card of it (its tags and actions): here, that it is asked for
vi.mock('@/molecules/ResourceCard/ResourceItem', () => ({
  ResourceItem: function ResourceItemStub({ uri }: { uri: string }) {
    return <div data-testid="nearby-item" data-uri={uri} data-location={useResourceLocationVariant()} />;
  },
}));

const PLACES = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => `https://www.openstreetmap.org/node/${id}`);

describe('ResourceNearby', () => {
  beforeEach(() => {
    mocks.read = { data: PLACES, isLoading: false, isError: false };
    mocks.asked.length = 0;
  });

  it('lists the places around a place as their own cards, under Nearby', () => {
    render(<ResourceNearby card={cafeFixture} />);

    const section = screen.getByRole('region', { name: 'Nearby' });
    expect(within(section).getByRole('heading', { name: 'Nearby' })).toBeInTheDocument();
    const items = within(section).getAllByTestId('nearby-item');
    expect(items.map((item) => item.getAttribute('data-uri'))).toEqual(PLACES);
    expect(section).toHaveAttribute('aria-busy', 'false');
  });

  it('shows each nearby place’s whereabouts as a line with Open in Maps, not one more map each', () => {
    render(<ResourceNearby card={cafeFixture} />);

    for (const item of screen.getAllByTestId('nearby-item')) {
      expect(item).toHaveAttribute('data-location', 'row');
    }
  });

  it('says quietly that Pubky Maps is coming, with nothing to press', () => {
    render(<ResourceNearby card={cafeFixture} />);

    const hint = screen.getByTestId('resource-nearby-hint');
    expect(hint).toHaveTextContent('Pubky Maps is coming');
    expect(within(hint).queryByRole('button')).toBeNull();
    expect(within(hint).queryByRole('link')).toBeNull();
  });

  it('shows the loading cards while the places are read', () => {
    mocks.read = { data: undefined, isLoading: true, isError: false };
    render(<ResourceNearby card={cafeFixture} />);

    expect(screen.getByRole('region', { name: 'Nearby' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('resource-nearby-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('nearby-item')).toBeNull();
  });

  it('says so when nothing else is nearby', () => {
    mocks.read = { data: [], isLoading: false, isError: false };
    render(<ResourceNearby card={cafeFixture} />);

    expect(screen.getByTestId('resource-nearby-message')).toHaveTextContent('No other places nearby yet');
  });

  it('says so when the places could not be read', () => {
    mocks.read = { data: null, isLoading: false, isError: true };
    render(<ResourceNearby card={cafeFixture} />);

    expect(screen.getByTestId('resource-nearby-message')).toHaveTextContent('Nearby places could not be loaded');
  });

  it('is not there for a card that has no Nearby to read (an event, a place without a point)', () => {
    // What the read answers for such a card: settled, nothing, no failure
    mocks.read = { data: null, isLoading: false, isError: false };
    render(<ResourceNearby card={eventFixture} />);

    expect(mocks.asked).toEqual([eventFixture]);
    expect(screen.queryByRole('region', { name: 'Nearby' })).toBeNull();
    expect(screen.queryByTestId('resource-nearby-hint')).toBeNull();
  });
});
