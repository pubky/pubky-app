'use client';

import { MapPin } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { MAP_DETAIL_ZOOM, MAP_PREVIEW_ZOOM } from '@/config/maps';
import { useResourceLocationVariant } from './ResourceLocationContext';
import { ResourceMap } from './ResourceMap';
import { formatCoordinates, type TMapsDestination } from './ResourceMap.utils';
import { ResourceMapsMenu } from './ResourceMapsMenu';

interface ResourceLocationProps {
  /** The pin's id on the map (the card's). */
  id: string;
  /** Where the place or event is (`getMapsDestination`). */
  destination: TMapsDestination;
  /** `large` on the resource page's card: the larger, closer map. */
  size?: 'default' | 'large';
}

/** What the location line says: the address, else the coordinates; `null` when it has neither. */
export function getLocationRowText(destination: TMapsDestination): string | null {
  return destination.address ?? (destination.point ? formatCoordinates(destination.point) : null);
}

/** Whether the destination shows as a line instead of a map: no point to draw, or a map beside the card shows it. */
export function isLocationRow(destination: TMapsDestination, variant: 'map' | 'row'): boolean {
  return variant === 'row' || destination.point === null;
}

/**
 * Where a place or an event is, on its card: a map of its point with "Open in Maps" on the corner
 * (`ResourceMap`, a preview until tapped), or, without a point or where a map beside the card
 * already shows it (`ResourceLocationProvider` `row`), one line ending in the same "Open in Maps".
 */
export function ResourceLocation({ id, destination, size = 'default' }: ResourceLocationProps) {
  const variant = useResourceLocationVariant();
  const { point, label } = destination;
  const menu = <ResourceMapsMenu destination={destination} />;

  if (point && !isLocationRow(destination, variant)) {
    const name = label ?? formatCoordinates(point);
    return (
      <ResourceMap
        markers={[{ id, point, label: name }]}
        label={`Map of ${name}`}
        size={size === 'large' ? 'large' : 'small'}
        zoom={size === 'large' ? MAP_DETAIL_ZOOM : MAP_PREVIEW_ZOOM}
        corner={menu}
      />
    );
  }
  return (
    <Container
      overrideDefaults
      data-resource-controls
      data-testid="resource-location-row"
      className="flex min-w-0 cursor-auto items-center justify-between gap-3"
    >
      <Container overrideDefaults className="flex min-w-0 items-start gap-1.5 text-muted-foreground">
        <MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        <Typography as="span" size="sm" dir="auto" className="font-normal wrap-anywhere text-muted-foreground">
          {getLocationRowText(destination)}
        </Typography>
      </Container>
      {menu}
    </Container>
  );
}
