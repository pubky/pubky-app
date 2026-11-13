import { describe, expect, it } from 'vitest';
import nearbyFixture from '@/services/pinakes/fixtures/search.places-nearby.json';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { getMapPoint, getNearbyPlacesQuery, pickNearbyPlaces, RESOURCE_NEARBY_LIMIT } from './resource.places';
import { buildResourceSearchParams } from './resource.search';

const CAFE_POINT = { lat: 47.3708689, lon: 8.5418241 };
const NEARBY: TPinakesCard[] = nearbyFixture.items;
const CAFE_ID = 'c10fedfa853bcdbdd4b18d8257250518';

describe('getMapPoint', () => {
  it('keeps a point whose latitude and longitude are on the map', () => {
    expect(getMapPoint({ lat: 47.3708689, lon: 8.5418241 })).toEqual({ lat: 47.3708689, lon: 8.5418241 });
    expect(getMapPoint({ lat: -90, lon: 180 })).toEqual({ lat: -90, lon: 180 });
  });

  it.each([
    ['no point', null],
    ['no point at all', undefined],
    ['a latitude past the pole', { lat: 90.01, lon: 8 }],
    ['a longitude past the antimeridian', { lat: 47, lon: -180.5 }],
    ['a number that is not one', { lat: Number.NaN, lon: 8 }],
    ['an endless number', { lat: 47, lon: Number.POSITIVE_INFINITY }],
    ['text in place of numbers', { lat: '47.37', lon: '8.54' }],
    ['a missing longitude', { lat: 47 }],
  ])('has no point for %s', (_name, point) => {
    expect(getMapPoint(point)).toBeNull();
  });
});

describe('getNearbyPlacesQuery', () => {
  it('asks for the places around a point, nearest first, one more than are shown (the place itself is among them)', () => {
    const params = buildResourceSearchParams(getNearbyPlacesQuery(CAFE_POINT), { limit: RESOURCE_NEARBY_LIMIT });

    expect(params).toEqual({
      type: 'Place',
      sort: 'distance',
      near: '47.3708689,8.5418241',
      radius: '2000',
      collapse: 'group',
      limit: '7',
    });
  });
});

describe('pickNearbyPlaces', () => {
  it('leaves the place itself out and keeps the six nearest, in Pinakes’ order', () => {
    const picked = pickNearbyPlaces(NEARBY, { id: CAFE_ID });

    expect(picked).toHaveLength(6);
    expect(picked.map((card) => card.id)).not.toContain(CAFE_ID);
    expect(picked.map((card) => card.name)).toEqual(
      NEARBY.filter((card) => card.id !== CAFE_ID).map((card) => card.name),
    );
  });

  it('keeps six when the place itself is not in the list', () => {
    expect(pickNearbyPlaces(NEARBY, { id: 'another-place' })).toHaveLength(6);
  });

  it('leaves out the same place on another service: a member of the place’s own group', () => {
    const grouped = NEARBY.find((card) => card.group);
    const picked = pickNearbyPlaces(NEARBY, { id: 'another-place', group: grouped?.group });

    expect(grouped).toBeDefined();
    expect(picked.map((card) => card.id)).not.toContain(grouped?.id);
  });

  it('leaves out a row without a point on the map, and a row listed twice', () => {
    const [first, second] = NEARBY.filter((card) => card.id !== CAFE_ID);
    const rows = [first, { ...second, point: null }, first, { ...second, id: 'x', point: { lat: 947, lon: 8 } }];

    expect(pickNearbyPlaces(rows, { id: CAFE_ID })).toEqual([first]);
  });
});
