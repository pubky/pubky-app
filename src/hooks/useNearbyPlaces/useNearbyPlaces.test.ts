import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import cafeFixture from '@/services/pinakes/fixtures/by-uri.place-cafe.json';
import { useNearbyPlaces } from './useNearbyPlaces';

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
