import { describe, expect, it } from 'vitest';
import { clusterMapPoints } from './resource.cluster';

const ZURICH_CAFE = { id: 'cafe', point: { lat: 47.3708689, lon: 8.5418241 } };
const ZURICH_CHURCH = { id: 'church', point: { lat: 47.3701214, lon: 8.5439115 } };
const BERLIN = { id: 'berlin', point: { lat: 52.5173885, lon: 13.3951309 } };

describe('clusterMapPoints', () => {
  it('shows points that are far apart on the map as pins of their own', () => {
    const clusters = clusterMapPoints([ZURICH_CAFE, BERLIN], 5);

    expect(clusters.map((cluster) => cluster.ids)).toEqual([['cafe'], ['berlin']]);
    expect(clusters[0]).toMatchObject({ point: ZURICH_CAFE.point, bounds: null });
  });

  it('groups points too close to tell apart at the map’s zoom, with the area they lie in', () => {
    const [cluster, other] = clusterMapPoints([ZURICH_CAFE, BERLIN, ZURICH_CHURCH], 5);

    expect(cluster.ids).toEqual(['cafe', 'church']);
    expect(cluster.bounds).toEqual([8.5418241, 47.3701214, 8.5439115, 47.3708689]);
    // The pin stands in the middle of its points
    expect(cluster.point.lat).toBeCloseTo((47.3708689 + 47.3701214) / 2, 6);
    expect(cluster.point.lon).toBeCloseTo((8.5418241 + 8.5439115) / 2, 6);
    expect(other.ids).toEqual(['berlin']);
  });

  it('tells the same points apart once the map is close enough', () => {
    expect(clusterMapPoints([ZURICH_CAFE, ZURICH_CHURCH], 17).map((cluster) => cluster.ids)).toEqual([
      ['cafe'],
      ['church'],
    ]);
  });

  it('keeps results at one spot as one pin at any zoom, with no area to zoom into', () => {
    const tonight = { id: 'tonight', point: ZURICH_CAFE.point };
    const [cluster] = clusterMapPoints([ZURICH_CAFE, tonight], 22);

    expect(cluster.ids).toEqual(['cafe', 'tonight']);
    expect(cluster.bounds).toBeNull();
  });

  it('gives each pin an id that stays the same for the same results', () => {
    const first = clusterMapPoints([ZURICH_CAFE, ZURICH_CHURCH, BERLIN], 5).map((cluster) => cluster.id);
    const again = clusterMapPoints([ZURICH_CAFE, ZURICH_CHURCH, BERLIN], 5).map((cluster) => cluster.id);

    expect(first).toEqual(again);
    expect(new Set(first).size).toBe(2);
  });

  it('floors a fractional zoom, as the map’s tiles do, and has no pins without points', () => {
    expect(clusterMapPoints([ZURICH_CAFE, ZURICH_CHURCH], 5.9)).toEqual(
      clusterMapPoints([ZURICH_CAFE, ZURICH_CHURCH], 5),
    );
    expect(clusterMapPoints([], 5)).toEqual([]);
  });
});
