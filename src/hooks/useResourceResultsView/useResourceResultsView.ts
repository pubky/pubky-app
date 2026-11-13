'use client';

import { useSearchParams } from 'next/navigation';

/** How a search of places or events shows its results: the list (events: the agenda) or the map. */
export type TResourceResultsView = 'list' | 'map';

/** The URL parameter the view is kept in; left out for the list. */
export const RESOURCE_RESULTS_VIEW_PARAM = 'view';
const MAP_VIEW = 'map';

/**
 * The view of a search of places or events, kept in the URL beside its filters so a map of results
 * can be shared and survives a reload. Changing it replaces the current history entry, as changing a
 * filter does (`useResourceSearchFilters`). It is no filter: it changes no search.
 */
export function useResourceResultsView(): {
  view: TResourceResultsView;
  setView: (view: TResourceResultsView) => void;
} {
  const searchParams = useSearchParams();
  return {
    view: searchParams?.get(RESOURCE_RESULTS_VIEW_PARAM) === MAP_VIEW ? 'map' : 'list',
    setView: (view) => {
      // The live URL, not the render's copy: a filter changed in the same event stays
      const params = new URLSearchParams(window.location.search);
      if (view === 'map') params.set(RESOURCE_RESULTS_VIEW_PARAM, MAP_VIEW);
      else params.delete(RESOURCE_RESULTS_VIEW_PARAM);
      const search = params.toString();
      const { pathname, hash } = window.location;
      // A `null` state is Next's documented way to keep `useSearchParams` in step
      window.history.replaceState(null, '', `${pathname}${search ? `?${search}` : ''}${hash}`);
    },
  };
}
