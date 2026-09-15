// Minimal surface of d3-force-3d (transitive dependency of force-graph, no
// bundled types); the graph canvas pulls its collision and positioning forces.
declare module 'd3-force-3d' {
  export function forceCollide(radius?: number | ((node: unknown) => number)): unknown;
  export function forceX(x?: number): { strength(strength: number): unknown };
  export function forceY(y?: number): { strength(strength: number): unknown };
}
