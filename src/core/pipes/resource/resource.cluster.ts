import type { TPinakesPoint } from '@/services/pinakes/pinakes.types';

/** One pin of a map of results: a result of its own, or several too close to tell apart. */
export type TMapCluster = {
  /** Stable for the same results: their ids. */
  id: string;
  /** Where the pin stands: the middle of its results. */
  point: TPinakesPoint;
  /** The results it stands for, in the order they came. */
  ids: string[];
  /** West, south, east, north of its results; `null` when they are all at one spot. */
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
 * The pins of a map of results at `zoom`: results nearer than a pin's width on screen share one,
 * which then counts them. Done in the browser over the results already read (one page, or the
 * pages loaded so far): nothing is asked of Pinakes. Each result joins the first pin it is near,
 * in the order the results came, so the same results give the same pins.
 */
export function clusterMapPoints(points: readonly { id: string; point: TPinakesPoint }[], zoom: number): TMapCluster[] {
  const level = Math.floor(zoom);
  const groups: { x: number; y: number; members: { id: string; point: TPinakesPoint }[] }[] = [];
  for (const item of points) {
    const { x, y } = project(item.point, level);
    const near = groups.find((group) => Math.hypot(group.x - x, group.y - y) <= CLUSTER_RADIUS_PX);
    if (near) near.members.push(item);
    else groups.push({ x, y, members: [item] });
  }
  return groups.map(({ members }) => {
    const lats = members.map((member) => member.point.lat);
    const lons = members.map((member) => member.point.lon);
    const [south, north] = [Math.min(...lats), Math.max(...lats)];
    const [west, east] = [Math.min(...lons), Math.max(...lons)];
    const isOneSpot = south === north && west === east;
    return {
      id: JSON.stringify(members.map((member) => member.id)),
      point: { lat: (south + north) / 2, lon: (west + east) / 2 },
      ids: members.map((member) => member.id),
      bounds: isOneSpot ? null : [west, south, east, north],
    };
  });
}
