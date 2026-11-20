import type { TPinakesPoint } from '@/services/pinakes/pinakes.types';

/** One pin of a map of results: a result of its own, or several too close to tell apart. */
export type TMapCluster = {
  /** Stable for the same results: their ids. */
  id: string;
  /** Where the pin stands: the middle of its results. */
  point: TPinakesPoint;
  /** The results it stands for, in the order they came. */
  ids: string[];
  /** West, south, east, north of its results (`getPointsBounds`); `null` when they are all at one spot. */
  bounds: [number, number, number, number] | null;
};

/** The side of the world map at zoom 0, in pixels (Web Mercator, as the tiles are cut). */
const TILE_SIZE_PX = 256;
/** Results nearer than this on screen share a pin: about a pin's own width. */
const CLUSTER_RADIUS_PX = 40;

/** A point on the world map at `zoom`, in pixels (Web Mercator). */
function project({ lat, lon }: TPinakesPoint, zoom: number): { x: number; y: number } {
  const size = TILE_SIZE_PX * 2 ** zoom;
  const sin = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/**
 * The box of some points as west, south, east, north; `null` for none. Longitudes are taken the
 * short way round: points either side of the antimeridian (179.9° and −179.9°) are neighbours, so
 * their box runs from the eastern one on past 180° (`[179.9, …, 180.1, …]`, as MapLibre reads a
 * box that crosses it), not around the world.
 */
export function getPointsBounds(points: readonly TPinakesPoint[]): [number, number, number, number] | null {
  if (points.length === 0) return null;
  const lats = points.map((point) => point.lat);
  const lons = [...new Set(points.map((point) => point.lon))].sort((a, b) => a - b);
  let [west, east] = [lons[0], lons[lons.length - 1]];
  // Leaving out the widest gap between two neighbours gives the narrowest box
  for (let index = 1; index < lons.length; index++) {
    const wrapped = 360 - (lons[index] - lons[index - 1]);
    if (wrapped < east - west) [west, east] = [lons[index], lons[index - 1] + 360];
  }
  return [west, Math.min(...lats), east, Math.max(...lats)];
}

/** A longitude within −180° to 180°; one already there is left as it is. */
const wrapLongitude = (lon: number) => (lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon);

/**
 * The pins of a map of results at `zoom`: results nearer than a pin's width on screen share one,
 * which then counts them. Done in the browser over the results already read (one page, or the
 * pages loaded so far, at most `MAP_RESULTS_MAX`): nothing is asked of Pinakes. Each result joins
 * the first pin it is near, in the order the results came, so the same results give the same pins.
 * Nearness is measured the short way round the world, so neighbours across the antimeridian share
 * a pin, which stands between them.
 */
export function clusterMapPoints(points: readonly { id: string; point: TPinakesPoint }[], zoom: number): TMapCluster[] {
  const level = Math.floor(zoom);
  const world = TILE_SIZE_PX * 2 ** level;
  const groups: { x: number; y: number; members: { id: string; point: TPinakesPoint }[] }[] = [];
  for (const item of points) {
    const { x, y } = project(item.point, level);
    const near = groups.find((group) => {
      const across = Math.abs(group.x - x);
      return Math.hypot(Math.min(across, world - across), group.y - y) <= CLUSTER_RADIUS_PX;
    });
    if (near) near.members.push(item);
    else groups.push({ x, y, members: [item] });
  }
  return groups.map(({ members }) => {
    const [west, south, east, north] = getPointsBounds(members.map((member) => member.point)) ?? [0, 0, 0, 0];
    const isOneSpot = south === north && west === east;
    return {
      id: JSON.stringify(members.map((member) => member.id)),
      point: { lat: (south + north) / 2, lon: wrapLongitude((west + east) / 2) },
      ids: members.map((member) => member.id),
      bounds: isOneSpot ? null : [west, south, east, north],
    };
  });
}
