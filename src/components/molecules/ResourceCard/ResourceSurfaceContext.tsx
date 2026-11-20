'use client';

import { createContext, type ReactNode, useContext } from 'react';

/**
 * The surface an external resource card stands on. `embed` (the default): inside a post, on the
 * app's embedded-post surface (`bg-embed`, like a quoted post), its pills filled with the card
 * colour. `card`: the card stands on the post card's surface (`bg-card`) with the post's own pills,
 * as the resource page's large card does, in the normal card's layout (only the colours change):
 * where it is the item itself, in no post (a collection's items), and inside a quoted or reposted
 * post on the embed surface, so the levels alternate card, embed, card.
 */
export type ResourceSurface = 'embed' | 'card';

const ResourceSurfaceContext = createContext<ResourceSurface>('embed');

/** Puts the resource cards below on `surface` (see `ResourceSurface`). */
export function ResourceSurfaceProvider({ surface, children }: { surface: ResourceSurface; children: ReactNode }) {
  return <ResourceSurfaceContext.Provider value={surface}>{children}</ResourceSurfaceContext.Provider>;
}

/** The surface the calling resource card stands on (see `ResourceSurface`). */
export function useResourceSurface(): ResourceSurface {
  return useContext(ResourceSurfaceContext);
}
