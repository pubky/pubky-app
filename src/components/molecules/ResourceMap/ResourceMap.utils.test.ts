import { describe, expect, it } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import placeFixture from '@/services/pinakes/fixtures/by-uri.place.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { formatCoordinates, getMapPoint, getMapsDestination, getMapsLinks } from './ResourceMap.utils';

/** A café as Pinakes reads it from OpenStreetMap: a point and a street address. */
const CAFE = {
  ...placeFixture,
  type: 'CafeOrCoffeeShop',
  type_path: ['Thing', 'Organization', 'Place', 'LocalBusiness', 'FoodEstablishment', 'CafeOrCoffeeShop'],
  name: 'Conditorei schober',
  point: { lat: 47.3708689, lon: 8.5418241 },
  address: { street: 'Stegengasse', postcode: '8001', city: 'Zürich', country_code: 'ch' },
};

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

describe('getMapsDestination', () => {
  it('is a place’s point, with its name and address', () => {
    expect(getMapsDestination(CAFE, 'en')).toEqual({
      point: { lat: 47.3708689, lon: 8.5418241 },
      label: 'Conditorei schober',
      address: 'Stegengasse, 8001 Zürich, Switzerland',
    });
  });

  it('is an event’s point, named by its venue', () => {
    expect(getMapsDestination(eventFixture, 'en')).toEqual({
      point: { lat: 30.2651833, lon: -97.73810329999999 },
      label: 'Hilton Austin',
      address: null,
    });
  });

  it('is the address alone when a place has a street or a city but no point', () => {
    expect(getMapsDestination({ ...CAFE, point: null }, 'en')).toEqual({
      point: null,
      label: 'Conditorei schober',
      address: 'Stegengasse, 8001 Zürich, Switzerland',
    });
  });

  it('is nothing for an event without a place: no point is made up from its venue’s name', () => {
    const online = { ...eventFixture, point: null, attendance: 'online', venue: { id: null, name: 'Zoom' } };
    expect(getMapsDestination(online, 'en')).toBeNull();
    expect(getMapsDestination({ ...eventFixture, point: null, venue: null }, 'en')).toBeNull();
  });

  it('is nothing for a point that is not on the map and no address', () => {
    expect(getMapsDestination({ ...CAFE, point: { lat: 947, lon: 8 }, address: null }, 'en')).toBeNull();
  });

  it('is nothing for an address that names a country only', () => {
    expect(getMapsDestination({ ...CAFE, point: null, address: { country_code: 'ch' } }, 'en')).toBeNull();
  });

  it('is nothing for a card that is neither a place nor an event, even with a point', () => {
    expect(getMapsDestination({ ...videoFixture, point: { lat: 47, lon: 8 } }, 'en')).toBeNull();
  });
});

describe('getMapsLinks', () => {
  it('opens a point in each maps app, rounded to about a metre, with its name where the app shows one', () => {
    const links = getMapsLinks({
      point: { lat: 47.3708689, lon: 8.5418241 },
      label: 'Conditorei schober',
      address: 'Stegengasse, 8001 Zürich, Switzerland',
    });

    expect(links).toEqual({
      geo: 'geo:47.37087,8.54182?q=47.37087,8.54182(Conditorei%20schober)',
      apple: 'https://maps.apple.com/?ll=47.37087%2C8.54182&q=Conditorei+schober',
      google: 'https://www.google.com/maps/search/?api=1&query=47.37087%2C8.54182',
      osm: 'https://www.openstreetmap.org/?mlat=47.37087&mlon=8.54182#map=17/47.37087/8.54182',
    });
  });

  it('searches for the address when there is no point', () => {
    const links = getMapsLinks({ point: null, label: 'Henrici', address: 'Niederdorfstrasse 1, 8001 Zürich' });

    expect(links).toEqual({
      geo: 'geo:0,0?q=Niederdorfstrasse%201%2C%208001%20Z%C3%BCrich',
      apple: 'https://maps.apple.com/?q=Niederdorfstrasse+1%2C+8001+Z%C3%BCrich',
      google: 'https://www.google.com/maps/search/?api=1&query=Niederdorfstrasse+1%2C+8001+Z%C3%BCrich',
      osm: 'https://www.openstreetmap.org/search?query=Niederdorfstrasse+1%2C+8001+Z%C3%BCrich',
    });
  });

  it('keeps a name’s brackets and quotes out of the link’s own syntax', () => {
    const links = getMapsLinks({ point: { lat: 1, lon: 2 }, label: 'Bar (old) & "Grill"', address: null });

    expect(links.geo).toBe('geo:1,2?q=1,2(Bar%20%28old%29%20%26%20%22Grill%22)');
    expect(new URL(links.apple).searchParams.get('q')).toBe('Bar (old) & "Grill"');
  });

  it('names nothing in the link when the point has no name', () => {
    const links = getMapsLinks({ point: { lat: 1, lon: 2 }, label: null, address: null });

    expect(links.geo).toBe('geo:1,2?q=1,2');
    // The point itself is what Apple Maps pins when nothing names it
    expect(links.apple).toBe('https://maps.apple.com/?ll=1%2C2&q=1%2C2');
  });
});

describe('formatCoordinates', () => {
  it('writes a point as latitude, longitude, to about a metre', () => {
    expect(formatCoordinates({ lat: 47.3708689, lon: 8.5418241 })).toBe('47.37087, 8.54182');
    expect(formatCoordinates({ lat: -33.9, lon: 151 })).toBe('-33.9, 151');
  });
});
