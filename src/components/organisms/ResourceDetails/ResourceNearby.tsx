'use client';

import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { type TNearbyPlaceCard, useNearbyPlaces } from '@/hooks/useNearbyPlaces/useNearbyPlaces';
import { ResourceItem } from '@/molecules/ResourceCard/ResourceItem';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { ResourceLocationProvider } from '@/molecules/ResourceMap/ResourceLocationContext';

/** Cards shown as skeletons while the places are read. */
const LOADING_CARDS = 2;

interface ResourceNearbyProps {
  /** The page's card. */
  card: TNearbyPlaceCard;
}

/**
 * Nearby, on a place's page under its card: the places around it, nearest first
 * (`useNearbyPlaces`), each as the app's own card of it with its tags and actions (`ResourceItem`).
 * The page's map already shows where they all are, so each card says where it is as a line ending
 * in "Open in Maps" instead of a map of its own. Shown while read, when nothing else is near and
 * when the read failed; not there for a card that is no place or has no point. One quiet line says
 * Pubky Maps is coming: nothing to press.
 */
export function ResourceNearby({ card }: ResourceNearbyProps) {
  const { data, isLoading, isError } = useNearbyPlaces(card);
  // Settled with nothing and no failure: the card has no Nearby to read
  if (data === null && !isError) return null;
  const uris = data ?? [];
  const message = isError
    ? 'Nearby places could not be loaded.'
    : !isLoading && uris.length === 0
      ? 'No other places nearby yet.'
      : null;

  return (
    <Container
      as="section"
      overrideDefaults
      aria-label="Nearby"
      aria-busy={isLoading}
      data-testid="resource-nearby"
      className="mt-6 flex min-w-0 flex-col gap-3"
    >
      <Heading level={2} size="lg" className="font-light text-muted-foreground">
        Nearby
      </Heading>
      {isLoading ? (
        <ResourceSurfaceProvider surface="card">
          <Container
            overrideDefaults
            aria-hidden="true"
            data-testid="resource-nearby-loading"
            className="grid grid-cols-1 gap-3"
          >
            {Array.from({ length: LOADING_CARDS }, (_, index) => (
              <ResourceCardSkeleton key={index} withActions />
            ))}
          </Container>
        </ResourceSurfaceProvider>
      ) : message ? (
        <Typography size="sm" data-testid="resource-nearby-message" className="font-normal text-muted-foreground">
          {message}
        </Typography>
      ) : (
        <ResourceLocationProvider variant="row">
          <Container overrideDefaults className="grid grid-cols-1 gap-3">
            {uris.map((uri) => (
              <ResourceItem key={uri} uri={uri} data-testid="resource-nearby-item" />
            ))}
          </Container>
        </ResourceLocationProvider>
      )}
      <Typography size="xs" data-testid="resource-nearby-hint" className="font-normal text-muted-foreground">
        Pubky Maps is coming.
      </Typography>
    </Container>
  );
}
