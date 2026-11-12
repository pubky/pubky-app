'use client';

import { useEffect, useState } from 'react';
import { PINAKES_SEARCH_DEBOUNCE_MS } from '@/config/pinakes';
import { ResourceController, type TResourcePlace } from '@/controllers/resource/resource';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { hasCredentialLink } from '@/pipes/resource/resource.search';

/** Places offered for one name. */
const PLACES_SHOWN = 5;
/** Letters a name needs before places are looked up. */
const MIN_NAME_LENGTH = 2;

/**
 * The places Pinakes knows by `name` (`ResourceController.fetchPlaces`), asked once the name has
 * been still for `PINAKES_SEARCH_DEBOUNCE_MS`: for the search's Where, a place typed by name. A
 * name shorter than 2 letters, or one holding a link with credentials (`user:password@`), asks
 * nothing. A failed read offers no places and says so.
 */
export function useResourcePlaces(name: string): { places: TResourcePlace[]; loading: boolean; failed: boolean } {
  const query = name.trim();
  const isEnabled = query.length >= MIN_NAME_LENGTH && !hasCredentialLink(query);
  const [state, setState] = useState<{ query: string; places: TResourcePlace[]; failed: boolean } | null>(null);

  useEffect(() => {
    if (!isEnabled) return;
    let isCurrent = true;
    const timer = setTimeout(() => {
      ResourceController.fetchPlaces(query, PLACES_SHOWN).then(
        (places) => {
          if (isCurrent) setState({ query, places, failed: false });
        },
        (error: unknown) => {
          // AppErrors are logged by their factory
          if (!isAppError(error)) Logger.warn('Failed to look up places', error);
          if (isCurrent) setState({ query, places: [], failed: true });
        },
      );
    }, PINAKES_SEARCH_DEBOUNCE_MS);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query, isEnabled]);

  const current = isEnabled && state?.query === query ? state : null;
  return { places: current?.places ?? [], loading: isEnabled && current === null, failed: current?.failed ?? false };
}
