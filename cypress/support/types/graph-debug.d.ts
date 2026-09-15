// QA surface published by debug builds (see src/hooks/useGraphDebug); the
// cypress TS project does not include src, so the shape is mirrored here.
interface Window {
  __graphDebug?: {
    nodeIds: () => Record<'user' | 'post' | 'tag' | 'profile_tag', string[]>;
    screenPositionOf: (nodeId: string) => { x: number; y: number } | null;
    screenMidpointOf: (aId: string, bId: string) => { x: number; y: number } | null;
    pinnedIds: () => string[];
    settled: () => boolean;
    zoom: () => number | null;
    hoveredId: () => string | null;
    focusId: () => string | null;
    pathIds: () => string[] | null;
    setPaused: (paused: boolean) => void;
  };
}
