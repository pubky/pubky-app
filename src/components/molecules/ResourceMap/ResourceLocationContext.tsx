'use client';

import { createContext, type ReactNode, useContext } from 'react';

/**
 * How the place and event cards below say where they are. `map` (the default): a small map of the
 * point. `row`: one line (the address, else the coordinates) ending in "Open in Maps", for cards
 * whose point a map beside them already shows (a selected pin's card, a place's Nearby list), so a
 * list of cards does not draw one map each.
 */
export type ResourceLocationVariant = 'map' | 'row';

const ResourceLocationContext = createContext<ResourceLocationVariant>('map');

/** Sets how the resource cards below say where they are (see `ResourceLocationVariant`). */
export function ResourceLocationProvider({
  variant,
  children,
}: {
  variant: ResourceLocationVariant;
  children: ReactNode;
}) {
  return <ResourceLocationContext.Provider value={variant}>{children}</ResourceLocationContext.Provider>;
}

/** How the calling card says where it is (see `ResourceLocationVariant`). */
export function useResourceLocationVariant(): ResourceLocationVariant {
  return useContext(ResourceLocationContext);
}
