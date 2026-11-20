import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import cafeFixture from '@/services/pinakes/fixtures/by-uri.place-cafe.json';
import { type TNearbyPlaceCard, useNearbyPlaces } from './useNearbyPlaces';

const mocks = vi.hoisted(() => ({ configured: true, fetchNearbyPlaces: vi.fn() }));

vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: () => mocks.configured,
}));
vi.mock('@/controllers/resource/resource', () => ({
  ResourceController: { fetchNearbyPlaces: mocks.fetchNearbyPlaces },
}));

describe('useNearbyPlaces', () => {
  beforeEach(() => {
    mocks.configured = true;
    mocks.fetchNearbyPlaces.mockReset().mockResolvedValue(['https://www.openstreetmap.org/node/633601362']);
  });

  it('reads the places around a place’s point, telling which card is the place itself', async () => {
    const { result } = renderHook(() => useNearbyPlaces(cafeFixture));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(['https://www.openstreetmap.org/node/633601362']));
    expect(mocks.fetchNearbyPlaces).toHaveBeenCalledTimes(1);
    expect(mocks.fetchNearbyPlaces).toHaveBeenCalledWith({
      point: { lat: 47.3708689, lon: 8.5418241 },
      self: { id: cafeFixture.id, group: cafeFixture.group },
    });
  });

  it('reads again when the place’s card gains a group or changes it: the group’s other cards are the place itself', async () => {
    const alone: TNearbyPlaceCard = { ...cafeFixture, group: null };
    const grouped: TNearbyPlaceCard = { ...cafeFixture, group: { id: 'group-1', size: 2 } };
    const regrouped: TNearbyPlaceCard = { ...cafeFixture, group: { id: 'group-2', size: 3 } };
    mocks.fetchNearbyPlaces
      .mockResolvedValueOnce(['https://example.com/the-same-cafe-elsewhere', 'https://example.com/next-door'])
      .mockResolvedValue(['https://example.com/next-door']);
    const { result, rerender } = renderHook(({ card }) => useNearbyPlaces(card), { initialProps: { card: alone } });
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    // The same card (id and point), read again with the group Pinakes has put it in
    rerender({ card: grouped });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(['https://example.com/next-door']));
    expect(mocks.fetchNearbyPlaces).toHaveBeenCalledTimes(2);
    expect(mocks.fetchNearbyPlaces).toHaveBeenLastCalledWith({
      point: { lat: 47.3708689, lon: 8.5418241 },
      self: { id: cafeFixture.id, group: grouped.group },
    });

    rerender({ card: regrouped });
    await waitFor(() => expect(mocks.fetchNearbyPlaces).toHaveBeenCalledTimes(3));
    expect(mocks.fetchNearbyPlaces).toHaveBeenLastCalledWith(
      expect.objectContaining({ self: { id: cafeFixture.id, group: regrouped.group } }),
    );

    // The same group again, as another object: nothing is read
    rerender({ card: { ...regrouped, group: { id: 'group-2', size: 3 } } });
    expect(result.current.isLoading).toBe(false);
    expect(mocks.fetchNearbyPlaces).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['an event, even one with a point', eventFixture],
    ['a place without a point', { ...cafeFixture, point: null }],
    ['a place whose point is not on the map', { ...cafeFixture, point: { lat: 947, lon: 8 } }],
    ['no card', null],
  ])('reads nothing for %s', (_name, card) => {
    const { result } = renderHook(() => useNearbyPlaces(card));

    expect(result.current).toEqual({ data: null, isLoading: false, isError: false });
    expect(mocks.fetchNearbyPlaces).not.toHaveBeenCalled();
  });

  it('reads nothing without Pinakes', () => {
    mocks.configured = false;
    renderHook(() => useNearbyPlaces(cafeFixture));

    expect(mocks.fetchNearbyPlaces).not.toHaveBeenCalled();
  });

  it('says so when the read fails', async () => {
    mocks.fetchNearbyPlaces.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useNearbyPlaces(cafeFixture));

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
